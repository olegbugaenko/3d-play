import * as THREE from 'three';
import { InteractionHandler } from '../InteractionHandler';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';

interface DragBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class SelectionHandler extends InteractionHandler {
  private selectionRenderer: SelectionRenderer;
  private rendererManager: RendererManager;
  private isLeftDown = false;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragEnd = { x: 0, y: 0 };

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    mapLogic: any,
    selectionRenderer: SelectionRenderer,
    rendererManager: RendererManager,
    emit?: (event: string, data?: any) => void
  ) {
    super(scene, camera, mapLogic, emit);
    this.selectionRenderer = selectionRenderer;
    this.rendererManager = rendererManager;
  }

  onEnter(): void {
    // Входимо в режим вибору
    console.log('Entered selection mode');
  }

  onExit(): void {
    // Виходимо з режиму вибору
    this.isLeftDown = false;
    this.isDragging = false;
    console.log('Exited selection mode');
  }

  onContextMenu(event: MouseEvent): void {
    // Обробляємо правий клік для команд
    console.log('Right click detected');
    this.handleRightClick(event);
  }

  onMouseDown(event: MouseEvent): void {
    if (event.button === 0) { // Ліва кнопка миші
      this.isLeftDown = true;
      this.dragStart = { x: event.clientX, y: event.clientY };
      this.dragEnd = { x: event.clientX, y: event.clientY };
      this.isDragging = false;

      if (!event.shiftKey) {
        this.handleEmptyClick();
      }
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (this.isLeftDown) {
      this.dragEnd = { x: event.clientX, y: event.clientY };
      const dx = this.dragEnd.x - this.dragStart.x;
      const dy = this.dragEnd.y - this.dragStart.y;
      
      if (Math.hypot(dx, dy) > 5) {
        this.isDragging = true;
        // Емітуємо подію dragStart
        this.emit?.('dragStart', {
          start: this.dragStart,
          end: this.dragEnd
        });
      }
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (event.button === 0) {
      if (this.isDragging) {
        this.handleDragSelection();
        // Емітуємо подію dragEnd
        this.emit?.('dragEnd');
      } else {
        this.handleObjectSelection(event);
      }
      
      this.isLeftDown = false;
      this.isDragging = false;
    }
  }

  private handleObjectSelection(event: MouseEvent): void {
    const raycaster = this.getRaycaster(event);
    const all = Object.values<TSceneObject>(this.mapLogic.scene.getObjects());
    const controlled = all.filter(o => o.tags?.includes('controlled'));

    // Створюємо масив мешів для перевірки
    const meshesToCheck: THREE.Object3D[] = [];
    controlled.forEach(obj => {
      const mesh = this.rendererManager.getMeshById(obj.id);
      if (mesh) {
        meshesToCheck.push(mesh);
      }
    });

    // Перевіряємо перетин з raycaster
    const intersects = raycaster.intersectObjects(meshesToCheck, true);

    if (intersects.length > 0) {
      // Знайшли об'єкт - знаходимо його ID
      const intersectedMesh = intersects[0].object;
      let selectedObjectId = '';

      // Шукаємо ID об'єкта по мешу
      for (const obj of controlled) {
        const mesh = this.rendererManager.getMeshById(obj.id);
        if (mesh === intersectedMesh || mesh?.children.includes(intersectedMesh as any)) {
          selectedObjectId = obj.id;
          break;
        }
        
        // Додатково перевіряємо всіх батьків intersectedMesh
        let parent = intersectedMesh.parent;
        while (parent) {
          if (parent === mesh) {
            selectedObjectId = obj.id;
            break;
          }
          parent = parent.parent;
        }
        
        if (selectedObjectId) break;
      }

      if (selectedObjectId) {
        this.handleObjectSelectionById(selectedObjectId, event.shiftKey);
      }
    } else {
      // Клікнули по пустому місцю - знімаємо вибір з усіх об'єктів
      this.handleEmptyClick();
    }
  }

  private handleObjectSelectionById(objectId: string, shiftKey: boolean): void {
    if (shiftKey) {
      // Додаємо до вибору
      if (!this.mapLogic.selection.isSelected(objectId)) {
        this.mapLogic.selection.selectObject(objectId);
      }
    } else {
      // Замінюємо вибір
      this.mapLogic.selection.deselectAll();
      this.mapLogic.selection.selectObject(objectId);
    }

    // Оновлюємо інтерактивні об'єкти
    const inter = this.mapLogic.selection.findInteractableObjects();
    this.selectionRenderer.highlightInteractiveObjects(inter);
  }

  private handleEmptyClick(): void {
    this.mapLogic.selection.deselectAll();
    this.selectionRenderer.highlightInteractiveObjects([]);
  }

  private handleDragSelection(): void {
    const all = Object.values<TSceneObject>(this.mapLogic.scene.getObjects());
    const controlled = all.filter(o => o.tags?.includes('controlled'));

    const bounds: DragBounds = {
      left: Math.min(this.dragStart.x, this.dragEnd.x),
      right: Math.max(this.dragStart.x, this.dragEnd.x),
      top: Math.min(this.dragStart.y, this.dragEnd.y),
      bottom: Math.max(this.dragStart.y, this.dragEnd.y),
    };

    controlled.forEach(obj => {
      const mesh = this.rendererManager.getMeshById(obj.id);
      if (!mesh) return;

      // Проектуємо позицію об'єкта на екран
      const screenPosition = mesh.position.clone().project(this.camera);
      const screenX = (screenPosition.x + 1) * window.innerWidth / 2;
      const screenY = (-screenPosition.y + 1) * window.innerHeight / 2;

      // Перевіряємо чи об'єкт попадає в drag selection
      if (screenX >= bounds.left && screenX <= bounds.right && 
          screenY >= bounds.top && screenY <= bounds.bottom) {
        
        if (!this.mapLogic.selection.isSelected(obj.id)) {
          this.mapLogic.selection.selectObject(obj.id);
        }
      }
    });

    // Оновлюємо інтерактивні об'єкти
    const inter = this.mapLogic.selection.findInteractableObjects();
    this.selectionRenderer.highlightInteractiveObjects(inter);
  }

  private handleRightClick(event: MouseEvent): void {
    const selected = this.mapLogic.selection.getSelectedObjects();
    if (!selected.length) return;

    const raycaster = this.getRaycaster(event);
    
    // Використовуємо ефективний метод з SelectionLogic для пошуку інтерактивних об'єктів
    const interactableObjects = this.mapLogic.selection.findInteractableObjects();
    
    // Перевіряємо ресурси та зарядки серед інтерактивних об'єктів
    const clickedResource = interactableObjects.find((o: TSceneObject) => {
      if (!o.tags?.includes('resource')) return false;
      const mesh = this.rendererManager.getMeshById(o.id);
      if (!mesh) return false;
      const sphere = new THREE.Sphere(
        new THREE.Vector3(o.coordinates.x, o.coordinates.y, o.coordinates.z),
        Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5
      );
      return raycaster.ray.intersectsSphere(sphere);
    });

    if (clickedResource) {
      this.mapLogic.mineResource(clickedResource.id, selected);
      return;
    }

    const clickedCharger = interactableObjects.find((o: TSceneObject) => {
      if (!o.tags?.includes('charge')) return false;
      const mesh = this.rendererManager.getMeshById(o.id);
      if (!mesh) return false;
      const sphere = new THREE.Sphere(
        new THREE.Vector3(o.coordinates.x, o.coordinates.y, o.coordinates.z),
        Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5
      );
      return raycaster.ray.intersectsSphere(sphere);
    });

    if (clickedCharger) {
      this.mapLogic.chargeObject(selected);
      return;
    }
    
    // Отримуємо точку кліку на террейні
    const planeAtCam = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.camera.position.y);
    const p = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeAtCam, p);

    const tm = this.mapLogic.scene.getTerrainManager();
    if (tm) {
      const rayPoints: THREE.Vector3[] = [];
      const maxDist = 1000;
      const step = 10;
      for (let d = 0; d <= maxDist; d += step) {
        rayPoints.push(this.camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(d)));
      }
      let best = p.clone();
      let bestErr = Infinity;
      for (const v of rayPoints) {
        const th = tm.getHeightAt(v.x, v.z);
        if (th === undefined) continue;
        const err = Math.abs(v.y - th);
        if (err < bestErr) { bestErr = err; best.set(v.x, th, v.z); }
      }
      p.copy(best);
    }

    console.log('Right click at terrain point:', p);
    
    // Відправляємо вибрані юніти до цієї точки
    const selectedUnits = this.mapLogic.selection.getSelectedObjects();
    if (selectedUnits.length > 0) {
      // Використовуємо той самий метод, що і в CommandHandler
      this.mapLogic.handleRightclickCommand(selectedUnits, { x: p.x, y: p.y, z: p.z }, null);
    }
  }
}
