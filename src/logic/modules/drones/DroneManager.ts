import { TSceneObject } from '@scene/scene.types';
import { Vector3 } from '@utils/vector-math';
import { SaveLoadManager, DroneSaveData } from '@save-load/save-load.types';
import { DRONE_TYPES_DB, DroneTypeData } from './drone-db';
import { IDroneManager, IBonusSystem, ISceneLogic } from '@interfaces/index';

export interface Drone {
    id: string;
    position: Vector3;
    status: 'idle' | 'busy' | 'charging';
    currentCommandId?: string;
    battery: number;
    maxBattery: number;
    inventory: Record<string, number>;
    maxInventory: number;
    efficiency: number;
    speed: number;
    maxSpeed: number;
}

export class DroneManager implements SaveLoadManager, IDroneManager {
    private scene: ISceneLogic;
    private bonusSystem: IBonusSystem;
    private droneTypesDB: Map<string, DroneTypeData> = new Map();
    private maxDroneCount: number = 1; // Початкова кількість дронів
    
    constructor(bonusSystem: IBonusSystem, scene: ISceneLogic) {
        this.scene = scene;
        this.bonusSystem = bonusSystem;
    }
    
    /**
     * Ініціалізація перед початком гри
     * Завантажує БД типів дронів
     */
    public beforeInit(): void {
        // Копіюємо БД типів дронів
        this.droneTypesDB = new Map(DRONE_TYPES_DB);
        
        // Оновлюємо максимальну кількість дронів з бонус-системи
        this.updateMaxDroneCount();
    }
    
    // ==================== Drone Management ====================
    
    /**
     * Створює нового дрона (TSceneObject) з необхідними даними
     */
    createDrone(id: string, position: Vector3, type: string): TSceneObject {
        // Розраховуємо обертання дрона (направляємо в сторону від центру)
        const angle = Math.atan2(position.z, position.x) + Math.PI;
        const randomOffset = (Math.random() - 0.5) * 0.5;
        const droneDBData = this.droneTypesDB.get(type);
        if(!droneDBData) {
            throw new Error(`Invalid drone passed: ${type}`);
        }
        const drone: TSceneObject = {
            id,
            type: 'rover',
            coordinates: { ...position },
            scale: droneDBData.ui.defaultScale,
            rotation2D: angle + randomOffset,
            obstacleSize: 0.4,
            rotation: { x: 0, y: angle + randomOffset, z: 0 },
            data: { 
                droneType: type,
                isReady: false,
                modelPath: droneDBData.ui.modelPath || '/models/playtest-rover.glb',
                scale: 0.4,
                rotatable: true,
                rotationOffset: droneDBData.ui.rotationOffset,                
                status: 'idle',
            } as any,
            tags: ['on-ground', 'dynamic', 'rover', 'controlled'],
            bottomAnchor: -0.1,
            terrainAlign: true,
            commandType: ['move-to', 'collect-resource', 'build', 'charge']
        };
        // Додаємо дрона в сцену
        this.scene.pushObjectWithTerrainConstraint(drone);
        
        // 🚀 Позначаємо як dirty для першого рендерингу
        this.markDroneDirty(id);
        
        return drone;
    }

    updateDroneData(id: string, setInitials: boolean = false) {
        const drone = this.getDrone(id);
        if(!drone) {
            throw new Error(`Drone with id ${id} not found`);
        }
        const droneDBData = this.droneTypesDB.get(drone?.data.droneType);
        if(!droneDBData) {
            throw new Error(`Invalid drone passed: ${drone?.data.droneType}`);
        }
        
        // Оновлюємо всі характеристики з урахуванням бонусів
        drone.data.collectionSpeed = droneDBData.baseCollectionSpeed * this.bonusSystem.getEffectValue('drone_collection_speed');
        drone.data.maxSpeed = droneDBData.baseMovementSpeed * this.bonusSystem.getEffectValue('drone_movement_speed');
        drone.data.maxCapacity = droneDBData.baseInventoryCapacity * this.bonusSystem.getEffectValue('drone_inventory_capacity');
        drone.data.maxPower = droneDBData.baseBatteryCapacity * this.bonusSystem.getEffectValue('drone_max_battery');
        drone.data.unloadSpeed = droneDBData.baseUnloadSpeed;
        drone.data.efficiencyMultiplier = droneDBData.baseEfficiencyMultiplier;

        if(!drone.data.isReady && setInitials) {
            // Перша ініціалізація
            drone.data.power = drone.data.maxPower;
            drone.data.storage = {};
        }

        // Сетимо дрон реді лише тоді коли setInitials фолс (кличемо метод з тіку, коли у нас вже є всі дані)
        drone.data.isReady = drone.data.isReady || !setInitials;
        
        // 🚀 Позначаємо як dirty після оновлення даних
        this.markDroneDirty(id);
    }

    /**
     * Створює початкових дронів для нової гри
     */
    newGameDrones(): void {
        // Створюємо 1 дрон
        this.createDrone('rover_1', { x: 0, y: 0, z: 0 }, 'basic_rover');
        this.updateDroneData('rover_1', true);
        
        // 🚀 Позначаємо як dirty після створення початкових дронів
        // (createDrone та updateDroneData вже позначають як dirty)
    }
    
    /**
     * Отримує дрона за ID (реальний TSceneObject)
     */
    getDrone(id: string): TSceneObject | undefined {
        const obj = this.scene.getObjectById(id);
        return obj && obj.type === 'rover' ? obj : undefined;
    }

    public tick(_dT: number) {
        const drones = this.getAllDrones();

        drones.forEach(drone => {
            this.updateDroneData(drone.id);
        })
    }
    
    /**
     * Отримує всіх дронів
     */
    
    // ==================== Drone Types DB Access ====================
    
    /**
     * Отримує тип дрону за ID
     */
    public getDroneType(typeId: string): DroneTypeData | undefined {
        return this.droneTypesDB.get(typeId);
    }
    
    /**
     * Отримує всі типи дронів
     */
    public getAllDroneTypes(): Map<string, DroneTypeData> {
        return new Map(this.droneTypesDB);
    }
    
    /**
     * Перевіряє чи існує тип дрону
     */
    public isDroneTypeExists(typeId: string): boolean {
        return this.droneTypesDB.has(typeId);
    }
    
    /**
     * Отримує кількість типів дронів
     */
    public getDroneTypesCount(): number {
        return this.droneTypesDB.size;
    }
    getAllDrones(): TSceneObject[] {
        return this.scene.getObjectsByTag('rover');
    }
    
    /**
     * Оновлює позицію дрона
     */
    updateDronePosition(id: string, newPosition: Vector3): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        drone.coordinates = { ...newPosition };
        return true;
    }
    
    /**
     * Оновлює статус дрона
     */
    updateDroneStatus(id: string, status: 'idle' | 'busy' | 'charging'): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        const oldStatus = drone.data.status;
        drone.data.status = status;
        
        // 🚀 Позначаємо як dirty якщо статус змінився
        if (oldStatus !== status) {
            this.markDroneDirty(id);
        }
        
        return true;
    }
    
    /**
     * Оновлює команду дрона
     */
    updateDroneCommand(id: string, commandId?: string): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        drone.data.currentCommandId = commandId;
        
        // 🚀 Позначаємо як dirty якщо змінилася команда
        this.markDroneDirty(id);
        
        return true;
    }
    
    /**
     * Оновлює батарею дрона
     */
    updateDroneBattery(id: string, battery: number): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        const maxBattery = drone.data.maxPower || 100;
        const oldBattery = drone.data.power;
        drone.data.power = Math.max(0, Math.min(battery, maxBattery));
        
        // 🚀 Позначаємо як dirty якщо батарея змінилася
        if (oldBattery !== drone.data.power) {
            this.markDroneDirty(id);
        }
        
        return true;
    }
    
    /**
     * Додає ресурс до інвентаря дрона
     */
    addResourceToDrone(id: string, resourceType: string, amount: number): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        const currentAmount = drone.data.storage[resourceType] || 0;
        const newAmount = currentAmount + amount;
        const maxCapacity = drone.data.maxCapacity || 5;
        
        // Перевіряємо чи не переповнений інвентар
        if (newAmount > maxCapacity) {
            drone.data.storage[resourceType] = maxCapacity;
            // 🚀 Позначаємо як dirty навіть при переповненні
            this.markDroneDirty(id);
            return false; // Інвентар переповнений
        }
        
        drone.data.storage[resourceType] = newAmount;
        // 🚀 Позначаємо як dirty якщо ресурс додано
        this.markDroneDirty(id);
        return true;
    }
    
    /**
     * Видаляє ресурс з інвентаря дрона
     */
    removeResourceFromDrone(id: string, resourceType: string, amount: number): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        const currentAmount = drone.data.storage[resourceType] || 0;
        if (currentAmount < amount) return false;
        
        drone.data.storage[resourceType] = currentAmount - amount;
        
        // Видаляємо порожній слот
        if (drone.data.storage[resourceType] <= 0) {
            delete drone.data.storage[resourceType];
        }
        
        // 🚀 Позначаємо як dirty якщо ресурс видалено
        this.markDroneDirty(id);
        
        return true;
    }
    
    /**
     * Отримує кількість ресурсу у дрона
     */
    getDroneResourceAmount(id: string, resourceType: string): number {
        const drone = this.getDrone(id);
        return drone ? (drone.data.storage[resourceType] || 0) : 0;
    }
    
    /**
     * Перевіряє чи має дрон вільне місце в інвентарі
     */
    hasInventorySpace(id: string): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        const currentInventory = Object.values(drone.data.storage as Record<string, number>).reduce((sum: number, amount: number) => sum + amount, 0);
        const maxCapacity = drone.data.maxCapacity || 5;
        return currentInventory < maxCapacity;
    }
    
    /**
     * Отримує загальну кількість ресурсів у дрона
     */
    getDroneTotalInventory(id: string): number {
        const drone = this.getDrone(id);
        if (!drone) return 0;
        
        return Object.values(drone.data.storage as Record<string, number>).reduce((sum: number, amount: number) => sum + amount, 0);
    }
    
    /**
     * Видаляє дрона
     */
    removeDrone(id: string): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        // Видаляємо з сцени
        this.scene.removeObject(id);
        return true;
    }
    
    /**
     * Отримує дронів за статусом
     */
    getDronesByStatus(status: 'idle' | 'busy' | 'charging'): TSceneObject[] {
        return this.getAllDrones().filter(drone => drone.data.status === status);
    }
    
    /**
     * Отримує дронів з низькою батареєю
     */
    getDronesWithLowBattery(threshold: number = 20): TSceneObject[] {
        return this.getAllDrones().filter(drone => (drone.data.power || 100) < threshold);
    }
    
    // ==================== SaveLoadManager Implementation ====================
    
    save(): DroneSaveData {
        const drones = this.getAllDrones().map(drone => ({
            id: drone.id,
            type: drone.data.droneType,
            position: drone.coordinates,
            status: drone.data.status || 'idle',
            currentCommandId: drone.data.currentCommandId,
            battery: drone.data.power || 0,
            inventory: { ...drone.data.storage }
        }));
        
        return { drones };
    }
    
    load(data: DroneSaveData): void {
        if (data.drones) {
            // Спочатку видаляємо всіх існуючих дронів
            this.reset();
            
            // Створюємо нових дронів відповідно до збережених даних
            data.drones.forEach(droneData => {
                // Створюємо дрона з збереженими параметрами
                this.createDrone(droneData.id, droneData.position, droneData.type);
                
                // 🚀 createDrone вже позначає як dirty
                
                // Отримуємо створеного дрона і оновлюємо додаткові дані
                const drone = this.getDrone(droneData.id);
                if (drone) {
                    drone.data.status = droneData.status || 'idle';
                    drone.data.currentCommandId = droneData.currentCommandId;
                    drone.data.power = droneData.battery;
                    drone.data.storage = droneData.inventory;
                    
                    // 🚀 Позначаємо як dirty після завантаження даних
                    // (createDrone вже позначає як dirty, але тут ми оновлюємо додаткові дані)
                    this.markDroneDirty(droneData.id);
                }
            });
        }
    }
    
    reset(): void {
        // Видаляємо всіх дронів з сцени
        this.getAllDrones().forEach(drone => {
            this.scene.removeObject(drone.id);
        });
    }

    /**
     * 🚀 Позначає дрона як dirty для оновлення рендерингу
     */
    private markDroneDirty(id: string): void {
        const drone = this.getDrone(id);
        if (!drone) return;

        // Позначаємо дані як dirty
        if (drone._dirtyFlags) {
            drone._dirtyFlags.data = true;
            drone._lastUpdate = Date.now();
        }

        // Також можна викликати метод SceneLogic для маркування
        // this.scene.markObjectDirty(id); // Якщо SceneLogic має публічний метод
    }

    /**
     * Переміщує дрона (реалізація інтерфейсу)
     */
    moveDrone(droneId: string, target: Vector3): boolean {
        const drone = this.getDrone(droneId);
        if (!drone) return false;
        
        // Оновлюємо позицію дрона
        drone.coordinates = { ...target };
        
        // Оновлюємо обертання дрона (направляємо в сторону цілі)
        const angle = Math.atan2(target.z - drone.coordinates.z, target.x - drone.coordinates.x);
        drone.rotation2D = angle;
        drone.rotation = { x: 0, y: angle, z: 0 };
        
        // 🚀 Позначаємо як dirty для оновлення рендерингу
        this.markDroneDirty(droneId);
        
        return true;
    }

    /**
     * Отримує дронів за тегом (реалізація інтерфейсу)
     */
    getDronesByTag(tag: string): any[] {
        return this.getAllDrones().filter(drone => 
            drone.tags && drone.tags.includes(tag)
        );
    }

    // ==================== Drone Count Management ====================
    
    /**
     * Оновлює максимальну кількість дронів з бонус-системи
     */
    public updateMaxDroneCount(): void {
        const baseDrones = 1;
        const bonusDrones = this.bonusSystem.getEffectValue('max_drone_count') || 0;
        this.maxDroneCount = baseDrones + Math.floor(bonusDrones);
        
        console.log(`[DroneManager] Max drone count updated: ${this.maxDroneCount}`);
    }

    /**
     * Отримує максимальну кількість дронів
     */
    public getMaxDroneCount(): number {
        return this.maxDroneCount;
    }

    /**
     * Перевіряє чи можна створити новий дрон
     */
    public canCreateNewDrone(): boolean {
        const currentCount = this.getActiveDronesCount();
        return currentCount < this.maxDroneCount;
    }

    /**
     * Отримує кількість активних дронів
     */
    private getActiveDronesCount(): number {
        return this.scene.getObjectsByTag('rover').filter(obj => 
            obj.data?.status !== 'destroyed'
        ).length;
    }

    /**
     * Створює додатковий дрон (викликається при покупці апгрейду)
     */
    public createAdditionalDrone(): boolean {
        // Перевіряємо чи можемо створити новий дрон
        const currentCount = this.getActiveDronesCount();
        if (currentCount >= this.maxDroneCount) {
            console.warn('[DroneManager] Cannot create drone - at max capacity');
            return false;
        }
        
        // Знаходимо безпечну позицію для нового дрона
        const spawnPosition = this.findSafeDroneSpawnPosition();
        if (!spawnPosition) {
            console.warn('[DroneManager] Cannot find safe spawn position for drone');
            return false;
        }
        
        // Створюємо унікальний ID для нового дрона
        const newDroneId = `drone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Створюємо дрона
        const droneObject = this.createDrone(newDroneId, spawnPosition, 'basic_rover');
        
        if (droneObject) {
            console.log(`[DroneManager] Created new drone: ${newDroneId} at position:`, spawnPosition);
            
            // Ініціалізуємо дрона з правильними характеристиками
            this.initializeDroneData(newDroneId);
            
            return true;
        }
        
        return false;
    }

    /**
     * Знаходить безпечну позицію для створення нового дрона
     */
    private findSafeDroneSpawnPosition(): Vector3 | null {
        // Шукаємо позицію біля космічного корабля (spaceship)
        const spaceship = this.scene.getObjectsByTag('building').find(obj => 
            obj.data?.buildingType === 'spaceship'
        );
        
        if (spaceship) {
            // Спробуємо кілька позицій навколо корабля
            const basePos = spaceship.coordinates;
            const attempts = [
                { x: basePos.x + 2, y: basePos.y, z: basePos.z + 2 },
                { x: basePos.x - 2, y: basePos.y, z: basePos.z + 2 },
                { x: basePos.x + 2, y: basePos.y, z: basePos.z - 2 },
                { x: basePos.x - 2, y: basePos.y, z: basePos.z - 2 },
                { x: basePos.x + 3, y: basePos.y, z: basePos.z },
                { x: basePos.x - 3, y: basePos.y, z: basePos.z },
                { x: basePos.x, y: basePos.y, z: basePos.z + 3 },
                { x: basePos.x, y: basePos.y, z: basePos.z - 3 }
            ];
            
            for (const pos of attempts) {
                if (this.isPositionSafe(pos)) {
                    return pos;
                }
            }
        }
        
        // Якщо біля корабля немає місця, шукаємо будь-де на карті
        return this.findRandomSafePosition();
    }

    /**
     * Перевіряє чи безпечна позиція для створення дрона
     */
    private isPositionSafe(position: Vector3): boolean {
        // Перевіряємо чи немає перешкод в цій позиції
        const center = { x: position.x, y: position.y, z: position.z };
        const staticObjects = this.scene.getObjectsByTagInRadius('static', center, 1.5);
        const buildingObjects = this.scene.getObjectsByTagInRadius('building', center, 1.5);
        const resourceObjects = this.scene.getObjectsByTagInRadius('resource', center, 1.5);
        
        // Дозволяємо тільки якщо поблизу немає статичних об'єктів
        const hasObstacles = staticObjects.length > 0 || buildingObjects.length > 0 || resourceObjects.length > 0;
        
        return !hasObstacles;
    }

    /**
     * Знаходить випадкову безпечну позицію на карті
     */
    private findRandomSafePosition(): Vector3 | null {
        // Генеруємо випадкові позиції поки не знайдемо безпечну
        const maxAttempts = 20;
        const mapSize = 50; // Розмір карти
        
        for (let i = 0; i < maxAttempts; i++) {
            const randomPos = {
                x: (Math.random() - 0.5) * mapSize,
                y: 0,
                z: (Math.random() - 0.5) * mapSize
            };
            
            if (this.isPositionSafe(randomPos)) {
                return randomPos;
            }
        }
        
        console.warn('[DroneManager] Could not find safe spawn position after', maxAttempts, 'attempts');
        return null;
    }

    /**
     * Ініціалізує дрона з правильними характеристиками
     */
    private initializeDroneData(droneId: string): void {
        // Ініціалізуємо дрона з базовими характеристиками
        const droneObject = this.scene.getObjectById(droneId);
        if (!droneObject) return;
        
        // Отримуємо базові характеристики з бонус-системи
        const droneType = this.droneTypesDB.get('basic_rover');
        if (!droneType) return;
        
        // Встановлюємо початкові характеристики з урахуванням бонусів
        droneObject.data = {
            ...droneObject.data,
            status: 'idle',
            battery: this.bonusSystem.getEffectValue('drone_max_battery') || droneType.baseBatteryCapacity,
            maxBattery: this.bonusSystem.getEffectValue('drone_max_battery') || droneType.baseBatteryCapacity,
            storage: {},
            maxCapacity: this.bonusSystem.getEffectValue('drone_max_inventory') || droneType.baseInventoryCapacity,
            efficiency: this.bonusSystem.getEffectValue('drone_efficiency') || 1.0,
            isReady: true
        };
        
        console.log(`[DroneManager] Initialized drone ${droneId} with data:`, droneObject.data);
    }
}
