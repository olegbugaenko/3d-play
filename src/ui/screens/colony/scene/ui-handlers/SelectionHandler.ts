import * as THREE from 'three';
import { TSceneObject } from '@scene/scene.types';
import { SelectionLogic } from '@scene/selection/SelectionLogic';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';

interface DragBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export class SelectionHandler {
    constructor(
        private selectionLogic: SelectionLogic,
        private selectionRenderer: SelectionRenderer,
        private rendererManager: RendererManager,
        private camera: THREE.Camera
    ) {}

    /**
     * Обробляє клік по об'єкту
     */
    handleObjectClick(event: MouseEvent, controlledObjects: TSceneObject[]): void {
        // Отримуємо координати миші в нормалізованих координатах (-1 до 1)
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Створюємо raycaster для визначення об'єкта під курсором
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        // Створюємо масив мешів для перевірки
        const meshesToCheck: THREE.Object3D[] = [];
        controlledObjects.forEach(obj => {
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
            for (const obj of controlledObjects) {
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
                this.handleObjectSelection(selectedObjectId, event.shiftKey);
            }
        } else {
            // Клікнули по пустому місцю - знімаємо вибір з усіх об'єктів
            this.handleEmptyClick();
        }
    }

    /**
     * Обробляє drag selection
     */
    handleDragSelection(dragBounds: DragBounds, controlledObjects: TSceneObject[]): void {
        controlledObjects.forEach(obj => {
            const mesh = this.rendererManager.getMeshById(obj.id);
            if (!mesh) return;

            // Проектуємо позицію об'єкта на екран
            const screenPosition = mesh.position.clone().project(this.camera);
            const screenX = (screenPosition.x + 1) * window.innerWidth / 2;
            const screenY = (-screenPosition.y + 1) * window.innerHeight / 2;

            // Перевіряємо чи об'єкт попадає в drag selection
            if (screenX >= dragBounds.left && screenX <= dragBounds.right && 
                screenY >= dragBounds.top && screenY <= dragBounds.bottom) {
                
                if (mesh instanceof THREE.Mesh && !this.selectionLogic.isSelected(obj.id)) {
                    this.selectionLogic.selectObject(obj.id);
                    this.selectionRenderer.addSelectionHighlight(obj.id, mesh);
                }
            }
        });
    }

    /**
     * Обробляє вибір конкретного об'єкта
     */
    private handleObjectSelection(selectedObjectId: string, isShiftKey: boolean): void {
        const objectMesh = this.rendererManager.getMeshById(selectedObjectId);
        if (!objectMesh || !(objectMesh instanceof THREE.Mesh)) return;

                if (isShiftKey) {
          // Shift+клік - додаємо до селекції
          if (this.selectionLogic.isSelected(selectedObjectId)) {
            this.selectionLogic.deselectObject(selectedObjectId);
            this.selectionRenderer.removeSelectionHighlight(selectedObjectId);
          } else {
            this.selectionLogic.selectObject(selectedObjectId);
            this.selectionRenderer.addSelectionHighlight(selectedObjectId, objectMesh);
          }
        } else {
          // Звичайний клік - знімаємо попередній вибір і вибираємо новий
          this.selectionLogic.deselectAll();
          this.selectionRenderer.clearAll();
          this.selectionLogic.selectObject(selectedObjectId);
          this.selectionRenderer.addSelectionHighlight(selectedObjectId, objectMesh);
        }
    }

    /**
     * Обробляє клік по пустому місцю
     */
    public handleEmptyClick(): void {
        this.selectionLogic.deselectAll();
        this.selectionRenderer.clearAll();
    }

    /**
     * Оновлює позиції підсвічувань для рухомих об'єктів
     */
    updateHighlightPositions(): void {
        const selectedObjects = this.selectionLogic.getSelectedObjects();
        
        selectedObjects.forEach(objectId => {
            const mesh = this.rendererManager.getMeshById(objectId);
            if (mesh && mesh instanceof THREE.Mesh) {
                this.selectionRenderer.updateHighlightPosition(
                    objectId, 
                    mesh.position, 
                    mesh.scale, 
                    mesh.rotation
                );
            }
        });
    }

    /**
     * Очищає всі підсвічування при розмонтуванні
     */
    dispose(): void {
        this.selectionRenderer.clearAll();
    }
}
