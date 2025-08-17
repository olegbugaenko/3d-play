import { TCameraProps } from '../../shared/camera.types'
import { Vector3, TSceneObject, TSceneViewport, GridCell, GridSystem } from './scene.types'
import { TerrainManager, TerrainConfig } from './terrain-manager'
import { MAP_CONFIG } from '../map/map-config'
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

    // Кеш тегів для швидкого доступу
    private tagCache: Map<string, Set<string>> = new Map();

    // Terrain system
    private terrainManager: TerrainManager | null = null;

    constructor() {
        // TerrainManager буде створений в initializeViewport
    }

    /*
    called once WebGL is ready to render objects
    */

    initializeViewport(cameraProps: TCameraProps, mapSize: Vector3 = {x: 2000, y: 2000, z: 400}) {
        // calculate viewport in global coordinates based on camera position, rotation and scale
        this.updateViewport(cameraProps);
        this.mapBounds = mapSize;

        // Ініціалізуємо terrain з розмірами мапи
        const terrainConfig: TerrainConfig = {
            width: mapSize.x,  // Використовуємо ширину мапи
            height: mapSize.z,  // Використовуємо глибину мапи (Z)
            resolution: MAP_CONFIG.terrain.resolution,     // Data resolution для пам'яті
            maxHeight: MAP_CONFIG.terrain.maxHeight,      // Максимальна висота
            minHeight: MAP_CONFIG.terrain.minHeight,      // Мінімальна висота
            noise: MAP_CONFIG.terrain.noise,              // Налаштування noise
            textures: MAP_CONFIG.terrain.textures         // Текстурні налаштування
        };
        this.terrainManager = new TerrainManager(terrainConfig);
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
        
        // Додаємо теги до кешу якщо вони є
        if (obj.tags && obj.tags.length > 0) {
            this.addObjectTags(obj.id, obj.tags);
        }
        
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
        
        // Видаляємо теги з кешу якщо вони є
        if (obj.tags && obj.tags.length > 0) {
            this.removeObjectTags(id, obj.tags);
        }
        
        delete this.objects[id];
        return true;
    }

    /**
     * Додає об'єкт з автоматичним розміщенням на terrain
     */
    pushObjectWithTerrainConstraint(obj: TSceneObject<any>): boolean {
        // Перевіряємо чи об'єкт має тег on-ground
        if (obj.tags && obj.tags.includes('on-ground')) {
            // Примусово розміщуємо на terrain
            const terrainHeight = this.terrainManager?.getHeightAt(obj.coordinates.x, obj.coordinates.z);
            if (terrainHeight !== undefined) {
                // Використовуємо bottomAnchor для правильного розміщення
                const bottomOffset = obj.bottomAnchor || 0; // За замовчуванням 0 (центр)
                obj.coordinates.y = terrainHeight - bottomOffset;
                
                // Якщо включено terrainAlign - нахиляємо об'єкт по нормалі
                if (obj.terrainAlign && this.terrainManager) {
                    const normal = this.terrainManager.getNormalAt(obj.coordinates.x, obj.coordinates.z);
                    if (normal) {
                        const angleX = Math.atan2(normal.z, normal.y); // Нахил вперед/назад
                        const angleZ = Math.atan2(normal.x, normal.y); // Нахил вліво/вправо
                        
                        obj.rotation.x = angleX;
                        obj.rotation.z = angleZ;
                        
                        // console.log(`Object ${obj.id} aligned to terrain: normal(${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)}), rotation(${(angleX * 180 / Math.PI).toFixed(1)}°, ${(angleZ * 180 / Math.PI).toFixed(1)}°)`);
                    }
                }
            }
        }
        
        return this.pushObject(obj);
    }

    /**
     * Переміщує об'єкт з terrain constraint
     */
    moveObjectWithTerrainConstraint(id: string, newPos: Vector3): boolean {
        const obj = this.objects[id];
        if (!obj) {
            return false;
        }

        // Застосовуємо terrain constraint для on-ground об'єктів
        if (obj.tags && obj.tags.includes('on-ground')) {
            const terrainHeight = this.terrainManager?.getHeightAt(newPos.x, newPos.z);
            if (terrainHeight !== undefined) {
                // Використовуємо bottomAnchor для правильного розміщення
                const bottomOffset = obj.bottomAnchor || 0;
                newPos.y = terrainHeight - bottomOffset;
                
                // Якщо включено terrainAlign - нахиляємо об'єкт по нормалі
                if (obj.terrainAlign && this.terrainManager) {
                    const normal = this.terrainManager.getNormalAt(newPos.x, newPos.z);
                    if (normal) {
                        const angleX = Math.atan2(normal.z, normal.y);
                        const angleZ = Math.atan2(normal.x, normal.y);
                        
                        obj.rotation.x = angleX;
                        obj.rotation.z = angleZ;
                    }
                }
            }
        }

        return this.moveObject(id, newPos);
    }

    /**
     * Отримує TerrainManager для зовнішнього доступу
     */
    getTerrainManager(): TerrainManager | null {
        return this.terrainManager;
    }

    /**
     * Перевіряє terrain constraint для об'єкта
     */
    validateTerrainConstraint(obj: TSceneObject<any>): boolean {
        if (obj.tags && obj.tags.includes('on-ground')) {
            return this.terrainManager?.canPlaceObjectAt(obj.coordinates) || false;
        }
        return true; // Для не on-ground об'єктів constraint не застосовується
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
        const minGridX = Math.floor(minX / this.gridSystem.cellSize)-1;
        const maxGridX = Math.floor(maxX / this.gridSystem.cellSize)+1;
        const minGridZ = Math.floor(minZ / this.gridSystem.cellSize)-1;
        const maxGridZ = Math.floor(maxZ / this.gridSystem.cellSize)+1;
        
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
    
    // Методи для роботи з тегами
    addObjectTags(id: string, tags: string[]): void {
        const obj = this.objects[id];
        if (!obj) return;

        // Ініціалізуємо теги якщо їх немає
        if (!obj.tags) {
            obj.tags = [];
        }

        // Додаємо теги до об'єкта
        obj.tags = [...new Set([...obj.tags, ...tags])];

        // Оновлюємо кеш тегів
        tags.forEach(tag => {
            if (!this.tagCache.has(tag)) {
                this.tagCache.set(tag, new Set());
            }
            this.tagCache.get(tag)!.add(id);
        });
    }

    removeObjectTags(id: string, tags: string[]): void {
        const obj = this.objects[id];
        if (!obj) return;

        // Видаляємо теги з об'єкта
        obj.tags = obj.tags.filter(tag => !tags.includes(tag));

        // Оновлюємо кеш тегів
        tags.forEach(tag => {
            const tagSet = this.tagCache.get(tag);
            if (tagSet) {
                tagSet.delete(id);
                if (tagSet.size === 0) {
                    this.tagCache.delete(tag);
                }
            }
        });
    }

    getObjectsByTag(tag: string): TSceneObject<any>[] {
        const objectIds = this.tagCache.get(tag);
        if (!objectIds) return [];

        return Array.from(objectIds)
            .map(id => this.objects[id])
            .filter(Boolean);
    }

    getObjectsByTags(tags: string[]): TSceneObject<any>[] {
        if (tags.length === 0) return [];

        // Знаходимо перетин всіх тегів
        const commonIds = tags.reduce((common, tag) => {
            const tagIds = this.tagCache.get(tag);
            if (!tagIds) return new Set();
            
            if (common.size === 0) return new Set(tagIds);
            return new Set([...common].filter(id => tagIds.has(id)));
        }, new Set<string>());

        return Array.from(commonIds)
            .map(id => this.objects[id])
            .filter(Boolean);
    }

    getObjectsByAnyTag(tags: string[]): TSceneObject<any>[] {
        if (tags.length === 0) return [];

        const allIds = new Set<string>();
        tags.forEach(tag => {
            const tagIds = this.tagCache.get(tag);
            if (tagIds) {
                tagIds.forEach(id => allIds.add(id));
            }
        });

        return Array.from(allIds)
            .map(id => this.objects[id])
            .filter(Boolean);
    }

    getAllTags(): string[] {
        return Array.from(this.tagCache.keys());
    }

    getObjectsCountByTag(tag: string): number {
        return this.tagCache.get(tag)?.size || 0;
    }
}