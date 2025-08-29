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
    
    constructor(bonusSystem: IBonusSystem, scene: ISceneLogic) {
        this.scene = scene;
        this.bonusSystem = bonusSystem;
    }
    
    /**
     * Ініціалізація перед початком гри
     * Завантажує БД типів дронів
     */
    public beforeInit(): void {
        console.log('[DroneManager] Starting beforeInit...');
        
        // Копіюємо БД типів дронів
        this.droneTypesDB = new Map(DRONE_TYPES_DB);
        console.log(`[DroneManager] Loaded ${this.droneTypesDB.size} drone types from DB:`, Array.from(this.droneTypesDB.keys()));
        
        console.log('[DroneManager] beforeInit completed');
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
        console.log('Adding drone: ', drone, position, drone.tags);
        // Додаємо дрона в сцену
        this.scene.pushObjectWithTerrainConstraint(drone);
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
    }

    /**
     * Створює початкових дронів для нової гри
     */
    newGameDrones(): void {
        console.log('[DroneManager] Створюємо початкових дронів для нової гри');
        
        // Створюємо 1 дрон
        this.createDrone('rover_1', { x: 0, y: 0, z: 0 }, 'basic_rover');
        this.updateDroneData('rover_1', true);
        
        console.log('[DroneManager] Початкові дрони створені');
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
        
        drone.data.status = status;
        return true;
    }
    
    /**
     * Оновлює команду дрона
     */
    updateDroneCommand(id: string, commandId?: string): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        drone.data.currentCommandId = commandId;
        return true;
    }
    
    /**
     * Оновлює батарею дрона
     */
    updateDroneBattery(id: string, battery: number): boolean {
        const drone = this.getDrone(id);
        if (!drone) return false;
        
        const maxBattery = drone.data.maxPower || 100;
        drone.data.power = Math.max(0, Math.min(battery, maxBattery));
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
            return false; // Інвентар переповнений
        }
        
        drone.data.storage[resourceType] = newAmount;
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
                
                // Отримуємо створеного дрона і оновлюємо додаткові дані
                const drone = this.getDrone(droneData.id);
                if (drone) {
                    drone.data.status = droneData.status || 'idle';
                    drone.data.currentCommandId = droneData.currentCommandId;
                    drone.data.power = droneData.battery;
                    drone.data.storage = droneData.inventory;
                }
            });
        }
    }
    
    reset(): void {
        // Видаляємо всіх дронів з сцени
        this.getAllDrones().forEach(drone => {
            this.scene.removeObject(drone.id);
        });
        
        console.log('[DroneManager] Reset completed');
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
        
        console.log(`[DroneManager] Moved drone ${droneId} to position:`, target);
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
}
