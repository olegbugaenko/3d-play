import { TSceneObject } from '../scene/scene.types';
import { Vector3 } from '../scene/scene.types';
import { SaveLoadManager, DroneSaveData } from '../save-load/save-load.types';
import { SceneLogic } from '../scene/scene-logic';

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

export class DroneManager implements SaveLoadManager {
    private scene: SceneLogic;
    
    constructor(scene: SceneLogic) {
        this.scene = scene;
    }
    
    // ==================== Drone Management ====================
    
    /**
     * Створює нового дрона (TSceneObject) з необхідними даними
     */
    createDrone(id: string, position: Vector3, config: Partial<Drone> = {}): TSceneObject {
        // Розраховуємо обертання дрона (направляємо в сторону від центру)
        const angle = Math.atan2(position.z, position.x) + Math.PI;
        const randomOffset = (Math.random() - 0.5) * 0.5;
        
        const drone: TSceneObject = {
            id,
            type: 'rover',
            coordinates: { ...position },
            scale: { x: 0.4, y: 0.4, z: 0.4 },
            rotation: { x: 0, y: angle + randomOffset, z: 0 },
            data: { 
                modelPath: '/models/playtest-rover.glb',
                scale: 0.4,
                maxSpeed: config.maxSpeed ?? 2.0,
                rotatable: true,
                rotationOffset: 0,
                collectionSpeed: 0.5,
                maxCapacity: config.maxInventory ?? 5,
                unloadSpeed: 2,
                storage: config.inventory ?? {} as Record<string, number>,
                power: config.battery ?? 15,
                maxPower: config.maxBattery ?? 15,
                efficiencyMultiplier: config.efficiency ?? 1.5,
                status: config.status ?? 'idle',
                currentCommandId: config.currentCommandId,
                maxInventory: config.maxInventory ?? 5
            } as any,
            tags: ['on-ground', 'dynamic', 'rover', 'controlled'],
            bottomAnchor: -0.1,
            terrainAlign: true,
            commandType: ['move-to', 'collect-resource', 'build', 'charge']
        };
        console.log('Adding drone: ', drone, position);
        // Додаємо дрона в сцену
        this.scene.pushObjectWithTerrainConstraint(drone);
        return drone;
    }
    
    /**
     * Отримує дрона за ID (реальний TSceneObject)
     */
    getDrone(id: string): TSceneObject | undefined {
        const obj = this.scene.getObjectById(id);
        return obj && obj.type === 'rover' ? obj : undefined;
    }
    
    /**
     * Отримує всіх дронів
     */
    getAllDrones(): TSceneObject[] {
        return Object.values(this.scene.getObjects())
            .filter(obj => obj.type === 'rover') as TSceneObject[];
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
                this.createDrone(droneData.id, droneData.position, {
                    battery: droneData.battery,
                    maxBattery: 100, // За замовчуванням
                    inventory: droneData.inventory || {},
                    maxInventory: 5, // За замовчуванням
                    efficiency: 1.5, // За замовчуванням
                    speed: 2.0, // За замовчуванням
                    maxSpeed: 2.0 // За замовчуванням
                });
                
                // Отримуємо створеного дрона і оновлюємо додаткові дані
                const drone = this.getDrone(droneData.id);
                if (drone) {
                    drone.data.status = droneData.status || 'idle';
                    drone.data.currentCommandId = droneData.currentCommandId;
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
}
