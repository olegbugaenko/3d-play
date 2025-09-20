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
                    // Скільки можемо завантажити (обмежено швидкістю та залишками в джерелі)
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
                        if (target?.tags?.includes('building') && target.data?.isBuilt && !target?.tags?.includes('storage')) {
                            // Джерело – внутрішній склад будівлі
                            const bm: any = this.context.mapLogic?.buildingsManager;
                            const inst = bm?.getBuildingInstance?.(target.id);
                            const bucket = inst?.internalStorage?.[resourceId];
                            if (bucket && bucket.current > 0) {
                                const taken = Math.min(bucket.current, amountToTake);
                                bucket.current = Math.max(0, bucket.current - taken);
                                (object.data.storage as Record<string, number>)[resourceId] = currentInDrone + taken;
                                totalLoaded += taken;
                                this.context.scene.markObjectDirty?.(target.id);
                                console.log(`[LoadResourcesExecutor] Loaded ${taken} ${resourceId} from ${target.id} to ${object.id}`);
                            }
                        } else {
                            // Джерело – глобальний склад (ResourceManager)
                            const resourceManager = this.context.mapLogic?.resources;
                            if (resourceManager) {
                                const takeChanges: ResourceChange[] = [{
                                    resourceId: resourceId as any,
                                    amount: -amountToTake,
                                    reason: `Loaded by ${object.id}`
                                }];
                                const success = resourceManager.addResources(takeChanges);
                                if (success) {
                                    (object.data.storage as Record<string, number>)[resourceId] = currentInDrone + amountToTake;
                                    totalLoaded += amountToTake;
                                    console.log(`[LoadResourcesExecutor] Loaded ${amountToTake} ${resourceId} to ${object.id}`);
                                }
                            }
                        }
                    }
                }
            }
        }

        // ПЕРЕВІРКА НА ФЕЙЛ: Якщо нічого не завантажили І дрон не має жодного з потрібних ресурсів
        if (totalLoaded === 0 && !this.hasSomethingLoaded(object, requiredResources)) {
            // Перевіряємо чи можемо ще щось взяти зі складу
            const target = this.context.scene.getObjectById(this.command.targetId);
            let canLoadAnything = false;
            
            if (target?.tags?.includes('storage')) {
                // Глобальний склад
                canLoadAnything = this.hasAnyRequiredResourcesInGlobalStorage(requiredResources);
            } else if (target) {
                // Будівля з внутрішнім складом
                canLoadAnything = this.hasAnyRequiredResourcesInTarget(target, requiredResources);
            }
            
            if (!canLoadAnything) {
                console.log(`[LoadResourcesExecutor] Cannot load anything and drone has no useful resources - failing command`);
                return {
                    success: false,
                    message: 'No resources available to load and drone has nothing useful',
                    data: { loaded: 0, progress: this.loadProgress }
                };
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
        const target = this.context.scene.getObjectById(this.command.targetId);
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

        // НОВА УМОВА: Перевіряємо чи є ще ресурси в джерелі для завантаження
        // Якщо в джерелі закінчились ресурси, а дрон щось завантажив - завершуємо успішно
        if (target && this.hasSomethingLoaded(object, requiredResources) && !this.hasAnyRequiredResourcesInTarget(target, requiredResources)) {
            console.log(`[LoadResourcesExecutor] No more resources available in target, completing with what was loaded for ${object.id}`);
            return true;
        }

        // АНАЛОГІЧНА ЛОГІКА ДЛЯ ГЛОБАЛЬНОГО СКЛАДУ (target з тегом 'storage')
        if (target?.tags?.includes('storage') && this.hasSomethingLoaded(object, requiredResources) && !this.hasAnyRequiredResourcesInGlobalStorage(requiredResources, object.data?.storage)) {
            console.log(`[LoadResourcesExecutor] No more resources available in global storage, completing with what was loaded for ${object.id}`);
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
        // Підтримка двох джерел: глобальний склад або внутрішній склад будівлі
        if (target?.tags?.includes('building') && target.data?.isBuilt && !target?.tags?.includes('storage')) {
            const bm: any = this.context.mapLogic?.buildingsManager;
            const inst = bm?.getBuildingInstance?.(target.id);
            if (!inst?.internalStorage) return false;
            // Якщо параметр resources заданий — перевіряємо його, інакше перевіряємо будь-який ресурс
            const req = this.command.parameters?.resources as Record<string, number> | undefined;
            if (req && Object.keys(req).length > 0) {
                return Object.entries(req).some(([rid]) => (inst.internalStorage![rid]?.current || 0) > 0);
            }
            return Object.values(inst.internalStorage).some((b: any) => (b?.current || 0) > 0);
        }

        const resourceManager = this.context.mapLogic?.resources;
        if (!resourceManager) return false;
        const resources = resourceManager.getResources();
        return Object.values(resources).some((amount: any) => amount > 0);
    }

    private getResourceAmount(target: any, resourceId: string): number {
        // Якщо джерело — будівля з внутрішнім складом
        if (target?.tags?.includes('building') && target.data?.isBuilt && !target?.tags?.includes('storage')) {
            const bm: any = this.context.mapLogic?.buildingsManager;
            const inst = bm?.getBuildingInstance?.(target.id);
            const bucket = inst?.internalStorage?.[resourceId];
            return bucket?.current || 0;
        }
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

    /**
     * Перевіряє чи дрон завантажив хоча б щось з потрібних ресурсів
     */
    private hasSomethingLoaded(object: any, requiredResources: Record<string, number>): boolean {
        if (!object.data?.storage) return false;
        
        const inventory = object.data.storage as Record<string, number>;
        
        for (const [resourceId] of Object.entries(requiredResources)) {
            const currentAmount = inventory[resourceId] || 0;
            if (currentAmount > 0) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Перевіряє чи є хоча б один з потрібних ресурсів в джерелі
     */
    private hasAnyRequiredResourcesInTarget(target: any, requiredResources: Record<string, number>): boolean {
        for (const [resourceId] of Object.entries(requiredResources)) {
            const availableAmount = this.getResourceAmount(target, resourceId);
            if (availableAmount > 0) {
                return true;
            }
        }
        
        return false;
    }

    private hasAnyRequiredResourcesInGlobalStorage(requiredResources: Record<string, number>, alreadyLoaded?: Record<string, number>): boolean {
        const resourceManager = this.context.mapLogic?.resources;
        if (!resourceManager) return false;

        for (const [resourceId] of Object.entries(requiredResources)) {
            const availableAmount = resourceManager.getResourceAmount(resourceId);
            const loaded = alreadyLoaded?.[resourceId] ?? 0;
            if(loaded && (requiredResources[resourceId] - loaded < 1.e-8)) {
                continue;
            }
            if (availableAmount > 1.e-8) {
                return true;
            }
        }
        
        return false;
    }
}
