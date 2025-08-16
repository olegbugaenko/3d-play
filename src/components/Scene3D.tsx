import React, { useRef, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RendererManager } from './renderers/RendererManager'
import { SceneObject } from './renderers/BaseRenderer'
import { MapLogic } from '../../logic/map/map-logic'
import { SceneLogic } from '../../logic/scene/scene-logic'

const Scene3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null)
  const animationIdRef = useRef<number>()
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const isRightMouseDownRef = useRef(false)
  const rendererManagerRef = useRef<RendererManager | null>(null)
  const visibleObjectsRef = useRef<SceneObject[]>([])
  const mapLogicRef = useRef<MapLogic | null>(null)
  
  // Дебаг змінні - робимо їх реактивними
  const [fps, setFps] = useState(0)
  const [visibleObjectsCount, setVisibleObjectsCount] = useState(0)
  const [totalObjectsCount, setTotalObjectsCount] = useState(0)
  const [viewportData, setViewportData] = useState({ centerX: 0, centerY: 0, width: 0, height: 0 })
  const [gridInfo, setGridInfo] = useState({ totalCells: 0, visibleCells: 0 })
  const [currentDistance, setCurrentDistance] = useState(0)
  
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  // Створюємо сцену
  const scene = useMemo(() => {
    const newScene = new THREE.Scene()
    newScene.background = new THREE.Color('#000011')
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

  // Створюємо контроли
  const controls = useMemo(() => {
    const newControls = new OrbitControls(camera, renderer.domElement)
    newControls.enableDamping = true
    newControls.dampingFactor = 0.05
    
    // Вимікаємо стандартні контроли для лівої кнопки
    newControls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    }
    
    // Вимікаємо зум колесом миші
    newControls.enableZoom = false
    
    return newControls
  }, [camera, renderer])

  // Ініціалізуємо менеджер рендерерів та SceneLogic
  useEffect(() => {
    if (scene) {
      rendererManagerRef.current = new RendererManager(scene);
      const sceneLogic = new SceneLogic();
      mapLogicRef.current = new MapLogic(sceneLogic);
      
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
        distance: camera.position.distanceTo(controls.target) // Відстань до точки фокусу
      };
      
      mapLogicRef.current.initMap(cameraProps);
      
      // Оновлюємо viewport при ініціалізації
      if (mapLogicRef.current) {
        mapLogicRef.current.scene.updateViewport(cameraProps);
      }
    }
  }, [scene, camera]);

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
      setCurrentDistance(Math.round(camera.position.distanceTo(controls.target) * 100) / 100);
      
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
      } else {
        // Рендеримо новий об'єкт
        rendererManagerRef.current!.renderObject(obj);
      }
    });

    visibleObjectsRef.current = currentObjects;
  };

  // Обробка руху миші
  const handleMouseMove = (event: MouseEvent) => {
    mousePositionRef.current = {
      x: event.clientX,
      y: event.clientY
    }
  }

  // Обробка натискання правої кнопки миші
  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 2) { // Права кнопка
      isRightMouseDownRef.current = true
    }
  }

  // Обробка відпускання правої кнопки миші
  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 2) { // Права кнопка
      isRightMouseDownRef.current = false
    }
  }

  // Автоматичне панорамування при наближенні до краю екрану
  const handleAutoPan = () => {
    const { x, y } = mousePositionRef.current
    const panSpeed = 0.05
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
      const currentTarget = controls.target.clone()
      currentTarget.add(movementVector)
      controls.target.copy(currentTarget)

      
      // Зміщуємо позицію камери на ту саму величину
      camera.position.add(movementVector)
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
    const newDistance = newPosition.distanceTo(controls.target)
    
    // Застосовуємо зум тільки якщо відстань в допустимих межах (1-25)
    if (newDistance >= 1 && newDistance <= 25) {
      camera.position.copy(newPosition)
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
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
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
    
    // Оновлюємо контроли
    controls.update()
    
    // Оновлюємо viewport при зміні камери
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
        distance: camera.position.distanceTo(controls.target)
      };
      mapLogicRef.current.scene.updateViewport(cameraProps);
    }
    
    // Застосовуємо автоматичне панорамування
    handleAutoPan()
    
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
        distance: camera.position.distanceTo(controls.target)
      };
      mapLogicRef.current.scene.updateViewport(cameraProps);
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
    }
  }, [scene, camera, renderer, controls])

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
      </div>
    </div>
  )
}

export default Scene3D
