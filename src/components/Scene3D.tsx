import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import * as THREE from 'three'
import { CameraController } from './CameraController'
import { RendererManager } from './renderers/RendererManager'
import { SelectionRenderer } from './renderers/SelectionRenderer'
import { SelectionHandler } from './ui-handlers/SelectionHandler'
import { SceneObject } from './renderers/BaseRenderer'
import { TerrainRenderer } from './renderers/TerrainRenderer'
import { AreaSelectionRenderer } from './AreaSelectionRenderer'
import { ResourcesBar } from './ResourcesBar'
import { CommandPanel } from './CommandPanel';
import { ISaveManager, IMapLogic } from '@interfaces/index';
import { UpgradesPanel } from './UpgradesPanel';
import { TSceneObject } from '@logic/systems/scene/scene.types'

/** ===================== core three setup ===================== */
function useThreeCore() {
  const scene = useMemo(() => {
    const s = new THREE.Scene()
    s.background = new THREE.Color('#6a5f3e')
    // lights
    const ambient = new THREE.AmbientLight(0x404040, 0.6)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(50, 100, 50)
    dir.castShadow = false
    s.add(ambient, dir)
    ;(s as any).__lights__ = { ambient, dir }
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
      const lights = (scene as any).__lights__
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
  const selectionHandlerRef = useRef<SelectionHandler|null>(null)
  const terrainRendererRef   = useRef<TerrainRenderer|null>(null)
  const areaSelectionRendererRef = useRef<AreaSelectionRenderer|null>(null)
  const mapLogicRef          = useRef<IMapLogic|null>(null)

  useEffect(() => {
    rendererManagerRef.current = new RendererManager(scene, renderer)
    mapLogicRef.current = appMapLogic // Використовуємо переданий MapLogic замість створювати новий

    selectionRendererRef.current = new SelectionRenderer(
      scene,
      (id) => rendererManagerRef.current?.getMeshById(id) || null,
      (id) => mapLogicRef.current?.scene.getObjectById(id) || null
    )

    selectionHandlerRef.current = new SelectionHandler(
      mapLogicRef.current!.selection,
      selectionRendererRef.current!,
      rendererManagerRef.current!,
      camera
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
  }, [scene, camera, renderer])

  return {
    rendererManagerRef,
    selectionRendererRef,
    selectionHandlerRef,
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
      rotateSpeed: 0.01,
      zoomSpeed: 0.2,
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

function useSelectionAndCommands(
  camera: THREE.PerspectiveCamera,
  controller: CameraController,
  mapLogicRef: React.MutableRefObject<IMapLogic|null>,
  rendererManagerRef: React.MutableRefObject<RendererManager|null>,
  selectionRendererRef: React.MutableRefObject<SelectionRenderer|null>,
  selectionHandlerRef: React.MutableRefObject<SelectionHandler|null>,
  getRay: (x:number,y:number)=>THREE.Raycaster,
  selectedCommand: any,
  onCommandUsed?: () => void
) {
  const isLeftDown = useRef(false)
  const isDragging = useRef(false)
  const dragStart = useRef({ x:0, y:0 })
  const dragEnd   = useRef({ x:0, y:0 })

  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const updateSelectedUnits = useCallback(() => {
    const ids = mapLogicRef.current?.selection.getSelectedObjects() ?? []
    setSelectedUnits(ids)
  }, [mapLogicRef])

  const hoverInteractive = useCallback((clientX:number, clientY:number) => {
    const sr = selectionRendererRef.current
    const rm = rendererManagerRef.current
    const map = mapLogicRef.current
    if (!sr || !rm || !map) return

    const ray = getRay(clientX, clientY)
    const inter = map.selection.findInteractableObjects()
    let hovered: string|null = null

    for (const obj of inter) {
      const mesh = rm.getMeshById(obj.id)
      if (!mesh) continue
      const sphere = new THREE.Sphere()
      const { pos, scale } = sr.getCorrectPositionAndScale(obj.id, mesh as any)
      sphere.center.copy(pos)
      sphere.radius = scale.length() * 0.5
      if (ray.ray.intersectsSphere(sphere)) {
        hovered = obj.id
        break
      }
    }
    sr.setHoveredObject(hovered)
  }, [getRay, mapLogicRef, rendererManagerRef, selectionRendererRef])

  const handleObjectSelection = useCallback((evt: MouseEvent) => {
    const sh = selectionHandlerRef.current
    const map = mapLogicRef.current
    if (!sh || !map) return
    const all = Object.values<TSceneObject>(map.scene.getObjects())
    const controlled = all.filter(o => o.tags?.includes('controlled'))
    sh.handleObjectClick(evt, controlled)

    const inter = map.selection.findInteractableObjects()
    selectionRendererRef.current?.highlightInteractiveObjects(inter)
    updateSelectedUnits()
  }, [mapLogicRef, selectionHandlerRef, selectionRendererRef, updateSelectedUnits])

  const handleDragSelection = useCallback(() => {
    const sh = selectionHandlerRef.current
    const map = mapLogicRef.current
    if (!sh || !map) return
    const all = Object.values<TSceneObject>(map.scene.getObjects())
    const controlled = all.filter(o => o.tags?.includes('controlled'))

    const bounds = {
      left: Math.min(dragStart.current.x, dragEnd.current.x),
      right: Math.max(dragStart.current.x, dragEnd.current.x),
      top: Math.min(dragStart.current.y, dragEnd.current.y),
      bottom: Math.max(dragStart.current.y, dragEnd.current.y),
    }
    sh.handleDragSelection(bounds, controlled)

    const inter = map.selection.findInteractableObjects()
    selectionRendererRef.current?.highlightInteractiveObjects(inter)
    updateSelectedUnits()
  }, [mapLogicRef, selectionHandlerRef, selectionRendererRef, updateSelectedUnits])

  const setRoverTarget = useCallback((evt: MouseEvent) => {
    const map = mapLogicRef.current
    const rm = rendererManagerRef.current
    if (!map || !rm) return

    const selected = map.selection.getSelectedObjects()
    if (!selected.length) return

    const ray = getRay(evt.clientX, evt.clientY)
    const all = Object.values<TSceneObject>(map.scene.getObjects())

    // ресурси
    const clickedResource = all.find(o => {
      if (!o.tags?.includes('resource')) return false
      const mesh = rm.getMeshById(o.id)
      if (!mesh) return false
      const sphere = new THREE.Sphere(
        new THREE.Vector3(o.coordinates.x, o.coordinates.y, o.coordinates.z),
        Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5
      )
      return ray.ray.intersectsSphere(sphere)
    })
    if (clickedResource) {
      map.mineResource(clickedResource.id, selected)
      return
    }

    // зарядка
    const clickedCharger = all.find(o => {
      if (!o.tags?.includes('charge')) return false
      const mesh = rm.getMeshById(o.id)
      if (!mesh) return false
      const sphere = new THREE.Sphere(
        new THREE.Vector3(o.coordinates.x, o.coordinates.y, o.coordinates.z),
        Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5
      )
      return ray.ray.intersectsSphere(sphere)
    })
    if (clickedCharger) {
      map.chargeObject(selected)
      return
    }

    // точка на терейні
    const planeAtCam = new THREE.Plane(new THREE.Vector3(0,1,0), -camera.position.y)
    const p = new THREE.Vector3()
    ray.ray.intersectPlane(planeAtCam, p)

    const tm = map.scene.getTerrainManager()
    if (tm) {
      const rayPoints: THREE.Vector3[] = []
      const maxDist = 1000
      const step = 10
      for (let d = 0; d <= maxDist; d += step) {
        rayPoints.push(camera.position.clone().add(ray.ray.direction.clone().multiplyScalar(d)))
      }
      let best = p.clone()
      let bestErr = Infinity
      for (const v of rayPoints) {
        const th = tm.getHeightAt(v.x, v.z)
        if (th === undefined) continue
        const err = Math.abs(v.y - th)
        if (err < bestErr) { bestErr = err; best.set(v.x, th, v.z) }
      }
      p.copy(best)
    }

    // Використовуємо новий оркестратор замість distributeTargetsForObjects
    map.handleRightclickCommand(selected, { x:p.x, y:p.y, z:p.z }, selectedCommand)
    
    // Якщо використали команду - скидаємо її
    if (selectedCommand && onCommandUsed) {
      onCommandUsed()
    }
  }, [camera.position, getRay, mapLogicRef, rendererManagerRef, selectedCommand, onCommandUsed])

  // інтеграція з контролером
  useEffect(() => {
    controller.setOnSetTarget((evt: MouseEvent) => setRoverTarget(evt))
    controller.setOnSelection((evt: MouseEvent) => handleObjectSelection(evt))
    controller.setOnDragStart((start) => {
      isDragging.current = false
      dragStart.current = start
      dragEnd.current = start
    })
    controller.setOnDragEnd(() => {
      if (isDragging.current) handleDragSelection()
    })
  }, [controller, handleDragSelection, handleObjectSelection, setRoverTarget])

  const onMouseDown = useCallback((evt: MouseEvent) => {
    if (evt.button === 0) {
      isLeftDown.current = true
      dragStart.current = { x: evt.clientX, y: evt.clientY }
      dragEnd.current   = dragStart.current
      isDragging.current = false

      if (!evt.shiftKey && selectionHandlerRef.current) {
        selectionHandlerRef.current.handleEmptyClick()
        selectionRendererRef.current?.highlightInteractiveObjects([])
        updateSelectedUnits()
      }
    }
  }, [selectionHandlerRef, selectionRendererRef, updateSelectedUnits])

  const onMouseMove = useCallback((evt: MouseEvent) => {
    hoverInteractive(evt.clientX, evt.clientY)
    if (isLeftDown.current) {
      dragEnd.current = { x: evt.clientX, y: evt.clientY }
      const dx = dragEnd.current.x - dragStart.current.x
      const dy = dragEnd.current.y - dragStart.current.y
      if (Math.hypot(dx,dy) > 5) isDragging.current = true
    }
  }, [hoverInteractive])

  const onMouseUp = useCallback((evt: MouseEvent) => {
    const target = evt.target as HTMLElement
    if (target && (target.closest('.command-panel') || target.closest('button'))) {
      isLeftDown.current = false
      isDragging.current = false
      return
    }
    if (evt.button === 0) {
      if (isDragging.current) handleDragSelection()
      else handleObjectSelection(evt)
      isLeftDown.current = false
      isDragging.current = false
    }
  }, [handleDragSelection, handleObjectSelection])

  return { onMouseDown, onMouseMove, onMouseUp, isDraggingRef: isDragging, dragStartRef: dragStart, dragEndRef: dragEnd, selectedUnits }
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
  areaSelectionRendererRef: React.MutableRefObject<any|null>
) {
  const rafRef = useRef<number>()
  const [fps, setFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick)

    // FPS
    frameCountRef.current++
    const now = performance.now()
    if (now - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current)
      frameCountRef.current = 0
      lastTimeRef.current = now
    }

    controller.handleAutoPan()
    maybeUpdateViewportOnMove()
    checkAndGenerateTerrain()
    autoPanStep()

    // апдейти ефектів
    const rm = rendererManagerRef.current
    if (rm) {
      const tryCall = (key:string, fn:string) => {
        const r = rm.renderers.get(key)
        if (r && fn in r) (r as any)[fn]()
      }
      tryCall('cloud', 'updateAllClouds')
      tryCall('smoke', 'updateAllSmoke')
      tryCall('fire', 'updateAllFire')
      tryCall('explosion', 'updateAllExplosions')
      tryCall('electric-arc', 'updateAllArcs')
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
    scene, syncVisibleObjects, areaSelectionRendererRef
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

const Scene3D: React.FC<Scene3DProps> = ({ saveManager, onShowMainMenu, mapLogic: appMapLogic, game }) => {
  const mountRef = useRef<HTMLDivElement>(null)

  // Додаємо стейт для вибраної команди
  const [selectedCommand, setSelectedCommand] = useState<any>(null)
  


  const { scene, camera, renderer } = useThreeCore()
  const { rendererManagerRef, selectionRendererRef, selectionHandlerRef, terrainRendererRef, areaSelectionRendererRef, mapLogicRef } =
    useMapAndManagers(scene, camera, renderer, appMapLogic)

  const controller = useCameraController(camera, renderer, mapLogicRef)
  const { ensureTargetOnTerrain, updateViewport, maybeUpdateViewportOnMove } =
    useCameraViewportSync(camera, controller, mapLogicRef)

  const { updateTerrainForCamera, checkAndGenerate } =
    useTerrainStreaming(camera, terrainRendererRef, mapLogicRef)

  const { setFromClient: getRay } = useRayFromScreen(camera)

  const {
    onMouseDown, onMouseMove, onMouseUp,
    isDraggingRef, dragStartRef, dragEndRef, selectedUnits
  } = useSelectionAndCommands(
    camera, controller, mapLogicRef,
    rendererManagerRef, selectionRendererRef, selectionHandlerRef, getRay, selectedCommand,
    () => setSelectedCommand(null) // Скидаємо команду після використання
  )

  const { setMouse, step: autoPanStep } =
    useAutoPan(camera, controller, mapLogicRef, updateTerrainForCamera)

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
  const syncVisibleObjects = useCallback(() => {
    const rm = rendererManagerRef.current
    const map = mapLogicRef.current
    if (!rm || !map) return

    const current = map.scene.getVisibleObjects().map<TSceneObject>(obj => ({
      tags: obj.tags,
      id: obj.id,
      type: obj.type,
      coordinates: obj.coordinates,
      scale: obj.scale,
      rotation: obj.rotation,
      data: obj.data
    })) as SceneObject[]

    ;(syncVisibleObjects as any)._prev ??= new Map<string, SceneObject>()
    const prev: Map<string, SceneObject> = (syncVisibleObjects as any)._prev

    const currentIds = new Set(current.map(o => o.id))
    // remove
    for (const [id, oldObj] of prev) {
      if (!currentIds.has(id)) {
        rm.removeObject(id, oldObj.type)
        prev.delete(id)
      }
    }
    // add/update
    for (const obj of current) {
      if (prev.has(obj.id)) {
        rm.updateObject(obj)
      } else {
        rm.renderObject(obj)
        prev.set(obj.id, obj)
      }

      // selection highlight
      if (map.selection.isSelected(obj.id)) {
        const mesh = rm.getMeshById(obj.id)
        if (mesh && (mesh as any).position) {
          selectionRendererRef.current?.updateHighlightPosition(
            obj.id, (mesh as any).position, (mesh as any).scale, (mesh as any).rotation
          )
        }
      }
      // target indicators
      if (obj.tags?.includes('controlled')) {
        const isSel = map.selection.isSelected(obj.id)
        const tgt = (obj.data as any)?.target
        if (tgt && isSel) {
          selectionRendererRef.current?.addTargetIndicator(
            obj.id, new THREE.Vector3(tgt.x, tgt.y, tgt.z)
          )
        } else {
          selectionRendererRef.current?.removeTargetIndicator(obj.id)
        }
      }
    }

    const interactive = map.selection.findInteractableObjects()
    selectionRendererRef.current?.highlightInteractiveObjects(interactive)
  }, [mapLogicRef, rendererManagerRef, selectionRendererRef])

  /** --------- render loop --------- */
  const fps = useRenderLoop(
    scene, camera, renderer, controller,
    rendererManagerRef, maybeUpdateViewportOnMove, checkAndGenerate, autoPanStep,
    syncVisibleObjects, areaSelectionRendererRef
  )

  /** --------- initial helpers + DOM mount --------- */
  useEffect(() => {
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x888888)
    const axes = new THREE.AxesHelper(5)
    scene.add(grid, axes)
    updateViewport()
    ensureTargetOnTerrain()
    return () => {
      scene.remove(grid)
      scene.remove(axes)
      scene.clear()
      renderer.dispose()
    }
  }, [ensureTargetOnTerrain, renderer, scene, updateViewport])

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

    const move = (e: MouseEvent) => { setMouse(e.clientX, e.clientY); onMouseMove(e) }

    window.addEventListener('mousemove', move)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', onResize)
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('wheel', onWheel as any)
      window.removeEventListener('resize', onResize)
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [camera, controller, ensureTargetOnTerrain, onMouseDown, onMouseMove, onMouseUp, renderer, setMouse, updateViewport])

  /** --------- debug HUD state --------- */
  const [visibleObjectsCount, setVisibleObjectsCount] = useState(0)
  const [totalObjectsCount, setTotalObjectsCount] = useState(0)
  const [viewportData, setViewportData] = useState({ centerX: 0, centerY: 0, width: 0, height: 0 })
  const [gridInfo, setGridInfo] = useState({ totalCells: 0, visibleCells: 0 })
  const [currentDistance, setCurrentDistance] = useState(0)

  useEffect(() => {
    let id: number
    const updateUI = () => {
      const map = mapLogicRef.current
      if (map) {
        try {
          const objects = map.scene.getVisibleObjects()
          setVisibleObjectsCount(objects.length)
          setTotalObjectsCount(map.scene.getTotalObjectsCount())
        } catch {}
        setCurrentDistance(Math.round(camera.position.distanceTo(controller.getTarget()) * 100) / 100)
        const sceneLogic: any = map.scene
        const vp = sceneLogic?.viewPort
        if (vp) {
          setViewportData({
            centerX: Math.round(vp.centerX * 100) / 100,
            centerY: Math.round(vp.centerY * 100) / 100,
            width: Math.round(vp.width * 100) / 100,
            height: Math.round(vp.height * 100) / 100,
          })
        }
        const gridSystem = sceneLogic?.gridSystem
        if (gridSystem) {
          setGridInfo({ totalCells: gridSystem.grid.size, visibleCells: sceneLogic.getVisibleGridCellsCount() })
        }
      }
      id = window.setTimeout(updateUI, 250)
    }
    updateUI()
    return () => window.clearTimeout(id)
  }, [camera, controller, mapLogicRef])

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* drag-rect */}
      {isDraggingRef.current && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(dragStartRef.current.x, dragEndRef.current.x),
            top: Math.min(dragStartRef.current.y, dragEndRef.current.y),
            width: Math.abs(dragEndRef.current.x - dragStartRef.current.x),
            height: Math.abs(dragEndRef.current.y - dragStartRef.current.y),
            border: '2px solid #00ff00',
            backgroundColor: 'rgba(0,255,0,0.1)',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        />
      )}

      {/* Main Menu Button */}
      <button
        onClick={onShowMainMenu}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '8px 16px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000
        }}
      >
        Головне меню
      </button>

      {/* Save Game Button */}
      <button
        onClick={() => saveManager.saveGame(1)}
        style={{
          position: 'absolute',
          top: 50,
          right: 10,
          padding: '8px 16px',
          backgroundColor: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000
        }}
      >
        Зберегти гру
      </button>

      

      {/* debug HUD */}
      <div style={{
        position: 'absolute', top: 10, left: 10, color: 'white', fontFamily: 'monospace',
        fontSize: 14, backgroundColor: 'rgba(0,0,0,0.7)', padding: 8, borderRadius: 4, zIndex: 1000
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
        <div>Focus Point: ({Math.round(controller.getTarget().x * 100) / 100}, {Math.round(controller.getTarget().y * 100) / 100}, {Math.round(controller.getTarget().z * 100) / 100})</div>
        <div>Selected Objects: {mapLogicRef.current?.selection.getSelectedCount() || 0}</div>
        <div>Selected Command: {selectedCommand ? (selectedCommand.ui?.name || selectedCommand.name) : 'None'}</div>
      </div>

      {/* Resources Bar */}
      {mapLogicRef.current && (
        <ResourcesBar
          getAvailableResources={() => {
            const all = mapLogicRef.current!.resources.getAllResources()
            const result: Record<string, { current:number; max:number; progress:number }> = {}
            Object.entries<number>(all).forEach(([id, current]) => {
              const max = mapLogicRef.current!.resources.getResourceCapacity(id as any)
              const progress = mapLogicRef.current!.resources.getResourceProgress(id as any)
              result[id] = { current, max, progress }
            })
            return result
          }}
        />
      )}

      {/* Command Panel */}
      <CommandPanel
        selectedUnits={selectedUnits}
        onCommandChange={handleCommandChange}
      />

      {/* Upgrades Panel */}
      <UpgradesPanel game={game} />
    </div>
  )
}

export default Scene3D;


