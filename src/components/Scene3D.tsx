import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import * as THREE from 'three'
import { CameraController } from './CameraController'
import { RendererManager } from './renderers/RendererManager'
import { SelectionRenderer } from './renderers/SelectionRenderer'
import { SelectionHandler } from './ui-handlers/SelectionHandler'
import { SceneObject } from './renderers/BaseRenderer'
import { TerrainRenderer } from './renderers/TerrainRenderer'
import { MapLogic } from '../../logic/map/map-logic'
import { mapInit } from '../../logic/map/map-init'
import { ResourcesBar } from './ResourcesBar'
import { CommandPanel } from './CommandPanel'

const Scene3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null)
  const animationIdRef = useRef<number>()
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const isRightMouseDownRef = useRef(false)
  const isLeftMouseDownRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragEndRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const rendererManagerRef = useRef<RendererManager | null>(null)
      const selectionRendererRef = useRef<SelectionRenderer | null>(null)
    const selectionHandlerRef = useRef<SelectionHandler | null>(null)
  const visibleObjectsRef = useRef<SceneObject[]>([])
  const mapLogicRef = useRef<MapLogic | null>(null)
  const terrainRendererRef = useRef<TerrainRenderer | null>(null)
  const areaSelectionModeRef = useRef<{ isActive: boolean; commandGroup: any; radius: number } | null>(null)

  const lastCameraPositionRef = useRef<{ x: number; y: number; z: number } | null>(null)
  
  // Дебаг змінні - робимо їх реактивними
  const [fps, setFps] = useState(0)
  const [visibleObjectsCount, setVisibleObjectsCount] = useState(0)
  const [totalObjectsCount, setTotalObjectsCount] = useState(0)
  const [viewportData, setViewportData] = useState({ centerX: 0, centerY: 0, width: 0, height: 0 })
  const [gridInfo, setGridInfo] = useState({ totalCells: 0, visibleCells: 0 })
  const [currentDistance, setCurrentDistance] = useState(0)


  // Використовуємо useState для вибраних юнітів
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  
  // Функція для оновлення вибраних юнітів
  const updateSelectedUnits = useCallback(() => {
    if (mapLogicRef.current) {
      const currentSelected = mapLogicRef.current.selection.getSelectedObjects();
      setSelectedUnits(currentSelected);
    }
  }, []);

  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  // Callback для підтвердження області
  const handleAreaConfirm = useCallback((position: { x: number; y: number; z: number }) => {
    if (areaSelectionModeRef.current?.commandGroup) {
      console.log('[Scene3D] Area confirmed for command:', areaSelectionModeRef.current.commandGroup.id, 'at position:', position);
      
      // Конвертуємо 2D координати в 3D світові координати
      const worldPosition = getWorldPositionFromMouse(position.x, position.y);
      console.log('[Scene3D] Converted to world position:', worldPosition);
      
      // Запускаємо команду
      handleCommandSelect(areaSelectionModeRef.current.commandGroup, worldPosition);
      
      // Скидаємо режим вибору області
      areaSelectionModeRef.current = { isActive: false, commandGroup: null, radius: 50 };
    }
  }, []);

  // Callback для скасування області
  const handleAreaCancel = useCallback(() => {
    console.log('[Scene3D] Area selection cancelled');
    if (areaSelectionModeRef.current) {
      areaSelectionModeRef.current = { isActive: false, commandGroup: null, radius: 50 };
    }
  }, []);

  // Обробник вибору команди
  const handleCommandSelect = useCallback((commandGroup: any, centerPosition: { x: number; y: number; z: number }) => {
    console.log(`[CommandPanel] Selected command: ${commandGroup.id} at position:`, centerPosition);
    console.log(`[CommandPanel] Current selectedUnits:`, selectedUnits);
    
    // Тут буде логіка запуску команди для всіх вибраних юнітів
    if (selectedUnits.length > 0 && mapLogicRef.current) {
      // Запускаємо команду для кожного вибраного юніта
      selectedUnits.forEach((unitId: string) => {
        const context = {
          objectId: unitId,
          targets: { center: centerPosition },
          parameters: {}
        };
        
        console.log(`[CommandPanel] Adding command group for ${unitId} with context:`, context);
        
        const success = mapLogicRef.current?.commandGroupSystem.addCommandGroup(
          unitId,
          commandGroup.id,
          context
        );
        
        if (success) {
          console.log(`[CommandPanel] Command ${commandGroup.id} started for ${unitId}`);
        } else {
          console.error(`[CommandPanel] Failed to start command ${commandGroup.id} for ${unitId}`);
        }
      });
      
      // Перевіряємо стан селекції після додавання команди
      setTimeout(() => {
        if (mapLogicRef.current) {
          const currentSelected = mapLogicRef.current.selection.getSelectedObjects();
          console.log(`[CommandPanel] Selected objects after command:`, currentSelected);
        }
      }, 100);
    }
  }, [selectedUnits]);

  // Створюємо сцену
  const scene = useMemo(() => {
    const newScene = new THREE.Scene()
    newScene.background = new THREE.Color('#6a5f3e') // Загадково жовтуватий колір
    
    // Додаємо ambient light для загального освітлення
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6) // Збільшуємо інтенсивність (було 0.4)
    newScene.add(ambientLight)
    
    // Додаємо directional light (сонце) для тіней та об'ємності
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 100, 50) // Високо над сценою
    directionalLight.castShadow = true
    
    // Покращуємо якість тіней
    directionalLight.shadow.mapSize.width = 4096  // Збільшуємо з 2048
    directionalLight.shadow.mapSize.height = 4096 // Збільшуємо з 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.left = -100
    directionalLight.shadow.camera.right = 100
    directionalLight.shadow.camera.top = 100
    directionalLight.shadow.camera.bottom = -100
    
    // Налаштовуємо shadow bias для кращої якості
    directionalLight.shadow.bias = -0.0001
    directionalLight.shadow.normalBias = 0.02
    directionalLight.shadow.radius = 2 // Розмиваємо краї тіней
    
    newScene.add(directionalLight)
    
    return newScene
  }, [])

  // Створюємо камеру
  const camera = useMemo(() => {
    const newCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    newCamera.position.set(5, 5, 5)
    return newCamera
  }, [])



  // Створюємо рендерер
  const renderer = useMemo(() => {
    const newRenderer = new THREE.WebGLRenderer({ antialias: true })
    newRenderer.setSize(window.innerWidth, window.innerHeight)
    newRenderer.shadowMap.enabled = true
    newRenderer.shadowMap.type = THREE.PCFSoftShadowMap
    return newRenderer
  }, [])

  // Функція для конвертації 2D координат мишки в 3D світові координати
  const getWorldPositionFromMouse = useCallback((mouseX: number, mouseY: number) => {
    if (!camera || !renderer) return { x: 0, y: 0, z: 0 };
    
    const mouse = new THREE.Vector2();
    mouse.x = (mouseX / window.innerWidth) * 2 - 1;
    mouse.y = -(mouseY / window.innerHeight) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    console.log(`[Scene3D] Mouse (${mouseX}, ${mouseY}) -> World (${intersectionPoint.x.toFixed(2)}, ${intersectionPoint.y.toFixed(2)}, ${intersectionPoint.z.toFixed(2)})`);
    
    return {
      x: intersectionPoint.x,
      y: intersectionPoint.y,
      z: intersectionPoint.z
    };
  }, [camera, renderer]);

  // Створюємо контролер камери
  const cameraController = useMemo(() => {
    const newController = new CameraController(camera, renderer.domElement, {
      enableDamping: true,
      dampingFactor: 0.05,
      minDistance: 1,
      maxDistance: 25,
      panSpeed: 0.05,
      rotateSpeed: 0.01,
      zoomSpeed: 0.2
    })
    
    // Налаштовуємо callback'и
    newController.setOnTargetChange((target) => {
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          const terrainHeight = terrainManager.getHeightAt(target.x, target.z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(target.y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - target.y;
            
            // Піднімаємо точку фокусу на висоту terrain
            target.y = terrainHeight;
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
        }
      }
    })
    
    newController.setOnCameraMove((camera) => {
      // Оновлюємо viewport при руху камери
      if (mapLogicRef.current) {
        const cameraProps = {
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
          },
          rotation: {
            x: camera.rotation.x,
            y: camera.rotation.y,
            z: camera.rotation.z
          },
          fov: camera.fov,
          aspect: camera.aspect,
          distance: camera.position.distanceTo(newController.getTarget())
        };
        mapLogicRef.current.scene.updateViewport(cameraProps);
      }
    })
    
    newController.setOnDragStart((start) => {
      dragStartRef.current = start;
      dragEndRef.current = start;
      isDraggingRef.current = false;
    })
    
    newController.setOnDragEnd((end) => {
      dragEndRef.current = end;
      if (isDraggingRef.current) {
        handleDragSelection();
      }
    })
    
    newController.setOnSelection((event) => {
      handleObjectSelection(event);
    })
    
    newController.setOnSetTarget((event) => {
      // Якщо активний режим вибору області - не обробляємо ПКМ
      if (areaSelectionModeRef.current?.isActive) {
        console.log('[Scene3D] Area selection mode active, ignoring right click');
        return;
      }
      handleSetRoverTarget(event);
    })
    
    // Налаштовуємо функцію отримання висоти terrain
    newController.setGetTerrainHeight((x, z) => {
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        return terrainManager ? terrainManager.getHeightAt(x, z) : undefined;
      }
      return undefined;
    })
    
    return newController
  }, [camera, renderer])

  // Ініціалізуємо менеджер рендерерів та SceneLogic (тільки один раз)
  useEffect(() => {
    if (scene) {
              rendererManagerRef.current = new RendererManager(scene, renderer);
                      selectionRendererRef.current = new SelectionRenderer(
            scene, 
            (id: string) => rendererManagerRef.current?.getMeshById(id) || null,
            (id: string) => mapLogicRef.current?.scene.getObjectById(id) || null
        );
        mapLogicRef.current = mapInit();
        
        // Створюємо SelectionHandler після mapLogic
        selectionHandlerRef.current = new SelectionHandler(
            mapLogicRef.current.selection,
            selectionRendererRef.current,
            rendererManagerRef.current,
            camera
        );
      
      // Ініціалізуємо TerrainRenderer після створення mapLogic
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        console.log('TerrainManager:', terrainManager);

        if (terrainManager) {
          // Створюємо TerrainRenderer
          terrainRendererRef.current = new TerrainRenderer(scene, terrainManager);
          console.log('TerrainRenderer created');
          
          // Рендеримо terrain (очікуємо завантаження текстур)
          terrainRendererRef.current.renderTerrain({
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z
          }).then(() => {
              console.log('Initial terrain rendered');
          }).catch(error => {
              console.error('Failed to render initial terrain:', error);
          });
        } else {
          console.log('TerrainManager is null!');
        }
      }
      
      console.log('CALL INIT');
    }
  }, [scene]); // Тільки scene як залежність

  // Оновлюємо viewport при зміні камери
  useEffect(() => {
    if (mapLogicRef.current && scene) {
      // Передаємо дані камери в initMap
      const cameraProps = {
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        },
        rotation: {
          x: camera.rotation.x,
          y: camera.rotation.y,
          z: camera.rotation.z
        },
        fov: camera.fov,
        aspect: camera.aspect,
        distance: camera.position.distanceTo(cameraController.getTarget()) // Відстань до точки фокусу
      };
      
      mapLogicRef.current.initMap(cameraProps);
      
      // Оновлюємо viewport при ініціалізації
      if (mapLogicRef.current) {
        mapLogicRef.current.scene.updateViewport(cameraProps);
        
        // Коригуємо висоту на основі terrain
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - cameraController.getTarget().y;
            
            // Піднімаємо точку фокусу на висоту terrain
            cameraController.setTarget(new THREE.Vector3(
              cameraController.getTarget().x,
              terrainHeight,
              cameraController.getTarget().z
            ));
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
          
          // Створюємо TerrainRenderer якщо він ще не створений
          
          if (!terrainRendererRef.current) {
            terrainRendererRef.current = new TerrainRenderer(scene, terrainManager);
            console.log('TerrainRenderer created in updateViewport');
            
            // Рендеримо terrain (очікуємо завантаження текстур)
            terrainRendererRef.current.renderTerrain({
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            }).then(() => {
                console.log('Terrain rendered in updateViewport');
            }).catch(error => {
                console.error('Failed to render terrain:', error);
            });
          }
        }
      }
    }
  }, [scene, camera, cameraController]);

  // Функція для оновлення terrain при руху камери
  const updateTerrainForCamera = () => {
    if (terrainRendererRef.current && mapLogicRef.current) {
      const terrainManager = mapLogicRef.current.scene.getTerrainManager();
      if (terrainManager) {
        // Оновлюємо terrain з новою позицією камери
        terrainRendererRef.current.updateTerrain({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        });
      }
    }
  };

  // Функція для перевірки та генерації нового terrain
  const checkAndGenerateTerrain = () => {
    if (!terrainRendererRef.current || !mapLogicRef.current) return;
    
    const terrainManager = mapLogicRef.current.scene.getTerrainManager();
    if (!terrainManager) return;
    
    // Перевіряємо, чи камера значно змінила позицію (більше ніж на 50 одиниць)
    const lastPos = lastCameraPositionRef.current;
    if (lastPos) {
      const distance = Math.sqrt(
        Math.pow(camera.position.x - lastPos.x, 2) + 
        Math.pow(camera.position.z - lastPos.z, 2)
      );
      
      // Якщо камера змінилася значно - генеруємо новий terrain
      if (distance > 50) {
        console.log('Generating new terrain at:', camera.position);
        
        terrainRendererRef.current.renderTerrain({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        }).then(() => {
          console.log('New terrain generated successfully');
        }).catch(error => {
          console.error('Failed to generate new terrain:', error);
        });
        
        // Оновлюємо останню позицію
        lastCameraPositionRef.current = {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        };
      }
    }
  };

  // Функція для отримання видимих об'єктів з SceneLogic
  const getVisibleObjects = (): SceneObject[] => {
    if (!mapLogicRef.current) {
      return [];
    }
    
    try {
      // Отримуємо об'єкти з SceneLogic
      const objects = mapLogicRef.current.scene.getVisibleObjects();
      
      // Конвертуємо в формат SceneObject
      const convertedObjects = objects.map(obj => ({
        tags: obj.tags,
        id: obj.id,
        type: obj.type,
        coordinates: obj.coordinates,
        scale: obj.scale,
        rotation: obj.rotation,
        data: obj.data
      }));
      
      return convertedObjects;
    } catch (error) {
      return [];
    }
  };

  // Функція для рендерингу об'єктів
  const renderObjects = () => {
    if (!rendererManagerRef.current) return;

    const currentObjects = getVisibleObjects();
    const currentIds = new Set(currentObjects.map(obj => obj.id));
    const previousIds = new Set(visibleObjectsRef.current.map(obj => obj.id));

    // Оновлюємо дебаг інформацію
    setVisibleObjectsCount(currentObjects.length);
    if (mapLogicRef.current) {
      setTotalObjectsCount(mapLogicRef.current.scene.getTotalObjectsCount());
      
      // Отримуємо поточну відстань між камерою та точкою фокусу
      setCurrentDistance(Math.round(camera.position.distanceTo(cameraController.getTarget()) * 100) / 100);
      
      // Отримуємо дані viewport для дебагу
      const sceneLogic = mapLogicRef.current.scene;
      if (sceneLogic && 'viewPort' in sceneLogic) {
        // Використовуємо рефлексію для доступу до приватного поля
        const viewport = (sceneLogic as any).viewPort;
        if (viewport) {
          setViewportData({
            centerX: Math.round(viewport.centerX * 100) / 100,
            centerY: Math.round(viewport.centerY * 100) / 100,
            width: Math.round(viewport.width * 100) / 100,
            height: Math.round(viewport.height * 100) / 100
          });
        }
        
        // Отримуємо інформацію про grid
        const gridSystem = (sceneLogic as any).gridSystem;
        if (gridSystem) {
          setGridInfo({
            totalCells: gridSystem.grid.size,
            visibleCells: sceneLogic.getVisibleGridCellsCount()
          });
        }
      }
    }

    // Видаляємо об'єкти, які більше не видимі
    previousIds.forEach(id => {
      if (!currentIds.has(id)) {
        const obj = visibleObjectsRef.current.find(o => o.id === id);
        if (obj) {
          rendererManagerRef.current!.removeObject(id, obj.type);
        }
      }
    });

    // Рендеримо або оновлюємо поточні об'єкти
    currentObjects.forEach(obj => {
      if (previousIds.has(obj.id)) {
        // Оновлюємо існуючий об'єкт
        rendererManagerRef.current!.updateObject(obj);
        
                          // Оновлюємо позицію підсвітки якщо об'єкт вибраний
        if (mapLogicRef.current?.selection.isSelected(obj.id)) {
          const obj3d = rendererManagerRef.current!.getMeshById(obj.id);
          if (obj3d && obj3d instanceof THREE.Mesh) {
            selectionRendererRef.current?.updateHighlightPosition(obj.id, obj3d.position, obj3d.scale, obj3d.rotation);
          }
        }

        // Оновлюємо індикатори цілей для динамічних об'єктів
        if (obj.tags?.includes('controlled')) {
          const objData = obj.data as any;
          
          // Показуємо таргети тільки для вибраних юнітів
          const isSelected = mapLogicRef.current?.selection.isSelected(obj.id);
          
          if (objData?.target && isSelected) {
            // Встановлюємо індикатор цілі
            selectionRendererRef.current?.addTargetIndicator(obj.id, new THREE.Vector3(objData.target.x, objData.target.y, objData.target.z));
          } else {
            // Видаляємо індикатор цілі якщо ціль досягнута або юніт не вибраний
            selectionRendererRef.current?.removeTargetIndicator(obj.id);
          }
        }
      } else {
        // Рендеримо новий об'єкт
        rendererManagerRef.current!.renderObject(obj);
      }
    });
    
    // Підсвічуємо інтерактивні об'єкти для вибраних юнітів
    if (mapLogicRef.current && selectionRendererRef.current) {
      const interactiveObjects = mapLogicRef.current.selection.findInteractableObjects();
      selectionRendererRef.current.highlightInteractiveObjects(interactiveObjects);
    }

    visibleObjectsRef.current = currentObjects;
  };

  // Обробка руху миші
  const handleMouseMove = (event: MouseEvent) => {
    mousePositionRef.current = {
      x: event.clientX,
      y: event.clientY
    }
    
    // Hover ефект для інтерактивних об'єктів
    if (selectionRendererRef.current && mapLogicRef.current) {
      const mouse = new THREE.Vector2();
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      // Отримуємо інтерактивні об'єкти
      const interactiveObjects = mapLogicRef.current.selection.findInteractableObjects();
      
      let hoveredObjectId: string | null = null;
      
      // Перевіряємо кожен інтерактивний об'єкт
      for (const obj of interactiveObjects) {
        const mesh = rendererManagerRef.current?.getMeshById(obj.id);
        if (mesh) {
          // Створюємо сферу навколо об'єкта для перетину
          const sphere = new THREE.Sphere();
          const { pos, scale } = selectionRendererRef.current.getCorrectPositionAndScale(obj.id, mesh);
          sphere.center.copy(pos);
          sphere.radius = scale.length() * 0.5; // Радіус половини діагоналі
          
          if (raycaster.ray.intersectsSphere(sphere)) {
            hoveredObjectId = obj.id;
            break;
          }
        }
      }
      // Встановлюємо hover стан
      selectionRendererRef.current.setHoveredObject(hoveredObjectId);
    }
    
    // Drag selection logic
    if (isLeftMouseDownRef.current) {
      dragEndRef.current = { x: event.clientX, y: event.clientY };
      
      // Перевіряємо чи це drag (мінімальна відстань для drag)
      const dragDistance = Math.sqrt(
        Math.pow(dragEndRef.current.x - dragStartRef.current.x, 2) + 
        Math.pow(dragEndRef.current.y - dragStartRef.current.y, 2)
      );
      
      if (dragDistance > 5) { // 5 пікселів мінімальна відстань для drag
        isDraggingRef.current = true;
      }

      // Коригуємо висоту на основі terrain
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          console.log('getHeightAt call');
          const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - cameraController.getTarget().y;
            
            // Піднімаємо точку фокусу на висоту terrain
            cameraController.setTarget(new THREE.Vector3(
              cameraController.getTarget().x,
              terrainHeight,
              cameraController.getTarget().z
            ));
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
        }
      }
    }
    
    
  }

   // Встановлення цілі для вибраних динамічних об'єктів
  const handleSetRoverTarget = (event: MouseEvent) => {
    if (!mapLogicRef.current) return;
    
    const selectedObjects = mapLogicRef.current.selection.getSelectedObjects();
    if (selectedObjects.length === 0) return;
    
    // Отримуємо позицію кліку в 3D просторі
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Спочатку перевіряємо чи клікнули по об'єкту (ресурсу)
    const allObjects = Object.values(mapLogicRef.current.scene.getObjects());
    const clickedObject = allObjects.find(obj => {
      if (!obj.tags?.includes('resource')) return false;
      
      // Перевіряємо чи клік потрапив по об'єкт
      const mesh = rendererManagerRef.current?.getMeshById(obj.id);
      if (!mesh) return false;
      
      // Створюємо сферу навколо об'єкта для перевірки кліку
      const sphere = new THREE.Sphere();
      sphere.center.copy(new THREE.Vector3(obj.coordinates.x, obj.coordinates.y, obj.coordinates.z));
      sphere.radius = Math.max(obj.scale.x, obj.scale.y, obj.scale.z) * 0.5;
      
      return raycaster.ray.intersectsSphere(sphere);
    });
    
    // Якщо клікнули по ресурсу - запускаємо добування
    if (clickedObject && clickedObject.tags?.includes('resource')) {
      console.log(`🎯 Клікнули по ресурсу ${clickedObject.id}, запускаємо добування`);
      mapLogicRef.current.mineResource(clickedObject.id, selectedObjects);
      return;
    }

    // Перевіряємо чи клікнули по зарядній станції
    const clickedChargingStation = allObjects.find(obj => {
      if (!obj.tags?.includes('charge')) return false;
      
      // Перевіряємо чи клік потрапив по об'єкт
      const mesh = rendererManagerRef.current?.getMeshById(obj.id);
      if (!mesh) return false;
      
      // Створюємо сферу навколо об'єкта для перевірки кліку
      const sphere = new THREE.Sphere();
      sphere.center.copy(new THREE.Vector3(obj.coordinates.x, obj.coordinates.y, obj.coordinates.z));
      sphere.radius = Math.max(obj.scale.x, obj.scale.y, obj.scale.z) * 0.5;
      
      return raycaster.ray.intersectsSphere(sphere);
    });
    
    // Якщо клікнули по зарядній станції - запускаємо зарядку
    if (clickedChargingStation && clickedChargingStation.tags?.includes('charge')) {
      console.log(`🔋 Клікнули по зарядній станції ${clickedChargingStation.id}, запускаємо зарядку`);
      mapLogicRef.current.chargeObject(selectedObjects);
      return;
    }
    
    // Створюємо площину на висоті камери для кращого перетину
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -camera.position.y);
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    // Тепер точно розраховуємо перетин з terrain
    const terrainManager = mapLogicRef.current.scene.getTerrainManager();
    if (terrainManager) {
      // Створюємо кілька точок вздовж променя від камери
      const rayPoints: THREE.Vector3[] = [];
      const maxDistance = 1000;
      const stepSize = 10;
      
      for (let distance = 0; distance <= maxDistance; distance += stepSize) {
        const point = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(distance));
        rayPoints.push(point);
      }
      
      // Знаходимо точку найближчу до terrain
      let bestPoint = intersectionPoint;
      let minHeightDiff = Infinity;
      
      rayPoints.forEach(point => {
        const terrainHeight = terrainManager.getHeightAt(point.x, point.z);
        if (terrainHeight !== undefined) {
          const heightDiff = Math.abs(point.y - terrainHeight);
          if (heightDiff < minHeightDiff) {
            minHeightDiff = heightDiff;
            bestPoint = new THREE.Vector3(point.x, terrainHeight, point.z);
          }
        }
      });
      
      // Встановлюємо точну позицію на terrain
      intersectionPoint.copy(bestPoint);
      
      console.log(`Точка кліку на terrain: (${intersectionPoint.x.toFixed(1)}, ${intersectionPoint.y.toFixed(1)}, ${intersectionPoint.z.toFixed(1)})`);
    }
    
    console.log(`Встановлюємо ціль для ${selectedObjects.length} динамічних об'єктів: (${intersectionPoint.x.toFixed(1)}, ${intersectionPoint.z.toFixed(1)})`);
    
    // Викликаємо метод логіки для розподілення цілей
    if (mapLogicRef.current) {
      console.log('🎯 Викликаю distributeTargetsForObjects для точки:', intersectionPoint);
      mapLogicRef.current.distributeTargetsForObjects(selectedObjects, {
        x: intersectionPoint.x,
        y: intersectionPoint.y,
        z: intersectionPoint.z
      });
    }
  };

  // Обробка drag selection
  const handleDragSelection = () => {
    if (!selectionHandlerRef.current || !mapLogicRef.current) return;
    
    const allObjects = Object.values(mapLogicRef.current.scene.getObjects());
    const controlledObjects = allObjects.filter(obj => obj.tags?.includes('controlled'));
    
    const dragBounds = {
      left: Math.min(dragStartRef.current.x, dragEndRef.current.x),
      right: Math.max(dragStartRef.current.x, dragEndRef.current.x),
      top: Math.min(dragStartRef.current.y, dragEndRef.current.y),
      bottom: Math.max(dragStartRef.current.y, dragEndRef.current.y)
    };
    
    selectionHandlerRef.current.handleDragSelection(dragBounds, controlledObjects);
    
    // Підсвічуємо інтерактивні об'єкти після drag selection
    if (mapLogicRef.current && selectionRendererRef.current) {
      const interactiveObjects = mapLogicRef.current.selection.findInteractableObjects();
      selectionRendererRef.current.highlightInteractiveObjects(interactiveObjects);
      
      // Оновлюємо вибрані юніти для CommandPanel
      updateSelectedUnits();
    }
  };

  // Обробка вибору об'єктів по кліку
  const handleObjectSelection = (event: MouseEvent) => {
    if (!selectionHandlerRef.current || !mapLogicRef.current) return;
    
    const allObjects = Object.values(mapLogicRef.current.scene.getObjects());
    const controlledObjects = allObjects.filter(obj => obj.tags?.includes('controlled'));
    
    selectionHandlerRef.current.handleObjectClick(event, controlledObjects);
    
    // Підсвічуємо інтерактивні об'єкти після вибору об'єкта
    if (mapLogicRef.current && selectionRendererRef.current) {
      const interactiveObjects = mapLogicRef.current.selection.findInteractableObjects();
      selectionRendererRef.current.highlightInteractiveObjects(interactiveObjects);
      
      // Оновлюємо вибрані юніти для CommandPanel
      updateSelectedUnits();
    }
  }

  // Обробка натискання кнопок миші
  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 0) { // Ліва кнопка - вибір об'єкта
      isLeftMouseDownRef.current = true;
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      dragEndRef.current = { x: event.clientX, y: event.clientY };
      isDraggingRef.current = false;
      
      // Якщо активний режим вибору області - скасовуємо область
      if (areaSelectionModeRef.current?.isActive) {
        console.log('[Scene3D] Area selection mode active, cancelling area selection');
        handleAreaCancel();
        return;
      }
      
      // Якщо не затискаємо Shift - знімаємо попередній вибір
      if (!event.shiftKey && selectionHandlerRef.current) {
        console.warn('Empty click - remove selection');
        selectionHandlerRef.current.handleEmptyClick();
        
        // Очищаємо підсвічування інтерактивних об'єктів після зняття селекшину
        if (selectionRendererRef.current) {
          selectionRendererRef.current.highlightInteractiveObjects([]);
        }
        
        // Очищаємо вибрані юніти для CommandPanel
        updateSelectedUnits();
      }
    } else if (event.button === 2) { // Права кнопка
      isRightMouseDownRef.current = true
      
      // Якщо активний режим вибору області - підтверджуємо область
      if (areaSelectionModeRef.current?.isActive) {
        console.log('[Scene3D] Area selection mode active, confirming area at:', event.clientX, event.clientY);
        handleAreaConfirm({ x: event.clientX, y: event.clientY, z: 0 });
        return;
      }
      
      // Ціль встановлюється через CameraController.setOnSetTarget
      // handleSetRoverTarget(event); // ВИДАЛЕНО - дублювання
      
      // Коригуємо висоту на основі terrain
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - cameraController.getTarget().y;
            
            // Піднімаємо точку фокусу на висоту terrain
            cameraController.setTarget(new THREE.Vector3(
              cameraController.getTarget().x,
              terrainHeight,
              cameraController.getTarget().z
            ));
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
        }
      }
    }
  }

  // Обробка відпускання кнопок миші
  const handleMouseUp = (event: MouseEvent) => {
    // Перевіряємо чи клік був по UI елементах (CommandPanel)
    const target = event.target as HTMLElement;
    if (target && (target.closest('.command-panel') || target.closest('button'))) {
      console.log('[Scene3D] Click was on UI element, skipping handleObjectSelection');
      isLeftMouseDownRef.current = false;
      isDraggingRef.current = false;
      return;
    }
    
    if (event.button === 0) { // Ліва кнопка
      if (isDraggingRef.current) {
        // Завершуємо drag selection
        handleDragSelection();
      } else {
        // Звичайний клік - вибираємо один об'єкт
        handleObjectSelection(event);
      }
      
      isLeftMouseDownRef.current = false;
      isDraggingRef.current = false;
    } else if (event.button === 2) { // Права кнопка - вибір цілі для селекшну
      isRightMouseDownRef.current = false
      
      // Коригуємо висоту на основі terrain
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - cameraController.getTarget().y;
            
            // Піднімаємо точку фокусу на висоту terrain
            cameraController.setTarget(new THREE.Vector3(
              cameraController.getTarget().x,
              terrainHeight,
              cameraController.getTarget().z
            ));
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
        }
      }
    }
  }

  // Автоматичне панорамування при наближенні до краю екрану
  const handleAutoPan = (currentCameraDistance: number) => {
    const { x, y } = mousePositionRef.current
    const panSpeed = 0.05 * Math.min(5, currentCameraDistance * 0.2);
    const edgeThreshold = 50 // Відстань від краю екрану для активації панорамування

    let panX = 0
    let panY = 0

    // Перевіряємо лівий край
    if (x < edgeThreshold) {
      panX = -(edgeThreshold - x) / edgeThreshold * panSpeed
    }
    // Перевіряємо правий край
    else if (x > window.innerWidth - edgeThreshold) {
      panX = (x - (window.innerWidth - edgeThreshold)) / edgeThreshold * panSpeed
    }

    // Перевіряємо верхній край
    if (y < edgeThreshold) {
      panY = (edgeThreshold - y) / edgeThreshold * panSpeed
    }
    // Перевіряємо нижній край
    else if (y > window.innerHeight - edgeThreshold) {
      panY = -(y - (window.innerHeight - edgeThreshold)) / edgeThreshold * panSpeed
    }

    // Застосовуємо панорамування через зміну target (центру фокусу) та позиції камери
    if (panX !== 0 || panY !== 0) {
      // Отримуємо поточний напрямок камери
      const cameraDirection = new THREE.Vector3()
      camera.getWorldDirection(cameraDirection)
      
      // Створюємо вектор "вправо" перпендикулярно до напрямку камери
      const rightVector = new THREE.Vector3()
      rightVector.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize()

      const depthVector = new THREE.Vector3()
      depthVector.copy(cameraDirection);
      depthVector.projectOnPlane(new THREE.Vector3(0,1,0)).normalize();
      
      // Обчислюємо правильний напрямок руху
      const movementVector = new THREE.Vector3()
      movementVector.addScaledVector(rightVector, panX)
      movementVector.addScaledVector(depthVector, panY);
      // Зміщуємо точку фокусу
      const currentTarget = cameraController.getTarget().clone()
      currentTarget.add(movementVector)
      cameraController.setTarget(currentTarget)

      
      // Зміщуємо позицію камери на ту саму величину
      camera.position.add(movementVector)
      
      // Коригуємо висоту на основі terrain
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - cameraController.getTarget().y;
            
            // Піднімаємо точку фокусу на висоту terrain
            cameraController.setTarget(new THREE.Vector3(
              cameraController.getTarget().x,
              terrainHeight,
              cameraController.getTarget().z
            ));
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
          updateTerrainForCamera();
        }
      }
      
      // Оновлюємо currentDistance одразу після зміни позиції камери
      setCurrentDistance(Math.round(camera.position.distanceTo(cameraController.getTarget()) * 100) / 100)
    }
  }

  // Обробка колеса миші для зуму
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    const zoomSpeed = 0.2
    const delta = event.deltaY > 0 ? -1 : 1
    
    // Змінюємо позицію камери для зуму
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    
    // Розраховуємо нову позицію камери
    const newPosition = camera.position.clone()
    newPosition.addScaledVector(direction, delta * zoomSpeed)
    
    // Перевіряємо відстань до точки фокусу
    const newDistance = newPosition.distanceTo(cameraController.getTarget())
    
    // Застосовуємо зум тільки якщо відстань в допустимих межах (1-25)
    if (newDistance >= 1 && newDistance <= 25) {
      camera.position.copy(newPosition)
      
      // Коригуємо висоту на основі terrain
      if (mapLogicRef.current) {
        const terrainManager = mapLogicRef.current.scene.getTerrainManager();
        if (terrainManager) {
          // Отримуємо висоту terrain в точці фокусу
          const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
          
          // Якщо точка фокусу не на terrain - коригуємо її
          if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
            const heightDifference = terrainHeight - cameraController.getTarget().y;
            
            // Піднімаємо точку фокусу на висоту terrain
            cameraController.setTarget(new THREE.Vector3(
              cameraController.getTarget().x,
              terrainHeight,
              cameraController.getTarget().z
            ));
            
            // Піднімаємо камеру на ту саму висоту
            camera.position.y += heightDifference;
          }
        }
      }
      
      // Оновлюємо currentDistance після зміни позиції камери
      setCurrentDistance(Math.round(newDistance * 100) / 100)
    }
  }

  // Додаємо освітлення
  useEffect(() => {
    // Амбиєнтне освітлення
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    scene.add(ambientLight)

            // Направлене освітлення
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(10, 10, 5)
        // TEMPORARILY DISABLED SHADOWS FOR FPS TESTING
        directionalLight.castShadow = false
        // directionalLight.shadow.mapSize.width = 2048
        // directionalLight.shadow.mapSize.height = 2048
        scene.add(directionalLight)

    return () => {
      scene.remove(ambientLight)
      scene.remove(directionalLight)
    }
  }, [scene])

  // Додаємо сітку
  useEffect(() => {
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x888888)
    scene.add(gridHelper)

    return () => {
      scene.remove(gridHelper)
    }
  }, [scene])

  // Додаємо осі координат
  useEffect(() => {
    const axesHelper = new THREE.AxesHelper(5)
    scene.add(axesHelper)

    return () => {
      scene.remove(axesHelper)
    }
  }, [scene])

  // Анімація
  const animate = () => {
    animationIdRef.current = requestAnimationFrame(animate)
    
    // Підрахунок FPS
    frameCountRef.current++
    const currentTime = performance.now()
    if (currentTime - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current)
      frameCountRef.current = 0
      lastTimeRef.current = currentTime
    }
    
    // Оновлюємо контролер камери
    cameraController.handleAutoPan()
    
    // Перевіряємо та генеруємо новий terrain при значній зміні позиції
    checkAndGenerateTerrain()
    
            // Оновлюємо viewport тільки при значній зміні позиції камери (оптимізація)
        if (mapLogicRef.current) {
            const currentCameraPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
            const lastCameraPos = lastCameraPositionRef.current;

            // Перевіряємо чи камера значно змінила позицію
            const cameraMoved = !lastCameraPos ||
                Math.abs(currentCameraPos.x - lastCameraPos.x) > 5 ||
                Math.abs(currentCameraPos.z - lastCameraPos.z) > 5;

            if (cameraMoved) {
                lastCameraPositionRef.current = currentCameraPos;

                const cameraProps = {
                    position: currentCameraPos,
                    rotation: {
                        x: camera.rotation.x,
                        y: camera.rotation.y,
                        z: camera.rotation.z
                    },
                    fov: camera.fov,
                    aspect: camera.fov,
                    distance: camera.position.distanceTo(cameraController.getTarget())
                };
                mapLogicRef.current.scene.updateViewport(cameraProps);
                
                // Коригуємо висоту на основі terrain тільки при значному руху
                const terrainManager = mapLogicRef.current.scene.getTerrainManager();
                if (terrainManager) {
                    const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
                    
                    if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
                        const heightDifference = terrainHeight - cameraController.getTarget().y;
                        cameraController.setTarget(new THREE.Vector3(
                            cameraController.getTarget().x,
                            terrainHeight,
                            cameraController.getTarget().z
                        ));
                        camera.position.y += heightDifference;
                    }
                }
            }
        }

        // Оновлюємо пилові хмари (повільний рух та анімація)
        if (rendererManagerRef.current) {
                     const cloudRenderer = rendererManagerRef.current.renderers.get('cloud');
                     if (cloudRenderer && 'updateAllClouds' in cloudRenderer) {
                         (cloudRenderer as any).updateAllClouds();
                     }
        
                                         const smokeRenderer = rendererManagerRef.current.renderers.get('smoke');
                    if (smokeRenderer && 'updateAllSmoke' in smokeRenderer) {
                       (smokeRenderer as any).updateAllSmoke();
                   }
                   
                   const fireRenderer = rendererManagerRef.current.renderers.get('fire');
                   if (fireRenderer && 'updateAllFire' in fireRenderer) {
                       (fireRenderer as any).updateAllFire();
                   }
                   
                   const explosionRenderer = rendererManagerRef.current.renderers.get('explosion');
                   if (explosionRenderer && 'updateAllExplosions' in explosionRenderer) {
                       (explosionRenderer as any).updateAllExplosions();
                   }
                   
                    const arcRenderer = rendererManagerRef.current.renderers.get('electric-arc');
                    if(arcRenderer && 'updateAllArcs' in arcRenderer) {
                      (arcRenderer as any).updateAllArcs();
                    }
                }
        
    
    // Застосовуємо автоматичне панорамування
    const currentCameraDistance = camera.position.distanceTo(cameraController.getTarget());
    handleAutoPan(currentCameraDistance);
    
    // Перевіряємо та генеруємо новий terrain при автоматичному панорамуванні
    checkAndGenerateTerrain()
    
    // Рендеримо об'єкти
    renderObjects()
    
    renderer.render(scene, camera)
  }

  // Обробка зміни розміру вікна
  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    
    // Оновлюємо viewport при зміні розміру вікна
    if (mapLogicRef.current) {
      const cameraProps = {
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        },
        rotation: {
          x: camera.rotation.x,
          y: camera.rotation.y,
          z: camera.rotation.z
        },
        fov: camera.fov,
        aspect: camera.aspect,
        distance: camera.position.distanceTo(cameraController.getTarget())
      };
      mapLogicRef.current.scene.updateViewport(cameraProps);
      
      // Коригуємо висоту на основі terrain
      const terrainManager = mapLogicRef.current.scene.getTerrainManager();
      if (terrainManager) {
        // Отримуємо висоту terrain в точці фокусу
        const terrainHeight = terrainManager.getHeightAt(cameraController.getTarget().x, cameraController.getTarget().z);
        
        // Якщо точка фокусу не на terrain - коригуємо її
        if (Math.abs(cameraController.getTarget().y - terrainHeight) > 0.1) {
          const heightDifference = terrainHeight - cameraController.getTarget().y;
          
          // Піднімаємо точку фокусу на висоту terrain
          cameraController.setTarget(new THREE.Vector3(
            cameraController.getTarget().x,
            terrainHeight,
            cameraController.getTarget().z
          ));
          
          // Піднімаємо камеру на ту саму висоту
          camera.position.y += heightDifference;
        }
      }
    }
  }

  // Ініціалізація
  useEffect(() => {
    if (!mountRef.current) return

    // Додаємо рендерер до DOM
    mountRef.current.appendChild(renderer.domElement)

    // Додаємо обробники подій миші
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('wheel', handleWheel) // Додаємо обробник wheel
    
    // Вимікаємо контекстне меню для правої кнопки
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
    
    // Додаємо обробник зміни розміру
    window.addEventListener('resize', handleResize)

    console.log('CHNG!')

    // Запускаємо анімацію
    animate()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('wheel', handleWheel) // Видаляємо обробник wheel
      window.removeEventListener('resize', handleResize)
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement)
      }
      if (selectionRendererRef.current) {
        selectionRendererRef.current.clearAll()
      }
      
      // Очищаємо рендерери при HMR
      if (rendererManagerRef.current) {
        rendererManagerRef.current.dispose()
      }
      if (terrainRendererRef.current) {
        terrainRendererRef.current.dispose()
      }
      
      // Очищаємо сцену
      if (scene) {
        scene.clear()
      }
      
      // Очищаємо WebGL контекст
      if (renderer) {
        renderer.dispose()
      }
    }
  }, [scene, camera, renderer, cameraController])

  return (
    <div 
      ref={mountRef} 
      style={{ 
        width: '100%', 
        height: '100vh',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Drag selection rectangle */}
      {isDraggingRef.current && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(dragStartRef.current.x, dragEndRef.current.x),
            top: Math.min(dragStartRef.current.y, dragEndRef.current.y),
            width: Math.abs(dragEndRef.current.x - dragStartRef.current.x),
            height: Math.abs(dragEndRef.current.y - dragStartRef.current.y),
            border: '2px solid #00ff00',
            backgroundColor: 'rgba(0, 255, 0, 0.1)',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        />
      )}
      {/* Дебаг інформація */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '14px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: '8px',
        borderRadius: '4px',
        zIndex: 1000
      }}>
        <div>FPS: {fps}</div>
        <div>Visible Objects: {visibleObjectsCount}</div>
        <div>Total Objects: {totalObjectsCount}</div>
        <div>Camera Distance: {currentDistance}</div>
        <div>Viewport Center: ({viewportData.centerX}, {viewportData.centerY})</div>
        <div>Viewport Size: {viewportData.width} × {viewportData.height}</div>
        <div>Grid Cells: {gridInfo.totalCells} total, {gridInfo.visibleCells} visible</div>
        <div>Viewport Bounds: X[{Math.round((viewportData.centerX - viewportData.width/2) * 100) / 100}, {Math.round((viewportData.centerX + viewportData.width/2) * 100) / 100}]</div>
        <div>Viewport Bounds: Z[{Math.round((viewportData.centerY - viewportData.height/2) * 100) / 100}, {Math.round((viewportData.centerY + viewportData.height/2) * 100) / 100}]</div>
        <div>Terrain: Active (Height: 0 to 20)</div>
        <div>Focus Point: ({Math.round(cameraController.getTarget().x * 100) / 100}, {Math.round(cameraController.getTarget().y * 100) / 100}, {Math.round(cameraController.getTarget().z * 100) / 100})</div>
        <div>Selected Objects: {mapLogicRef.current?.selection.getSelectedCount() || 0}</div>
      </div>
      
      {/* Resources Bar */}
      {mapLogicRef.current && (
        <ResourcesBar 
          getAvailableResources={() => {
            const allResources = mapLogicRef.current!.resources.getAllResources();
            const result: Record<string, { current: number; max: number; progress: number }> = {};
            
            Object.entries(allResources).forEach(([id, current]) => {
              const max = mapLogicRef.current!.resources.getResourceCapacity(id as any);
              const progress = mapLogicRef.current!.resources.getResourceProgress(id as any);
              
              result[id] = {
                current,
                max,
                progress
              };
            });
            
            return result;
          }}
        />
      )}

    </div>
  )
}

export default Scene3D
