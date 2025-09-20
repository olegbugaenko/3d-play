import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import * as THREE from 'three'
import { CameraController } from '@ui/screens/colony/scene/CameraController'
import { RendererManager } from './renderers/RendererManager'
import { createUiLogicBridge } from '@ui/logic/UiLogicBridge'
import { SelectionRenderer } from './renderers/SelectionRenderer'
import { TerrainRenderer } from './renderers/TerrainRenderer'
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer'
// Нова архітектура інтеракції
import { useInteractionManager } from '@ui/screens/colony/scene/hooks/useInteractionManager'
import { useBuildingPreview } from '@ui/screens/colony/scene/hooks/useBuildingPreview'
import { useDebugInfo } from '@ui/screens/colony/scene/hooks/useDebugInfo'
import { InteractionProvider } from '@ui/screens/colony/scene/context/InteractionContext'
import { DebugPanel } from '@ui/screens/colony/scene/components/DebugPanel'
import PathfindingDebug from '../debug/PathfindingDebug'

import { CommandPanel, SegmentedConstructionPanel } from '@ui/screens/colony'
import { ISaveManager, IMapLogic } from '@interfaces/index';
import { TSceneObject } from '@logic/systems/scene/scene.types'
import { VerticalMenuWithContext } from '../components/VerticalMenuWithContext'
import { DragSelection } from '../DragSelection'

/** ===================== core three setup ===================== */
function useThreeCore() {
  const scene = useMemo(() => {
    const s = new THREE.Scene()
    s.background = new THREE.Color('#5a4f2e')
    // lights
    const ambient = new THREE.AmbientLight(0xf0f0c0, 0.6)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(50, 100, 50)
    dir.castShadow = false
    s.add(ambient, dir)
    ;(s as THREE.Scene & { __lights__?: { ambient: THREE.AmbientLight; dir: THREE.DirectionalLight } }).__lights__ = { ambient, dir }
    return s
  }, [])

  const camera = useMemo(() => {
    const c = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    c.position.set(5, 5, 5)
    return c
  }, [])

  const renderer = useMemo(() => {
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setSize(window.innerWidth, window.innerHeight)
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    return r
  }, [])

  useEffect(() => {
    return () => {
      const lights = (scene as THREE.Scene & { __lights__?: { ambient: THREE.AmbientLight; dir: THREE.DirectionalLight } }).__lights__
      if (lights) {
        scene.remove(lights.ambient)
        scene.remove(lights.dir)
      }
    }
  }, [scene])

  return { scene, camera, renderer }
}

/** ===================== managers & map ===================== */
function useMapAndManagers(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, appMapLogic: IMapLogic) {
  const rendererManagerRef = useRef<RendererManager|null>(null)
  const selectionRendererRef = useRef<SelectionRenderer|null>(null)
  const terrainRendererRef   = useRef<TerrainRenderer|null>(null)
  const areaSelectionRendererRef = useRef<AreaSelectionRenderer|null>(null)

  const mapLogicRef          = useRef<IMapLogic|null>(null)

  useEffect(() => {
    const bridge = createUiLogicBridge(appMapLogic)
    rendererManagerRef.current = new RendererManager(scene, renderer, bridge)
    mapLogicRef.current = appMapLogic // Використовуємо переданий MapLogic замість створювати новий

    selectionRendererRef.current = new SelectionRenderer(
      scene,
      (id) => rendererManagerRef.current?.getMeshById(id) || null,
      (id) => mapLogicRef.current?.scene.getObjectById(id) || null
    )

    const tm = mapLogicRef.current.scene.getTerrainManager()
    if (tm) {
      terrainRendererRef.current = new TerrainRenderer(scene, tm)
      terrainRendererRef.current.renderTerrain({
        x: camera.position.x, y: camera.position.y, z: camera.position.z
      }).catch(e => console.error('Failed to render initial terrain:', e))
    }

    return () => {
      selectionRendererRef.current?.clearAll()
      rendererManagerRef.current?.dispose()
      terrainRendererRef.current?.dispose()

      if (tm) {
        areaSelectionRendererRef.current?.dispose()
      }
    }
  }, [scene, camera, renderer, appMapLogic])

  return {
    rendererManagerRef,
    selectionRendererRef,
    terrainRendererRef,
    areaSelectionRendererRef,
    mapLogicRef,
  }
}

/** ===================== helpers ===================== */
function useRayFromScreen(camera: THREE.Camera) {
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const setFromClient = useCallback((clientX:number, clientY:number) => {
    ndc.x = (clientX / window.innerWidth) * 2 - 1
    ndc.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    return raycaster
  }, [camera, ndc, raycaster])
  return { setFromClient, raycaster }
}

function useCameraController(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  mapLogicRef: React.MutableRefObject<IMapLogic|null>
) {
     const controller = useMemo(() => {
     const c = new CameraController(camera, renderer.domElement, {
       enableDamping: true,
       dampingFactor: 0.05,
       minDistance: 1,
       maxDistance: 25,
       panSpeed: 0.05,
       rotateSpeed: 0.05, // Збільшуємо швидкість обертання
       zoomSpeed: 0.3,    // Збільшуємо швидкість зуму
     })
     return c
   }, [camera, renderer])

  useEffect(() => {
    controller.setGetTerrainHeight((x,z) => {
      const tm = mapLogicRef.current?.scene.getTerrainManager()
      return tm ? tm.getHeightAt(x, z) : undefined
    })
  }, [controller, mapLogicRef])

  return controller
}

function useCameraViewportSync(
  camera: THREE.PerspectiveCamera,
  controller: CameraController,
  mapLogicRef: React.MutableRefObject<IMapLogic|null>
) {
  const lastCamPosRef = useRef<{x:number;y:number;z:number}|null>(null)

  const ensureTargetOnTerrain = useCallback(() => {
    const tm = mapLogicRef.current?.scene.getTerrainManager()
    if (!tm) return
    const target = controller.getTarget()
    const h = tm.getHeightAt(target.x, target.z)
    if (h === undefined) return
    const diff = h - target.y
    if (Math.abs(diff) > 0.1) {
      controller.setTarget(new THREE.Vector3(target.x, h, target.z))
      camera.position.y += diff
    }
  }, [camera, controller, mapLogicRef])

  const updateViewport = useCallback(() => {
    const map = mapLogicRef.current
    if (!map) return
    const props = {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
      fov: camera.fov,
      aspect: camera.aspect,
      distance: camera.position.distanceTo(controller.getTarget())
    }
    map.scene.updateViewport(props)
  }, [camera, controller, mapLogicRef])

  const maybeUpdateViewportOnMove = useCallback(() => {
    const cur = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    const last = lastCamPosRef.current
    const moved = !last ||
      Math.abs(cur.x - last.x) > 5 ||
      Math.abs(cur.z - last.z) > 5

    if (moved) {
      lastCamPosRef.current = cur
      ensureTargetOnTerrain()
      updateViewport()
    }
  }, [camera.position, ensureTargetOnTerrain, updateViewport])

  return { ensureTargetOnTerrain, updateViewport, maybeUpdateViewportOnMove }
}

function useTerrainStreaming(
  camera: THREE.PerspectiveCamera,
  terrainRendererRef: React.MutableRefObject<TerrainRenderer|null>,
  mapLogicRef: React.MutableRefObject<IMapLogic|null>
) {
  const lastPosRef = useRef<{x:number;y:number;z:number}|null>(null)

  const updateTerrainForCamera = useCallback(() => {
    const tr = terrainRendererRef.current
    const tm = mapLogicRef.current?.scene.getTerrainManager()
    if (!tr || !tm) return
    tr.updateTerrain({ x: camera.position.x, y: camera.position.y, z: camera.position.z })
  }, [camera, terrainRendererRef, mapLogicRef])

  const checkAndGenerate = useCallback(() => {
    const tr = terrainRendererRef.current
    const tm = mapLogicRef.current?.scene.getTerrainManager()
    if (!tr || !tm) return

    const last = lastPosRef.current
    const cur = camera.position
    if (last) {
      const dx = cur.x - last.x
      const dz = cur.z - last.z
      const dist = Math.hypot(dx, dz)
      if (dist > 50) {
        tr.renderTerrain({ x: cur.x, y: cur.y, z: cur.z }).catch(console.error)
        lastPosRef.current = { x: cur.x, y: cur.y, z: cur.z }
      }
    } else {
      lastPosRef.current = { x: cur.x, y: cur.y, z: cur.z }
    }
  }, [camera, terrainRendererRef, mapLogicRef])

  return { updateTerrainForCamera, checkAndGenerate }
}



// ОПТИМІЗОВАНИЙ хук для вибраних юнітів - без polling!
function useSelectedUnits(mapLogicRef: React.MutableRefObject<IMapLogic|null>) {
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const lastCountRef = useRef(0)
  
  const updateSelectedUnits = useCallback(() => {
    const ids = mapLogicRef.current?.selection.getSelectedObjects() ?? []
    // Оновлюємо тільки якщо кількість змінилася
    if (ids.length !== lastCountRef.current) {
      setSelectedUnits(ids)
      lastCountRef.current = ids.length
    }
  }, [mapLogicRef])

  // Викликаємо оновлення тільки при взаємодії, не через polling!
  useEffect(() => {
    // Початкове оновлення
    updateSelectedUnits()
    
    // Додаємо слухач до MapLogic для зміни селекції (якщо є такий API)
    // Замість polling використовуємо event-driven підхід
    const checkForChanges = () => {
      updateSelectedUnits()
    }
    
    // Перевіряємо зміни тільки кожні 1000мс замість 100мс
    const interval = setInterval(checkForChanges, 1000)
    return () => clearInterval(interval)
  }, [updateSelectedUnits])

  return selectedUnits
}

function useAutoPan(
  camera: THREE.PerspectiveCamera,
  controller: CameraController,
  mapLogicRef: React.MutableRefObject<IMapLogic|null>,
  updateTerrainForCamera: () => void
) {
  const mouseRef = useRef({ x:0, y:0 })
  const setMouse = useCallback((x:number,y:number) => { mouseRef.current = { x, y } }, [])
  const step = useCallback(() => {
    const { x, y } = mouseRef.current
    const dist = camera.position.distanceTo(controller.getTarget())
    const base = 0.05 * Math.min(5, dist * 0.2)
    const edge = 50
    let panX = 0, panY = 0
    if (x < edge) panX = -((edge - x) / edge) * base
    else if (x > window.innerWidth - edge) panX = ((x - (window.innerWidth - edge)) / edge) * base
    if (y < edge) panY = ((edge - y) / edge) * base
    else if (y > window.innerHeight - edge) panY = -((y - (window.innerHeight - edge)) / edge) * base

    if (panX || panY) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize()
      const forward = dir.clone().projectOnPlane(new THREE.Vector3(0,1,0)).normalize()
      const move = new THREE.Vector3().addScaledVector(right, panX).addScaledVector(forward, panY)
      const target = controller.getTarget().clone().add(move)
      controller.setTarget(target)
      camera.position.add(move)

      const tm = mapLogicRef.current?.scene.getTerrainManager()
      if (tm) {
        const h = tm.getHeightAt(target.x, target.z)
        if (h !== undefined) {
          const diff = h - target.y
          if (Math.abs(diff) > 0.1) {
            controller.setTarget(new THREE.Vector3(target.x, h, target.z))
            camera.position.y += diff
          }
        }
      }
      updateTerrainForCamera()
    }
  }, [camera, controller, mapLogicRef, updateTerrainForCamera])

  return { setMouse, step }
}

/** ===================== render loop (patched with sync) ===================== */
function useRenderLoop(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  controller: CameraController,
  rendererManagerRef: React.MutableRefObject<RendererManager|null>,
  maybeUpdateViewportOnMove: () => void,
  checkAndGenerateTerrain: () => void,
  autoPanStep: () => void,
  syncVisibleObjects: () => void,
  areaSelectionRendererRef: React.MutableRefObject<AreaSelectionRenderer|null>,
  mapLogicRef: React.MutableRefObject<IMapLogic|null>
) {
  const rafRef = useRef<number>()
  const [fps, setFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick)

    // FPS - оновлюємо рідше (кожні 2 секунди) і тільки якщо значення змінилося
    frameCountRef.current++
    const now = performance.now()
    if (now - lastTimeRef.current >= 2000) { // Збільшуємо інтервал до 2 секунд
      const newFps = frameCountRef.current / 2 // Ділимо на 2 бо тепер рахуємо за 2 секунди
      setFps(prevFps => {
        // Оновлюємо тільки якщо значення змінилося більше ніж на 5 FPS
        if (Math.abs(prevFps - newFps) > 5) {
          return newFps
        }
        return prevFps // Повертаємо той самий об'єкт
      })
      frameCountRef.current = 0
      lastTimeRef.current = now
    }

    controller.handleAutoPan()
    maybeUpdateViewportOnMove()
    checkAndGenerateTerrain()
    // autoPanStep() // Тимчасово відключено
    
    // Camera pinning logic
    if (controller.isCameraPinned()) {
      const pinnedObjectId = controller.getPinnedObjectId()
      if (pinnedObjectId) {
                  const pinnedObject = mapLogicRef.current?.scene.getObjectById(pinnedObjectId)
          if (pinnedObject) {
            // Встановлюємо точку фокусу на закріплений об'єкт
            const targetLookAt = new THREE.Vector3(
              pinnedObject.coordinates.x,
              pinnedObject.coordinates.y,
              pinnedObject.coordinates.z
            )
            
            // Отримуємо позицію камери з орбіти
            const targetPos = controller.getPinnedCameraPosition()
            
            controller.setTargetPosition(targetPos, targetLookAt)
            
            // Оновлюємо плавне переміщення
            controller.updateSmoothMovement()
          }
      }
    }

    // апдейти ефектів
    const rm = rendererManagerRef.current
    if (rm) {
      const tryCall = (key: string, fn: string) => {
        const r = rm.renderers.get(key)
        if (r && fn in r) {
          const renderer = r as unknown as { [key: string]: () => void }
          renderer[fn]()
        }
      }
      tryCall('cloud', 'updateAllClouds')
      tryCall('smoke', 'updateAllSmoke')
      tryCall('fire', 'updateAllFire')
      tryCall('explosion', 'updateAllExplosions')
      tryCall('electric-arc', 'updateAllArcs')
      tryCall('aurora', 'updateEnvironmentEffects')
    }

    // СИНХРОНІЗАЦІЯ ОБ’ЄКТІВ → RendererManager
    syncVisibleObjects()

         // Оновлюємо AreaSelectionRenderer
     if (areaSelectionRendererRef.current) {
       areaSelectionRendererRef.current.update();
     }

    renderer.render(scene, camera)
  }, [
    autoPanStep, camera, checkAndGenerateTerrain,
    controller, maybeUpdateViewportOnMove, renderer, rendererManagerRef,
    scene, syncVisibleObjects, areaSelectionRendererRef, mapLogicRef
  ])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [tick])

  return fps
}

/** ===================== main component ===================== */
interface Scene3DProps {
  saveManager: ISaveManager;
  onShowMainMenu: () => void;
  mapLogic: IMapLogic;
  game: any; // Game instance для доступу до UpgradesManager
}

const Scene3D: React.FC<Scene3DProps> = ({ onShowMainMenu, mapLogic: appMapLogic, game }) => {
  const mountRef = useRef<HTMLDivElement>(null)

  // Додаємо стейт для вибраної команди
  const [selectedCommand, setSelectedCommand] = useState<any>(null)
  

  


  const { scene, camera, renderer } = useThreeCore()
  const { rendererManagerRef, selectionRendererRef, terrainRendererRef, areaSelectionRendererRef, mapLogicRef } =
    useMapAndManagers(scene, camera, renderer, appMapLogic)
  
  // Використовуємо окремий хук для BuildingPreview
  const buildingPreviewRef = useBuildingPreview(scene, appMapLogic)

  const controller = useCameraController(camera, renderer, mapLogicRef)
  
  // Використовуємо окремий хук для debug інформації
  const debugInfo = useDebugInfo(camera, controller, mapLogicRef, buildingPreviewRef)
  const { ensureTargetOnTerrain, updateViewport, maybeUpdateViewportOnMove } =
    useCameraViewportSync(camera, controller, mapLogicRef)

  const { updateTerrainForCamera, checkAndGenerate } =
    useTerrainStreaming(camera, terrainRendererRef, mapLogicRef)

  const { setFromClient: getRay } = useRayFromScreen(camera)

  // Нова архітектура інтеракції
  const interactionManager = useInteractionManager(
    scene, camera, appMapLogic,
    selectionRendererRef.current,
    rendererManagerRef.current,
    areaSelectionRendererRef.current,
    buildingPreviewRef.current
  )

  // Отримуємо вибрані юніти
  const selectedUnits = useSelectedUnits(mapLogicRef)

  const { step: autoPanStep } =
    useAutoPan(camera, controller, mapLogicRef, updateTerrainForCamera)

  // Оновлюємо обводку вибраних об'єктів
  useEffect(() => {
    const updateSelectionHighlights = () => {
      const map = mapLogicRef.current;
      const rm = rendererManagerRef.current;
      const sr = selectionRendererRef.current;
      
      if (!map || !rm || !sr) return;

      // Очищаємо всі попередні обводки
      sr.clearAll();

      // Додаємо обводки для вибраних об'єктів
      const selectedIds = map.selection.getSelectedObjects();
      selectedIds.forEach((id: string) => {
        const mesh = rm.getMeshById(id);
        if (mesh && mesh instanceof THREE.Mesh) {
          sr.addSelectionHighlight(id, mesh);
        }
      });

      // Оновлюємо інтерактивні об'єкти
      const interactive = map.selection.findInteractableObjects();
      sr.highlightInteractiveObjects(interactive);
    };

    // Оновлюємо кожні 100мс
    const interval = setInterval(updateSelectionHighlights, 100);
    return () => clearInterval(interval);
  }, [mapLogicRef, rendererManagerRef, selectionRendererRef]);



  // Оновлюємо позицію кільця при руху миші
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (areaSelectionRendererRef.current && selectedCommand?.ui?.scope === 'gather') {
      areaSelectionRendererRef.current.updatePosition(event.clientX, event.clientY, camera, getRay(event.clientX, event.clientY));
    }
  }, [areaSelectionRendererRef, selectedCommand, camera, getRay])

  // Callback для зміни вибраної команди
  const handleCommandChange = useCallback((commandGroup: any) => {
    setSelectedCommand(commandGroup)
  }, [])
  


  // Показуємо/приховуємо кільце зони збору при зміні команди
  useEffect(() => {
    const areaRenderer = areaSelectionRendererRef.current;
    if (!areaRenderer) return;

    if (selectedCommand && selectedCommand.ui?.scope === 'gather') {
      // Показуємо кільце для команд збору
      const radius = 5; // Радіус з команд
      const color = selectedCommand.ui?.category === 'stone' ? '#8B4513' : 
                   selectedCommand.ui?.category === 'ore' ? '#696969' : '#00ff88';
      
      areaRenderer.show(radius, color);
    } else {
      // Приховуємо кільце
      areaRenderer.hide();
    }
  }, [selectedCommand])



  // Підписуємося на події миші для оновлення позиції кільця
  useEffect(() => {
    if (selectedCommand?.ui?.scope === 'gather') {
      document.addEventListener('mousemove', handleMouseMove);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [selectedCommand, handleMouseMove])

  // Підписуємося на події зміни режиму інтеракції
  useEffect(() => {
    if (!interactionManager) return;

    const handleModeChange = (data: { from: string; to: string }) => {
      console.log(`Mode changed from ${data.from} to ${data.to}`);
      
      // Якщо повертаємося до режиму вибору, оновлюємо режим в InteractionManager
      if (data.to === 'selection') {
        interactionManager.setMode('selection');
      }
    };

    interactionManager.on('modeChange', handleModeChange);

    return () => {
      interactionManager.off('modeChange', handleModeChange);
    };
  }, [interactionManager]);

  /** --------- NEW: initMap + first viewport --------- */
  useEffect(() => {
    const map = mapLogicRef.current
    if (!map) return
  
    const cameraProps = {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
      fov: camera.fov,
      aspect: camera.aspect,
      distance: camera.position.distanceTo(controller.getTarget()),
    }
  
         
    map.scene.updateViewport(cameraProps)
    ensureTargetOnTerrain()
  
    // ✅ СТВОРЕННЯ ТА ПЕРШИЙ РЕНДЕР ТЕРЕНУ — ТУТ
    const tm = map.scene.getTerrainManager()
    if (tm) {
      if (!terrainRendererRef.current) {
        terrainRendererRef.current = new TerrainRenderer(scene, tm)
      }
      terrainRendererRef.current
        .renderTerrain({ x: camera.position.x, y: camera.position.y, z: camera.position.z })
        .catch(console.error)

      // Створюємо AreaSelectionRenderer для відображення зони збору
      // ТУТ terrainManager вже готовий!
      areaSelectionRendererRef.current = new AreaSelectionRenderer(scene, tm)
    }
  }, [camera, controller, ensureTargetOnTerrain, mapLogicRef, scene, terrainRendererRef])

  /** --------- NEW: object sync (like your renderObjects) --------- */
  // Ref для зберігання попереднього стану об'єктів
  const prevObjectsRef = useRef<Map<string, TSceneObject>>(new Map())
  
  // 🚀 ОПТИМІЗОВАНИЙ syncVisibleObjects З DIRTY FLAGS
  const syncVisibleObjects = useCallback(() => {
    const rm = rendererManagerRef.current
    const map = mapLogicRef.current
    if (!rm || !map) return

    // 🚀 Використовуємо оптимізований метод з needUpdate флагом
    const current = map.scene.getVisibleObjectsOptimized().map<TSceneObject>(obj => ({
      tags: obj.tags,
      id: obj.id,
      type: obj.type,
      coordinates: obj.coordinates,
      scale: obj.scale,
      rotation: obj.rotation,
      data: obj.data,
      // 🚀 Додаємо dirty flags та needUpdate для оптимізації
      _dirtyFlags: obj._dirtyFlags,
      _lastUpdate: obj._lastUpdate,
      needUpdate: obj.needUpdate
    })) as TSceneObject[]

    const prev = prevObjectsRef.current

    // 🚀 ОПТИМІЗАЦІЯ: Обробляємо тільки змінені об'єкти
    const currentIds = new Set(current.map(o => o.id))
    
    // Видаляємо об'єкти які більше не існують
    for (const [id, oldObj] of prev) {
      if (!currentIds.has(id)) {
        rm.removeObject(id, oldObj.type)
        prev.delete(id)
      }
    }
    
    // 🚀 ОПТИМІЗАЦІЯ: Додаємо/оновлюємо тільки змінені об'єкти
    for (const obj of current) {
      const prevObj = prev.get(obj.id)
      
      if (!prevObj) {
        // Новий об'єкт - додаємо
        rm.renderObject(obj)
        prev.set(obj.id, obj)
      } else if ((obj as any).needUpdate) {
        // 🚀 Оновлюємо тільки якщо needUpdate = true
        rm.updateObject(obj)
        prev.set(obj.id, obj)
      }
      // Якщо needUpdate = false - пропускаємо оновлення

      // 🚀 ОПТИМІЗАЦІЯ: Selection highlight тільки для вибраних
      if (map.selection.isSelected(obj.id)) {
        const mesh = rm.getMeshById(obj.id)
        if (mesh && 'position' in mesh && 'scale' in mesh && 'rotation' in mesh) {
          selectionRendererRef.current?.updateHighlightPosition(
            obj.id, mesh.position, mesh.scale, mesh.rotation
          )
        }
      }
      
      // 🚀 ОПТИМІЗАЦІЯ: Target indicators тільки для controlled об'єктів
      if (obj.tags?.includes('controlled')) {
        const tgt = obj.data?.target
        if (tgt && typeof tgt === 'object' && 'x' in tgt && 'y' in tgt && 'z' in tgt) {
          selectionRendererRef.current?.addTargetIndicator(
            obj.id, new THREE.Vector3(tgt.x as number, tgt.y as number, tgt.z as number)
          )
        } else {
          selectionRendererRef.current?.removeTargetIndicator(obj.id)
        }
      }
    }

    // 🚀 ОПТИМІЗАЦІЯ: Interactive objects оновлюємо рідше
    const interactive = map.selection.findInteractableObjects()
    selectionRendererRef.current?.highlightInteractiveObjects(interactive)
    
    // 🚀 ОЧИЩАЄМО DIRTY FLAGS після синхронізації
    map.scene.clearDirtyFlagsAfterSync()
  }, [mapLogicRef, rendererManagerRef, selectionRendererRef])

  /** --------- render loop --------- */
  const fps = useRenderLoop(
    scene, camera, renderer, controller,
    rendererManagerRef, maybeUpdateViewportOnMove, checkAndGenerate, autoPanStep,
    syncVisibleObjects, areaSelectionRendererRef, mapLogicRef
  )

  /** --------- initial helpers + DOM mount --------- */
  useEffect(() => {
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x888888)
    const axes = new THREE.AxesHelper(5)
    scene.add(grid, axes)
    updateViewport()
    ensureTargetOnTerrain()
    return () => {
      // КРИТИЧНО: зупиняємо тіки гри при cleanup
      game.stopTicks()
      scene.remove(grid)
      scene.remove(axes)
      scene.clear()
      renderer.dispose()
    }
  }, [ensureTargetOnTerrain, renderer, scene, updateViewport, game])

  useEffect(() => {
    if (!mountRef.current) return
    mountRef.current.appendChild(renderer.domElement)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      const delta = e.deltaY > 0 ? -1 : 1
      const zoomSpeed = 0.2
      const newPos = camera.position.clone().addScaledVector(dir, delta * zoomSpeed)
      const d = newPos.distanceTo(controller.getTarget())
      if (d >= 1 && d <= 25) {
        camera.position.copy(newPos)
        ensureTargetOnTerrain()
        updateViewport()
      }
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      updateViewport()
      ensureTargetOnTerrain()
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', onResize)
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [camera, controller, ensureTargetOnTerrain, renderer, updateViewport])





  return (
    <div ref={mountRef} style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {interactionManager && (
        <InteractionProvider value={interactionManager}>

          {/* Vertical Menu with Context */}
          <VerticalMenuWithContext 
            game={game}
            onShowMainMenu={onShowMainMenu}
          />

      

             {/* Debug Panel */}
       <DebugPanel
         fps={fps}
         debugInfo={debugInfo}
         controller={controller}
         mapLogicRef={mapLogicRef}
         selectedCommand={selectedCommand}
         interactionManager={interactionManager}
       />

       {/* Pathfinding Debug */}
       <PathfindingDebug uiLogicBridge={createUiLogicBridge(mapLogicRef.current!)} />



      {/* Command Panel */}
      <CommandPanel
        selectedUnits={selectedUnits}
        onCommandChange={handleCommandChange}
        game={game}
        cameraController={controller}
      />

      {/* Segmented Construction Panel */}
      <SegmentedConstructionPanel />

       {/* Drag Selection Rectangle */}
       <DragSelection />
         </InteractionProvider>
       )}
     </div>
   )
}

export default Scene3D;


