import { TCameraProps } from '@shared/types/camera.types'
import { TSceneObject, TSceneViewport, GridCell, GridSystem } from './scene.types'
import { Vector3, orientOnSurfaceEulerXYZ } from '@utils/vector-math'
import { TerrainManager, TerrainConfig } from './terrain-manager'
import { MAP_CONFIG } from '../map/map-config'
import * as THREE from 'three'
import { ISceneLogic } from '@interfaces/index'
import { PathfindingSystem } from './path-finding/pathfinding-system'
import { OccupancyGridStore } from './path-finding/occupancy-grid'

// Implements basic scene API

export class SceneLogic implements ISceneLogic {

    private objects: Record<string, TSceneObject<any>> = {};
    private viewPort!: TSceneViewport;
    private mapBounds: Vector3 = { x: 2000, y: 2000, z: 400 };
    public postponedRegeneration: boolean = false;

    // Grid system для швидкого пошуку об'єктів
    private gridSystem: GridSystem = {
        cellSize: 25, // Зменшуємо розмір клітинки для більш точної фільтрації
        grid: new Map<string, GridCell>()
    };

    // Кеш тегів для швидкого доступу
    private tagCache: Map<string, Set<string>> = new Map();

    // 🚀 СИСТЕМА DIRTY FLAGS ДЛЯ ОПТИМІЗАЦІЇ
    private dirtyObjects: Set<string> = new Set();

    // 🚀 МЕТОДИ ДЛЯ РОБОТИ З DIRTY FLAGS
    public markObjectDirty(id: string): void {
        this.dirtyObjects.add(id);
    }

    /**
     * 🚀 Синхронізує rotation2D з rotation через логіку террейну
     */
    public syncRotation(obj: TSceneObject): void {

        // Якщо включено terrainAlign - нахиляємо об'єкт по нормалі
        if (obj.terrainAlign && this.terrainManager) {
            const normal = this.terrainManager.getNormalAt(obj.coordinates.x, obj.coordinates.z);
            if (normal) {
                // Правильні формули для обертання по нормалі
                const angleX = Math.atan2(-normal.z, normal.y); // Нахил вперед/назад (X-обертання)
                const angleZ = Math.atan2(normal.x, normal.y);  // Нахил вліво/вправо (Z-обертання)
                
                obj.rotation.x = -angleX;
                obj.rotation.z = -angleZ;
                
                // 🔥 НОВА ЛОГІКА: Додаємо 2D ротацію відносно нормалі
                if (obj.rotation2D !== undefined) {
                    obj.rotation = this.calculateRotationRelativeToNormal(obj.rotation2D, normal);
                }
            }
        } else if(obj.rotation2D) {
            // Для звичайних об'єктів просто копіюємо Y ротацію
            obj.rotation.y = obj.rotation2D;
        }

        // Позначаємо ротацію як dirty
        if (obj._dirtyFlags) {
            obj._dirtyFlags.rotation = true;
            obj._lastUpdate = Date.now();
        }

        // Маркуємо об'єкт як dirty
        this.markObjectDirty(obj.id);
    }


    private isObjectDirty(id: string): boolean {
        return this.dirtyObjects.has(id);
    }

    private clearAllDirtyFlags(): void {
        this.dirtyObjects.clear();
    }

    /**
     * Перевіряє чи об'єкт має dirty flags
     */
    private hasDirtyFlags(obj: TSceneObject<any>): boolean {
        if (!obj._dirtyFlags) return false;
        
        return obj._dirtyFlags.position ||
               obj._dirtyFlags.scale ||
               obj._dirtyFlags.rotation ||
               obj._dirtyFlags.data ||
               obj._dirtyFlags.tags ||
               obj._dirtyFlags.visibility;
    }

    /**
     * Отримує тільки змінені об'єкти для оптимізованої синхронізації
     */
    public getDirtyObjects(): TSceneObject<any>[] {
        const dirtyObjects: TSceneObject<any>[] = [];
        for (const id of this.dirtyObjects) {
            const obj = this.objects[id];
            if (obj) {
                dirtyObjects.push(obj);
            }
        }
        return dirtyObjects;
    }

    /**
     * Отримує всі видимі об'єкти з флагом needUpdate на основі dirty flags
     */
    public getVisibleObjectsOptimized(): TSceneObject<any>[] {
        const allVisible = this.getVisibleObjects();
        
        return allVisible.map(obj => ({
            ...obj,
            needUpdate: this.isObjectDirty(obj.id) || this.hasDirtyFlags(obj)
        }));
    }

    /**
     * 🚀 Очищає dirty flags після синхронізації
     */
    public clearDirtyFlagsAfterSync(): void {
        for (const id of this.dirtyObjects) {
            const obj = this.objects[id];
            if (obj && obj._dirtyFlags) {
                // Очищаємо всі dirty flags
                obj._dirtyFlags.position = false;
                obj._dirtyFlags.scale = false;
                obj._dirtyFlags.rotation = false;
                obj._dirtyFlags.data = false;
                obj._dirtyFlags.tags = false;
                obj._dirtyFlags.visibility = false;
            }
        }
        // Очищаємо Set з dirty об'єктів
        this.dirtyObjects.clear();
    }

    // Terrain system
    private terrainManager: TerrainManager | null = null;

    public pathfinder: PathfindingSystem;

    constructor() {
        // Створюємо TerrainManager з MAP_CONFIG розмірами
        const terrainConfig: TerrainConfig = {
            width: MAP_CONFIG.width,      // Ширина мапи по X
            height: MAP_CONFIG.depth,     // Глибина мапи по Z (використовуємо depth як height для terrain)
            resolution: MAP_CONFIG.terrain.resolution,     // Data resolution для пам'яті
            maxHeight: MAP_CONFIG.terrain.maxHeight,      // Максимальна висота
            minHeight: MAP_CONFIG.terrain.minHeight,      // Мінімальна висота
            seed: MAP_CONFIG.generation.defaultSeed,      // Seed для детермінованої генерації
            noise: MAP_CONFIG.terrain.noise,              // Налаштування noise
            textures: MAP_CONFIG.terrain.textures         // Текстурні налаштування
        };
        this.terrainManager = new TerrainManager(terrainConfig);
        
        const grid = new OccupancyGridStore(
            MAP_CONFIG.width *4,
            MAP_CONFIG.height *4,
            0.5,
            -MAP_CONFIG.width,
            -MAP_CONFIG.height
        )
        this.pathfinder = new PathfindingSystem(grid);

        this.pathfinder.grid.computeClearanceMeters();

        // ResourceManager буде встановлений ззовні
    }

    public rebuildObstacles(bResume = false) {
        if(bResume) {
            this.postponedRegeneration = false;
        }
        if(!this.postponedRegeneration) {
            this.pathfinder.grid.rebuildClearanceAfterStaticsChanged();
        }
    }

    private isStaticObstacle(obj: TSceneObject<any>) {
        return !!obj.obstacleSize && obj.tags?.includes('static');
    }
    
    private isDynamicObstacle(obj: TSceneObject<any>) {
        return !!obj.obstacleSize && !obj.tags?.includes('static');
    }
    
    // Викликаєш один раз після пачкового додавання статиків:
    public finalizeStatics(): void {
        this.rebuildObstacles(true);
    }

    /*
    called once WebGL is ready to render objects
    */

    initializeViewport(cameraProps: TCameraProps, mapSize: Vector3 = {x: 2000, y: 2000, z: 400}) {
        // calculate viewport in global coordinates based on camera position, rotation and scale
        this.updateViewport(cameraProps);
        this.mapBounds = mapSize;

        // TerrainManager вже створений в конструкторі з MAP_CONFIG розмірами
        // Не потрібно створювати новий
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
        
        // Оновлюємо viewport
        // centerX = X координата камери, centerZ = Z координата камери
        this.viewPort = {
            centerX: cameraProps.position.x,
            centerY: cameraProps.position.z, // centerY фактично зберігає Z координату
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
        
        // 🚀 Ініціалізуємо dirty flags для нового об'єкта
        obj._dirtyFlags = {
            position: true,
            scale: true,
            rotation: true,
            data: true,
            tags: true,
            visibility: true
        };
        obj._lastUpdate = Date.now();
        
        this.objects[obj.id] = obj;
        this.addObjectToGrid(obj.id, obj.coordinates);
        
        // Додаємо теги до кешу якщо вони є
        if (obj.tags && obj.tags.length > 0) {
            this.addObjectTags(obj.id, obj.tags);
        }

        if(obj.obstacleSize) {
            // додаємо у масив перешкод
            if(obj.tags.includes('static')) {
                this.pathfinder.grid.addStaticCircle(
                    obj.id,
                    obj.coordinates.x,
                    obj.coordinates.z,
                    obj.obstacleSize
                )
                this.rebuildObstacles();
            } else {
                this.pathfinder.grid.addDynamicRaw(
                    obj.id,
                    obj.coordinates.x,
                    obj.coordinates.z,
                    obj.obstacleSize
                );
            }
        }
        
        // 🚀 Позначаємо як dirty для синхронізації
        this.markObjectDirty(obj.id);
        
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
        
        // 🚀 Позначаємо позицію як dirty
        if (obj._dirtyFlags) {
            obj._dirtyFlags.position = true;
            obj._lastUpdate = Date.now();
        }
        
        if (this.isDynamicObstacle(obj) && obj.obstacleSize) {
            this.pathfinder.grid.moveDynamicRaw?.(
                id,
                obj.coordinates.x,
                obj.coordinates.z,
                obj.obstacleSize
            );
        }
        
        // 🚀 Позначаємо як dirty для синхронізації
        this.markObjectDirty(id);
        
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

        // 🚀 КРИТИЧНО: Спочатку очищаємо tagCache ПЕРЕД видаленням об'єкта!
        if (obj.tags && obj.tags.length > 0) {
            this.removeObjectTags(id, obj.tags);
        }

        this.removeObjectFromGrid(id, obj.coordinates);
        
        if (obj.obstacleSize) {
            if (this.isStaticObstacle(obj)) {
                this.pathfinder.grid.removeStatic(id);
                // оскільки видалення статики рідкісне — перерахувати clearance одразу
                this.rebuildObstacles();
            } else if (this.isDynamicObstacle(obj)) {
                this.pathfinder.grid.removeDynamicRaw?.(id);
            }
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
                    this.syncRotation(obj);
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
                     this.syncRotation(obj);
                 }
            }
        }

        return this.moveObject(id, newPos);
    }

    /**
     * Отримує TerrainManager для Dependency Injection
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

    getObjects():Record<string, TSceneObject> {
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
        // centerY фактично зберігає Z координату (див. updateViewport)
        const minX = this.viewPort.centerX - halfWidth;
        const maxX = this.viewPort.centerX + halfWidth;
        const minZ = this.viewPort.centerY - halfHeight;  // centerY = Z координата
        const maxZ = this.viewPort.centerY + halfHeight;  // centerY = Z координата
        
        // Розраховуємо межі гріду з запасом для плавного переходу
        const minGridX = Math.floor(minX / this.gridSystem.cellSize) - 3;
        const maxGridX = Math.floor(maxX / this.gridSystem.cellSize) + 3;
        const minGridZ = Math.floor(minZ / this.gridSystem.cellSize) - 3;
        const maxGridZ = Math.floor(maxZ / this.gridSystem.cellSize) + 3;

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

    /**
     * Отримує об'єкти в радіусі від заданої точки, використовуючи gridSystem
     * @param center - центр пошуку
     * @param radius - радіус пошуку
     * @returns масив об'єктів в радіусі
     */
    getObjectsInRadius(center: { x: number; y: number; z: number }, radius: number): TSceneObject<any>[] {
        // Перевіряємо чи існує gridSystem
        if (!this.gridSystem || !this.gridSystem.grid) {
            return [];
        }

        const objectIds = new Set<string>();
        const cellSize = this.gridSystem.cellSize;
        
        // Конвертуємо радіус у кількість комірок (з запасом)
        const cellsRadius = Math.ceil(radius / cellSize) + 1;
        
        // Конвертуємо центр у індекси гріда
        const centerGridX = Math.floor(center.x / cellSize);
        const centerGridZ = Math.floor(center.z / cellSize); // Z координата
        
        // Проходимо по комірках в радіусі
        for (let gridX = centerGridX - cellsRadius; gridX <= centerGridX + cellsRadius; gridX++) {
            for (let gridZ = centerGridZ - cellsRadius; gridZ <= centerGridZ + cellsRadius; gridZ++) {
                const gridKey = `${gridX},${gridZ}`;
                const cell = this.gridSystem.grid.get(gridKey);
                
                if (cell) {
                    // Додаємо всі об'єкти з цієї комірки
                    cell.objects.forEach(objId => {
                        objectIds.add(objId);
                    });
                }
            }
        }
        
        // Конвертуємо ID в об'єкти та фільтруємо по відстані
        return Array.from(objectIds)
            .map(id => this.objects[id])
            .filter(Boolean)
            .filter(obj => {
                const distance = Math.sqrt(
                    Math.pow(obj.coordinates.x - center.x, 2) + 
                    Math.pow(obj.coordinates.z - center.z, 2)
                );
                return distance <= radius + (obj.obstacleSize || 0);
            });
    }



    /**
     * Дебаг метод для перевірки viewport та гріду
     */
    debugViewportAndGrid(): void {
        // Viewport debug info
    }

    getVisibleObjects(options: { filterByCommands?: Set<string> } = {}) {
        // Перевіряємо чи існує gridSystem
        if (!this.gridSystem || !this.gridSystem.grid) {
            return [];
        }

        // Отримуємо грід-села в межах viewport
        const visibleGridCells = this.getVisibleGridCells();

        const fires: Record<string, any> = {};
        
        // Збираємо всі об'єкти з видимих грід-сел
        const visibleObjectIds = new Set<string>();
        visibleGridCells.forEach(gridKey => {
            const cell = this.gridSystem.grid.get(gridKey);
            if (cell) {
                cell.objects.forEach(objId => {
                    visibleObjectIds.add(objId);
                    const obj = this.objects[objId];
                    if (obj && obj.type === 'fire') {
                        fires[objId] = obj;
                    }
                });
            }
        });
        
        // Отримуємо базові видимі об'єкти
        let objects = Array.from(visibleObjectIds)
            .map(id => this.objects[id])
            .filter(Boolean);

        
        // Додатковий фільтр по командах якщо потрібно
        if (options.filterByCommands?.size) {
            objects = objects.filter(obj => 
                obj.targetType && 
                this.hasMatchingCommands(obj.targetType, options.filterByCommands!)
            );
        }
        
        return objects;
    }
    
    private hasMatchingCommands(targetType: string[], availableCommands: Set<string>): boolean {
        return targetType.some(cmd => availableCommands.has(cmd));
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

    /**
     * 🚀 Безпечно встановлює теги об'єкта (повна заміна)
     */
    setObjectTags(id: string, tags: string[]): void {
        const obj = this.objects[id];
        if (!obj) return;
        
        // Видаляємо старі теги з кешу
        if (obj.tags && obj.tags.length > 0) {
            this.removeObjectTags(id, obj.tags);
        }
        
        // Встановлюємо нові теги
        obj.tags = [...tags];
        
        // Додаємо нові теги в кеш
        if (tags.length > 0) {
            this.addObjectTags(id, tags);
        }
    }

    /**
     * 🚀 Безпечно оновлює теги об'єкта (додає нові, видаляє старі)
     */
    updateObjectTags(id: string, newTags: string[], removeTags: string[] = []): void {
        const obj = this.objects[id];
        if (!obj) return;
        
        // Видаляємо старі теги
        if (removeTags.length > 0) {
            this.removeObjectTags(id, removeTags);
        }
        
        // Додаємо нові теги
        if (newTags.length > 0) {
            this.addObjectTags(id, newTags);
        }
    }

    getObjectsByTag(tag: string): TSceneObject<any>[] {
        const objectIds = this.tagCache.get(tag);
        if (!objectIds) return [];

        return Array.from(objectIds)
            .map(id => this.objects[id])
            .filter(Boolean);
    }

    /**
     * 🚀 Валідує консистентність tagCache
     */
    validateTagCache(): { isValid: boolean; issues: string[] } {
        const issues: string[] = [];
        
        // Перевіряємо чи всі об'єкти в tagCache існують
        this.tagCache.forEach((objectIds, tag) => {
            objectIds.forEach(id => {
                if (!this.objects[id]) {
                    issues.push(`Tag '${tag}' references non-existent object '${id}'`);
                }
            });
        });
        
        // Перевіряємо чи всі теги об'єктів є в tagCache
        Object.values(this.objects).forEach(obj => {
            if (obj.tags) {
                obj.tags.forEach(tag => {
                    const tagSet = this.tagCache.get(tag);
                    if (!tagSet || !tagSet.has(obj.id)) {
                        issues.push(`Object '${obj.id}' has tag '${tag}' but not in tagCache`);
                    }
                });
            }
        });
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * 🚀 Очищає tagCache від неіснуючих об'єктів
     */
    cleanupTagCache(): void {
        this.tagCache.forEach((objectIds, tag) => {
            const validIds = new Set<string>();
            
            objectIds.forEach(id => {
                if (this.objects[id]) {
                    validIds.add(id);
                }
            });
            
            if (validIds.size === 0) {
                this.tagCache.delete(tag);
            } else if (validIds.size !== objectIds.size) {
                this.tagCache.set(tag, validIds);
            }
        });
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

    /**
     * Знаходить об'єкти з певним тегом в межах радіуса від центру
     */
    getObjectsByTagInRadius(tag: string, center: { x: number; y: number; z: number }, radius: number): TSceneObject<any>[] {
        const objectsWithTag = this.getObjectsByTag(tag);
        
        return objectsWithTag.filter(obj => {
            const distance = Math.sqrt(
                Math.pow(obj.coordinates.x - center.x, 2) + 
                Math.pow(obj.coordinates.y - center.y, 2) + 
                Math.pow(obj.coordinates.z - center.z, 2)
            );

            return distance <= radius + (obj.obstacleSize || 0);
        });
    }

    /**
     * Розраховує rotation.y відносно нормалі поверхні
     * @param rotation2D - 2D кут ротації (в радіанах)
     * @param normal - нормаль поверхні
     * @returns rotation.y відносно нормалі
     */
    private calculateRotationRelativeToNormal(
        rotation2D: number,
        normal: Vector3,
    ): Vector3 {
        return orientOnSurfaceEulerXYZ(normal, rotation2D);
    }

    /**
     * Знаходить оптимальний шлях з урахуванням перешкод та висоти ландшафту
     * @param start - початкова точка
     * @param end - кінцева точка  
     * @param obj - об'єкт, для якого шукаємо шлях
     * @returns масив точок шляху з правильною Y-координатою відповідно до ландшафту
     */
    public findOptimalPathWithTerrain(start: Vector3, end: Vector3, obj: TSceneObject<any>): Vector3[] {
        // Викликаємо базовий пошук шляху (2D)
        const path2D = this.pathfinder.findOptimalPath(start, end, obj);
        
        if (path2D.length === 0) {
            return [];
        }

        // Модифікуємо Y-координати відповідно до висоти ландшафту
        const pathWithTerrain: Vector3[] = path2D.map(point => {
            const terrainHeight = this.terrainManager?.getHeightAt(point.x, point.z) ?? 0;
            
            // Якщо Y-координата не задана або 0, використовуємо висоту ландшафту
            // Інакше залишаємо оригінальну Y (наприклад, для польоту)
            const finalY = point.y === 0 || obj.tags.includes('on-ground') ? terrainHeight : point.y;
            
            return {
                x: point.x,
                y: finalY,
                z: point.z
            };
        });

        return pathWithTerrain;
    }
}