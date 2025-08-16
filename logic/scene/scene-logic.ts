import { TCameraProps } from '../../shared/camera.types'
import { Vector3, TSceneObject, TSceneViewport, GridCell, GridSystem } from './scene.types'
import * as THREE from 'three'

// Implements basic scene API

export class SceneLogic {

    private objects: Record<string, TSceneObject<any>> = {};
    private viewPort!: TSceneViewport;
    private mapBounds: Vector3 = { x: 2000, y: 2000, z: 400 };
    
    // Grid system для швидкого пошуку об'єктів
    private gridSystem: GridSystem = {
        cellSize: 25, // Зменшуємо розмір клітинки для більш точної фільтрації
        grid: new Map<string, GridCell>()
    };

    /*
    called once WebGL is ready to render objects
    */

    initializeViewport(cameraProps: TCameraProps, mapSize: Vector3 = {x: 2000, y: 2000, z: 400}) {
        // calculate viewport in global coordinates based on camera position, rotation and scale
        this.viewPort = {
            centerX: 0,
            centerY: 0,
            width: 500,
            height: 500
        }
        this.mapBounds = mapSize;
    }

    /**
     * Оновлює viewport на основі позиції та ротації камери
     */
    updateViewport(cameraProps: TCameraProps) {
        // Використовуємо distance передану з фронта
        // Це відстань між камерою та точкою фокусу
        const distance = Math.max(cameraProps.distance, 10); // Мінімум 10 одиниць
        
        // Конвертуємо FOV з градусів в радіани
        const fovRadians = (cameraProps.fov * Math.PI) / 180;
        
        // Розраховуємо розміри viewport на основі FOV та aspect ratio
        const viewportHeight = 2 * distance * Math.tan(fovRadians / 2);
        const viewportWidth = viewportHeight * cameraProps.aspect;
        
        // Простий viewport без складних розрахунків ротації
        const expandedWidth = viewportWidth * 1.1; // Розширюємо на 10%
        const expandedHeight = viewportHeight * 1.1;
        
        // Центруємо viewport на точці фокусу, а не на камері
        // Розраховуємо позицію точки фокусу на основі камери та її напрямку
        const cameraDirection = new THREE.Vector3();
        cameraDirection.setFromSphericalCoords(1, Math.PI/2 - cameraProps.rotation.x, cameraProps.rotation.y);
        
        const focusPoint = {
            x: cameraProps.position.x + cameraDirection.x * distance,
            y: cameraProps.position.y + cameraDirection.y * distance,
            z: cameraProps.position.z + cameraDirection.z * distance
        };
        
        // Оновлюємо viewport
        this.viewPort = {
            centerX: focusPoint.x,
            centerY: focusPoint.z, // Z - це глибина
            width: expandedWidth,
            height: expandedHeight
        };
    }

    /**
     * Отримує ключ гріду для координат
     */
    private getGridKey(coordinates: Vector3): string {
        const gridX = Math.floor(coordinates.x / this.gridSystem.cellSize);
        const gridZ = Math.floor(coordinates.z / this.gridSystem.cellSize);
        return `${gridX},${gridZ}`;
    }

    /**
     * Додає об'єкт до гріду
     */
    private addObjectToGrid(objId: string, coordinates: Vector3): void {
        const gridKey = this.getGridKey(coordinates);
        
        if (!this.gridSystem.grid.has(gridKey)) {
            this.gridSystem.grid.set(gridKey, { objects: new Set() });
        }
        
        this.gridSystem.grid.get(gridKey)!.objects.add(objId);
    }

    /**
     * Видаляє об'єкт з гріду
     */
    private removeObjectFromGrid(objId: string, coordinates: Vector3): void {
        const gridKey = this.getGridKey(coordinates);
        const cell = this.gridSystem.grid.get(gridKey);
        
        if (cell) {
            cell.objects.delete(objId);
            
            // Видаляємо порожню клітинку
            if (cell.objects.size === 0) {
                this.gridSystem.grid.delete(gridKey);
            }
        }
    }

    /**
     * Перевіряє чи об'єкт знаходиться в межах карти
     */
    checkOutOfMapBounds(coordinates: Vector3): boolean {
        const halfX = this.mapBounds.x / 2;
        const halfY = this.mapBounds.y / 2;
        const halfZ = this.mapBounds.z / 2;
        
        return coordinates.x < -halfX || coordinates.x > halfX ||
               coordinates.y < -halfY || coordinates.y > halfY ||
               coordinates.z < -halfZ || coordinates.z > halfZ;
    }

    pushObject(obj: TSceneObject<any>) {
        // Перевіряємо чи об'єкт в межах карти перед додаванням
        if (this.checkOutOfMapBounds(obj.coordinates)) {
            return false; // Об'єкт за межами карти
        }
        
        this.objects[obj.id] = obj;
        this.addObjectToGrid(obj.id, obj.coordinates);
        return true; // Об'єкт успішно додано
    }

    /**
     * Переміщує об'єкт на нову позицію з валідацією меж карти
     */
    moveObject(id: string, newPos: Vector3): boolean {
        const obj = this.objects[id];
        if (!obj) {
            return false; // Об'єкт не знайдено
        }

        // Перевіряємо чи нова позиція в межах карти
        if (this.checkOutOfMapBounds(newPos)) {
            // Об'єкт за межами карти - видаляємо його
            this.removeObjectFromGrid(id, obj.coordinates);
            delete this.objects[id];
            return false;
        }

        // Оновлюємо позицію об'єкта в гріді
        this.removeObjectFromGrid(id, obj.coordinates);
        obj.coordinates = { ...newPos };
        this.addObjectToGrid(id, obj.coordinates);
        
        return true;
    }

    /**
     * Видаляє об'єкт зі сцени та гріду
     */
    removeObject(id: string): boolean {
        const obj = this.objects[id];
        if (!obj) {
            return false; // Об'єкт не знайдено
        }

        this.removeObjectFromGrid(id, obj.coordinates);
        delete this.objects[id];
        return true;
    }

    getObjects() {
        return this.objects;
    }

    getObjectById(id: string) {
        return this.objects[id];
    }

    /**
     * Отримує загальну кількість об'єктів у сцені
     */
    getTotalObjectsCount(): number {
        return Object.keys(this.objects).length;
    }

    /**
     * Отримує грід-села в межах viewport
     */
    private getVisibleGridCells(): string[] {
        const visibleCells: string[] = [];
        const halfWidth = this.viewPort.width / 2;
        const halfHeight = this.viewPort.height / 2;
        
        // Розраховуємо межі viewport
        const minX = this.viewPort.centerX - halfWidth;
        const maxX = this.viewPort.centerX + halfWidth;
        const minZ = this.viewPort.centerY - halfHeight;
        const maxZ = this.viewPort.centerY + halfHeight;
        
        // Розраховуємо межі гріду
        const minGridX = Math.floor(minX / this.gridSystem.cellSize);
        const maxGridX = Math.floor(maxX / this.gridSystem.cellSize);
        const minGridZ = Math.floor(minZ / this.gridSystem.cellSize);
        const maxGridZ = Math.floor(maxZ / this.gridSystem.cellSize);
        
        // Додаємо всі грід-села в межах viewport
        for (let gridX = minGridX; gridX <= maxGridX; gridX++) {
            for (let gridZ = minGridZ; gridZ <= maxGridZ; gridZ++) {
                const gridKey = `${gridX},${gridZ}`;
                if (this.gridSystem.grid.has(gridKey)) {
                    visibleCells.push(gridKey);
                }
            }
        }
        
        return visibleCells;
    }

    /**
     * Отримує кількість видимих грід-сел в поточному viewport
     */
    getVisibleGridCellsCount(): number {
        return this.getVisibleGridCells().length;
    }

    getVisibleObjects() {
        // Отримуємо грід-села в межах viewport
        const visibleGridCells = this.getVisibleGridCells();
        
        // Збираємо всі об'єкти з видимих грід-сел
        const visibleObjectIds = new Set<string>();
        visibleGridCells.forEach(gridKey => {
            const cell = this.gridSystem.grid.get(gridKey);
            if (cell) {
                cell.objects.forEach(objId => {
                    visibleObjectIds.add(objId);
                });
            }
        });
        
        // Повертаємо об'єкти без додаткової фільтрації
        return Array.from(visibleObjectIds)
            .map(id => this.objects[id])
            .filter(Boolean);
    }
    
}