import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';
import { ResourceChange } from '@resources/resource-types';

export class LoadResourcesExecutor extends CommandExecutor {
    private loadProgress: number = 0;
    private lastLoadTime: number = 0;

    getEnergyUpkeep() {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.loadSpeed) {
            return 0.1; // Мінімальне споживання енергії
        }
        
        return object.data.loadSpeed * 0.1; // Споживання енергії пропорційне швидкості
    }

    canExecute(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        const target = this.context.scene.getObjectById(this.command.targetId);
        
        if (!object || !target) {
            return false;
        }

        // Перевіряємо чи є loadSpeed
        if (!object.data?.loadSpeed || object.data.loadSpeed <= 0) {
            return false;
        }

        // Перевіряємо чи є місце в інвентарі дрона
        if (!this.hasSpaceInInventory(object)) {
            return false;
        }

        // Перевіряємо чи є ресурси в цілі (складі)
        if (!this.hasResourcesInTarget(target)) {
            return false;
        }

        return true;
    }

    execute(): CommandResult {
        const object = this.context.scene.getObjectById(this.context.objectId);
        const target = this.context.scene.getObjectById(this.command.targetId);
        
        if (!object || !target) {
            return { success: false, message: 'Object or target not found' };
        }

        // 🚀 Обертаємо дрона до складу
        if (this.command.targetId) {
            this.rotateToTarget(this.command.targetId);
        }

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastLoadTime) / 1000; // в секундах
        
        if (this.lastLoadTime === 0) {
            this.lastLoadTime = currentTime;
            return { success: true, message: 'Starting resource loading' };
        }

        const loadSpeed = object.data.loadSpeed || 1.0; // ресурсів в секунду
        const amountToLoad = loadSpeed * deltaTime;

        // Отримуємо список ресурсів що потрібно завантажити
        const requiredResources = this.command.parameters?.resources || {};
        
        // Створюємо список змін ресурсів
        const resourceChanges: ResourceChange[] = [];
        let totalLoaded = 0;

        // Проходимо по всіх потрібних ресурсах
        for (const [resourceId, requiredAmount] of Object.entries(requiredResources)) {
            const amount = Number(requiredAmount);
            if (amount > 0 && totalLoaded < amountToLoad) {
                // Скільки цього ресурсу вже є в дрона
                const currentInDrone = (object.data.storage as Record<string, number>)[resourceId] || 0;
                
                // Скільки ще потрібно завантажити
                const stillNeeded = Math.max(0, amount - currentInDrone);

                
                console.log('requiredResources', resourceId, currentInDrone, stillNeeded);
                
                if (stillNeeded > 0) {
                    // Скільки можемо завантажити (обмежено швидкістю та залишками в складі)
                    const availableInStorage = this.getResourceAmount(target, resourceId);
                    const maxCapacity = this.getRemainingCapacity(object);
                    
                    const amountToTake = Math.min(
                        amountToLoad - totalLoaded, // Залишок швидкості
                        stillNeeded,                // Скільки ще потрібно
                        availableInStorage,         // Скільки є в складі
                        maxCapacity                 // Скільки поміщається в інвентар
                    );

                    console.log('amountToTake', resourceId, 
                        amountToLoad - totalLoaded, // Залишок швидкості
                        stillNeeded,                // Скільки ще потрібно
                        availableInStorage,         // Скільки є в складі
                        maxCapacity                 // Скільки поміщається в інвентар
                    );

                

                    if (amountToTake > 0) {
                        // Забираємо ресурс зі складу (через ResourceManager)
                        const resourceManager = this.context.mapLogic?.resources;
                        if (resourceManager) {
                            const takeChanges: ResourceChange[] = [{
                                resourceId: resourceId as any,
                                amount: -amountToTake, // Негативне значення = забираємо
                                reason: `Loaded by ${object.id}`
                            }];
                            
                            const success = resourceManager.addResources(takeChanges);
                            if (success) {
                                // Додаємо ресурс в інвентар дрона
                                (object.data.storage as Record<string, number>)[resourceId] = currentInDrone + amountToTake;
                                totalLoaded += amountToTake;
                                
                                console.log(`[LoadResourcesExecutor] Loaded ${amountToTake} ${resourceId} to ${object.id}`);
                            }
                        }
                    }
                }
            }
        }

        this.lastLoadTime = currentTime;
        this.loadProgress = this.calculateLoadProgress(object, requiredResources);

        return { 
            success: true, 
            message: `Loaded ${totalLoaded} resources`,
            data: { loaded: totalLoaded, progress: this.loadProgress }
        };
    }

    completeCheck(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        const requiredResources = this.command.parameters?.resources || {};
        
        if (!object) return true;

        // Перевіряємо чи інвентар повний
        const inventoryFull = this.isInventoryFull(object);
        if (inventoryFull) {
            console.log(`[LoadResourcesExecutor] Inventory full for ${object.id}`);
            return true;
        }

        // Перевіряємо чи завантажено всі потрібні ресурси
        const allResourcesLoaded = this.hasAllRequiredResources(object, requiredResources);
        if (allResourcesLoaded) {
            console.log(`[LoadResourcesExecutor] All required resources loaded for ${object.id}`);
            return true;
        }

        return false;
    }

    // ========== Helper Methods ==========

    private hasSpaceInInventory(object: any): boolean {
        if (!object.data?.storage || !object.data?.maxCapacity) {
            return false;
        }
        
        const currentAmount = Object.values(object.data.storage as Record<string, number>)
            .reduce((sum, amount) => sum + amount, 0);
        
        return currentAmount < object.data.maxCapacity;
    }

    private hasResourcesInTarget(target: any): boolean {
        // Для складу перевіряємо через ResourceManager
        const resourceManager = this.context.mapLogic?.resources;
        if (!resourceManager) return false;
        
        const resources = resourceManager.getResources();
        return Object.values(resources).some((amount: any) => amount > 0);
    }

    private getResourceAmount(target: any, resourceId: string): number {
        // Отримуємо кількість ресурсу через ResourceManager
        const resourceManager = this.context.mapLogic?.resources;
        if (!resourceManager) return 0;
        
        return resourceManager.getResourceAmount(resourceId);
    }

    private getRemainingCapacity(object: any): number {
        if (!object.data?.storage || !object.data?.maxCapacity) {
            return 0;
        }
        
        const currentAmount = Object.values(object.data.storage as Record<string, number>)
            .reduce((sum, amount) => sum + amount, 0);

            
        return Math.max(0, object.data.maxCapacity - currentAmount);
    }

    private isInventoryFull(object: any): boolean {
        return this.getRemainingCapacity(object) <= 0;
    }

    private hasAllRequiredResources(object: any, requiredResources: Record<string, number>): boolean {
        if (!object.data?.storage) return false;
        
        const inventory = object.data.storage as Record<string, number>;
        
        for (const [resourceId, requiredAmount] of Object.entries(requiredResources)) {
            const currentAmount = inventory[resourceId] || 0;
            if (currentAmount < requiredAmount) {
                return false;
            }
        }
        
        return true;
    }

    private calculateLoadProgress(object: any, requiredResources: Record<string, number>): number {
        if (!object.data?.storage) return 0;
        
        const inventory = object.data.storage as Record<string, number>;
        let totalRequired = 0;
        let totalLoaded = 0;
        
        for (const [resourceId, requiredAmount] of Object.entries(requiredResources)) {
            totalRequired += requiredAmount;
            totalLoaded += Math.min(inventory[resourceId] || 0, requiredAmount);
        }
        
        if (totalRequired === 0) return 1.0;
        return totalLoaded / totalRequired;
    }
}
