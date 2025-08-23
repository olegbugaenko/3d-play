import * as THREE from 'three'

export interface CameraControllerOptions {
  enableDamping?: boolean
  dampingFactor?: number
  minDistance?: number
  maxDistance?: number
  panSpeed?: number
  rotateSpeed?: number
  zoomSpeed?: number
}

export class CameraController {
  private camera: THREE.PerspectiveCamera
  private domElement: HTMLElement
  private target: THREE.Vector3
  private options: Required<CameraControllerOptions>
  
  // Стан керування
  private isRightMouseDown = false
  private isLeftMouseDown = false
  private isDragging = false
  private dragStart = { x: 0, y: 0 }
  private dragEnd = { x: 0, y: 0 }
  private mousePosition = { x: 0, y: 0 }
  
  // Callbacks
  private onTargetChange?: (target: THREE.Vector3) => void
  private onCameraMove?: (camera: THREE.PerspectiveCamera) => void
  private onDragStart?: (start: { x: number, y: number }) => void
  private onDragEnd?: (end: { x: number, y: number }) => void
  private onSelection?: (event: MouseEvent) => void
  private onSetTarget?: (event: MouseEvent) => void
  
  // Terrain adjustment
  private getTerrainHeight?: (x: number, z: number) => number | undefined

  constructor(
    camera: THREE.PerspectiveCamera, 
    domElement: HTMLElement, 
    options: CameraControllerOptions = {}
  ) {
    this.camera = camera
    this.domElement = domElement
    this.target = new THREE.Vector3(0, 0, 0)
    
    // Default options
    this.options = {
      enableDamping: true,
      dampingFactor: 0.05,
      minDistance: 1,
      maxDistance: 25,
      panSpeed: 0.05,
      rotateSpeed: 0.01,
      zoomSpeed: 0.2,
      ...options
    }
    
    this.setupEventListeners()
  }

  private setupEventListeners() {
    this.domElement.addEventListener('mousedown', this.handleMouseDown)
    this.domElement.addEventListener('mousemove', this.handleMouseMove)
    this.domElement.addEventListener('mouseup', this.handleMouseUp)
    this.domElement.addEventListener('wheel', this.handleWheel)
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // Public methods for setting callbacks
  public setOnTargetChange(callback: (target: THREE.Vector3) => void) {
    this.onTargetChange = callback
  }

  public setOnCameraMove(callback: (camera: THREE.PerspectiveCamera) => void) {
    this.onCameraMove = callback
  }

  public setOnDragStart(callback: (start: { x: number, y: number }) => void) {
    this.onDragStart = callback
  }

  public setOnDragEnd(callback: (end: { x: number, y: number }) => void) {
    this.onDragEnd = callback
  }

  public setOnSelection(callback: (event: MouseEvent) => void) {
    this.onSelection = callback
  }

  public setOnSetTarget(callback: (event: MouseEvent) => void) {
    this.onSetTarget = callback
  }

  public setGetTerrainHeight(callback: (x: number, z: number) => number | undefined) {
    this.getTerrainHeight = callback
  }

  // Getters
  public getTarget(): THREE.Vector3 {
    return this.target.clone()
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  public getIsDragging(): boolean {
    return this.isDragging
  }

  public getDragBounds() {
    return {
      start: { ...this.dragStart },
      end: { ...this.dragEnd }
    }
  }

  // Private event handlers
  private handleMouseDown = (event: MouseEvent) => {
    if (event.button === 0) { // Ліва кнопка
      this.isLeftMouseDown = true
      this.dragStart = { x: event.clientX, y: event.clientY }
      this.dragEnd = { x: event.clientX, y: event.clientY }
      this.isDragging = false
      
      if (this.onDragStart) {
        this.onDragStart(this.dragStart)
      }
    } else if (event.button === 2) { // Права кнопка
      this.isRightMouseDown = true
      
      if (this.onSetTarget) {
        this.onSetTarget(event)
      }
      
      this.adjustHeightToTerrain()
    }
  }

  private handleMouseMove = (event: MouseEvent) => {
    this.mousePosition = { x: event.clientX, y: event.clientY }
    
    if (this.isLeftMouseDown) {
      this.dragEnd = { x: event.clientX, y: event.clientY }
      
      // Перевіряємо чи це drag (мінімальна відстань для drag)
      const dragDistance = Math.sqrt(
        Math.pow(this.dragEnd.x - this.dragStart.x, 2) + 
        Math.pow(this.dragEnd.y - this.dragStart.y, 2)
      )
      
      if (dragDistance > 5) { // 5 пікселів мінімальна відстань для drag
        this.isDragging = true
      }
      
      this.adjustHeightToTerrain()
    } else if (this.isRightMouseDown) {
      // Обробка обертання камери правою кнопкою
      const deltaX = event.movementX * this.options.rotateSpeed
      const deltaY = event.movementY * this.options.rotateSpeed
      
      this.rotateCamera(deltaX, deltaY)
    }
  }

  private handleMouseUp = (event: MouseEvent) => {
    if (event.button === 0) { // Ліва кнопка
      if (this.isDragging) {
        if (this.onDragEnd) {
          this.onDragEnd(this.dragEnd)
        }
      } else {
        // Звичайний клік - вибір об'єкта
        if (this.onSelection) {
          this.onSelection(event)
        }
      }
      
      this.isLeftMouseDown = false
      this.isDragging = false
    } else if (event.button === 2) { // Права кнопка
      this.isRightMouseDown = false
      this.adjustHeightToTerrain()
    }
  }

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -1 : 1
    
    this.zoomCamera(delta)
  }

  // Camera movement methods
  private rotateCamera(deltaX: number, deltaY: number) {
    // Обертання навколо осі Y (горизонтально)
    const yAxis = new THREE.Vector3(0, 1, 0)
    const rotationMatrix = new THREE.Matrix4()
    rotationMatrix.makeRotationAxis(yAxis, deltaX)
    
    // Обертаємо позицію камери навколо target
    const offset = this.camera.position.clone().sub(this.target)
    offset.applyMatrix4(rotationMatrix)
    this.camera.position.copy(this.target.clone().add(offset))
    
    // Обертання навколо осі X (вертикально) з обмеженнями
    const rightVector = new THREE.Vector3()
    rightVector.crossVectors(this.camera.getWorldDirection(new THREE.Vector3()), yAxis).normalize()
    
    const verticalRotationMatrix = new THREE.Matrix4()
    verticalRotationMatrix.makeRotationAxis(rightVector, deltaY)
    
    const newOffset = this.camera.position.clone().sub(this.target)
    newOffset.applyMatrix4(verticalRotationMatrix)
    const newPosition = this.target.clone().add(newOffset)
    
    // Обмежуємо вертикальний кут (щоб камера не переверталася)
    const currentAngle = Math.atan2(newOffset.y, Math.sqrt(newOffset.x * newOffset.x + newOffset.z * newOffset.z))
    const maxAngle = Math.PI / 2.5 // Максимальний кут 72 градуси
    
    if (Math.abs(currentAngle) < maxAngle) {
      this.camera.position.copy(newPosition)
    }
    
    this.camera.lookAt(this.target)
    
    if (this.onCameraMove) {
      this.onCameraMove(this.camera)
    }
  }

  private zoomCamera(delta: number) {
    const direction = new THREE.Vector3()
    this.camera.getWorldDirection(direction)
    
    // Розраховуємо нову позицію камери
    const newPosition = this.camera.position.clone()
    newPosition.addScaledVector(direction, delta * this.options.zoomSpeed)
    
    // Перевіряємо відстань до точки фокусу
    const newDistance = newPosition.distanceTo(this.target)
    
    // Застосовуємо зум тільки якщо відстань в допустимих межах
    if (newDistance >= this.options.minDistance && newDistance <= this.options.maxDistance) {
      this.camera.position.copy(newPosition)
      
      if (this.onCameraMove) {
        this.onCameraMove(this.camera)
      }
    }
  }

  public panCamera(deltaX: number, deltaY: number) {
    // Отримуємо поточний напрямок камери
    const cameraDirection = new THREE.Vector3()
    this.camera.getWorldDirection(cameraDirection)
    
    // Створюємо вектор "вправо" перпендикулярно до напрямку камери
    const rightVector = new THREE.Vector3()
    rightVector.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize()

    const depthVector = new THREE.Vector3()
    depthVector.copy(cameraDirection)
    depthVector.projectOnPlane(new THREE.Vector3(0, 1, 0)).normalize()
    
    // Обчислюємо правильний напрямок руху
    const movementVector = new THREE.Vector3()
    movementVector.addScaledVector(rightVector, deltaX)
    movementVector.addScaledVector(depthVector, deltaY)
    
    // Зміщуємо точку фокусу та позицію камери
    this.target.add(movementVector)
    this.camera.position.add(movementVector)
    
    if (this.onTargetChange) {
      this.onTargetChange(this.target)
    }
    
    if (this.onCameraMove) {
      this.onCameraMove(this.camera)
    }
  }

  // Automatic panning when mouse is near screen edges
  public handleAutoPan() {
    const { x, y } = this.mousePosition
    const currentCameraDistance = this.camera.position.distanceTo(this.target)
    const panSpeed = this.options.panSpeed * Math.min(5, currentCameraDistance * 0.2)
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

    // Застосовуємо панорамування
    if (panX !== 0 || panY !== 0) {
      this.panCamera(panX, panY)
      this.adjustHeightToTerrain()
      
      // Викликаємо callback для оновлення terrain
      if (this.onCameraMove) {
        this.onCameraMove(this.camera)
      }
    }
  }

  // Terrain height adjustment
  private adjustHeightToTerrain() {
    if (!this.getTerrainHeight) return
    
    const terrainHeight = this.getTerrainHeight(this.target.x, this.target.z)
    if (terrainHeight === undefined) return
    
    // Якщо точка фокусу не на terrain - коригуємо її
    if (Math.abs(this.target.y - terrainHeight) > 0.1) {
      const heightDifference = terrainHeight - this.target.y
      
      // Піднімаємо точку фокусу на висоту terrain
      this.target.y = terrainHeight
      
      // Піднімаємо камеру на ту саму висоту
      this.camera.position.y += heightDifference
      
      if (this.onTargetChange) {
        this.onTargetChange(this.target)
      }
      
      if (this.onCameraMove) {
        this.onCameraMove(this.camera)
      }
    }
  }

  // Public method to update camera aspect ratio
  public updateAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  // Public method to set target
  public setTarget(target: THREE.Vector3) {
    this.target.copy(target)
    this.camera.lookAt(this.target)
    
    if (this.onTargetChange) {
      this.onTargetChange(this.target)
    }
  }

  // Public method to get current distance
  public getDistance(): number {
    return this.camera.position.distanceTo(this.target)
  }

  // Cleanup
  public dispose() {
    this.domElement.removeEventListener('mousedown', this.handleMouseDown)
    this.domElement.removeEventListener('mousemove', this.handleMouseMove)
    this.domElement.removeEventListener('mouseup', this.handleMouseUp)
    this.domElement.removeEventListener('wheel', this.handleWheel)
  }
}
