import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';
import { ResourceChange } from '@resources/resource-types';

export class UnloadResourcesExecutor extends CommandExecutor {
    private unloadProgress: number = 0;
    private lastUnloadTime: number = 0;

    getEnergyUpkeep() {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.maxCapacity) {
            return false;
        }
        
        return object.data.unloadSpeed;
    }

    canExecute(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.storage) {
            return false;
        }

        // Перевіряємо чи є що вивантажувати
        const hasResourcesToUnload = this.hasResourcesToUnload(object);
        if (!hasResourcesToUnload) {
            return false;
        }

        // Перевіряємо чи є unloadSpeed
        if (!object.data?.unloadSpeed || object.data.unloadSpeed <= 0) {
            return false;
        }

        return true;
    }

    execute(): CommandResult {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) {
            return { success: false, message: 'Object not found' };
        }


        // 🚀 Обертаємо дрона до сховища (якщо є targetId)
        if (this.command.targetId) {
            this.rotateToTarget(this.command.targetId);
        }

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUnloadTime) / 1000; // в секундах
        
        if (this.lastUnloadTime === 0) {
            this.lastUnloadTime = currentTime;
            return { success: true, message: 'Starting resource unload' };
        }

        const unloadSpeed = object.data.unloadSpeed || 1.0; // ресурсів в секунду
        const amountToUnload = unloadSpeed * deltaTime;

        // Створюємо список змін ресурсів
        const resourceChanges: ResourceChange[] = [];
        let totalUnloaded = 0;

        // Отримуємо список ресурсів для вивантаження з параметрів (якщо є)
        const resourcesToUnload = this.command.parameters?.resourcesToUnload;

        // Проходимо по всіх ресурсах в storage
        for (const [resourceId, currentAmount] of Object.entries(object.data.storage as Record<string, number>)) {
            if (currentAmount > 0 && this.shouldUnloadResource(resourceId, currentAmount, resourcesToUnload)) {
                const amountToTake = this.calculateUnloadAmount(resourceId, currentAmount, resourcesToUnload, amountToUnload - totalUnloaded);
                
                if (amountToTake > 0) {
                    // Зменшуємо кількість в storage дрона
                    (object.data.storage as Record<string, number>)[resourceId] = currentAmount - amountToTake;
                    
                    // Додаємо до списку змін для гравця
                    resourceChanges.push({
                        resourceId: resourceId as any,
                        amount: amountToTake,
                        reason: `Unloaded from ${object.id}`
                    });
                    
                    totalUnloaded += amountToTake;
                    
                    // Якщо вивантажили все - виходимо
                    if (totalUnloaded >= amountToUnload) {
                        break;
                    }
                }
            }
        }

        // Додаємо ресурси до цілі (склад або недобудова)
        if (resourceChanges.length > 0) {
            const targetId = this.command.targetId;
            if (!targetId) {
                console.warn('[UnloadResourcesExecutor] No target specified - returning resources to drone');
                // Повертаємо ресурси назад у дрон якщо немає цілі
                this.returnResourcesToDrone(object, resourceChanges);
                return { 
                    success: false, 
                    message: 'No target specified for unloading',
                    data: { unloaded: 0, progress: this.unloadProgress }
                };
            }
            
            if (targetId) {
                const target = this.context.scene.getObjectById(targetId);
                if (target) {
                    
                    // Перевіряємо тип цілі
                    if (target.tags?.includes('storage') && target.data?.isBuilt) {
                        // Добудований склад - вивантажуємо тільки ті ресурси що поміщаються
                        const resourceManager = this.context.mapLogic?.resources;
                        if (resourceManager) {
                            // Фільтруємо ресурси - залишаємо тільки ті що поміщаються
                            const { canAddChanges, cantAddChanges } = this.filterResourcesByCapacity(resourceChanges);
                            
                            // Додаємо ресурси що поміщаються
                            if (canAddChanges.length > 0) {
                                const success = resourceManager.addResources(canAddChanges);
                                if (!success) {
                                    console.warn(`[UnloadResourcesExecutor] Failed to add resources to storage`);
                                    // Якщо не вдалося додати - повертаємо назад
                                    this.returnResourcesToDrone(object, canAddChanges);
                                }
                            }
                            
                            // Повертаємо ресурси що не поміщаються назад у дрон
                            if (cantAddChanges.length > 0) {
                                this.returnResourcesToDrone(object, cantAddChanges);
                            }
                        } else {
                            console.warn('[UnloadResourcesExecutor] ResourceManager not available');
                        }
                    } else if (target.tags?.includes('road')) {
                        // Дорога - додаємо ресурси до будівництва сегментів
                        const acceptedResources = this.addResourcesToRoadConstruction(target, resourceChanges);
                        
                        // Якщо є ресурси які не були прийняті - повертаємо їх назад у дрон
                        if (acceptedResources.length < resourceChanges.length) {
                            this.returnUnacceptedResources(object, resourceChanges, acceptedResources);
                        }
                    } else if (!target.data?.isBuilt) {
                        // Недобудова - додаємо ресурси до resourcesCollected (тільки потрібні)
                        const acceptedResources = this.addResourcesToConstruction(target, resourceChanges);
                        
                        // Якщо є ресурси які не були прийняті - повертаємо їх назад у дрон
                        if (acceptedResources.length < resourceChanges.length) {
                            this.returnUnacceptedResources(object, resourceChanges, acceptedResources);
                        }
                    } else if (target.tags?.includes('building') && target.data?.isBuilt) {
                        // Побудована будівля з внутрішнім складом
                        const bm: any = this.context.mapLogic?.buildingsManager;
                        const inst = bm?.getBuildingInstance?.(target.id);
                        if (inst?.internalStorage) {
                            let acceptedTotal = 0;
                            for (const change of resourceChanges) {
                                const bucket = inst.internalStorage[change.resourceId];
                                if (!bucket) continue;
                                const free = Math.max(0, bucket.capacity - (bucket.current || 0));
                                const put = Math.min(free, change.amount);
                                if (put > 0) {
                                    bucket.current = (bucket.current || 0) + put;
                                    acceptedTotal += put;
                                }
                            }
                            if (acceptedTotal > 0) {
                                this.context.scene.markObjectDirty?.(target.id);
                            }
                        } else {
                            console.warn('[UnloadResourcesExecutor] Target building has no internal storage');
                        }
                    } else {
                        console.warn(`[UnloadResourcesExecutor] Unknown target type: ${target.tags}`);
                    }
                } else {
                    console.warn(`[UnloadResourcesExecutor] Target not found: ${targetId}`);
                }
            } else {
                console.warn('[UnloadResourcesExecutor] No target specified');
            }
        }

        this.lastUnloadTime = currentTime;
        this.unloadProgress = this.calculateUnloadProgress(object);

        return { 
            success: true, 
            message: `Unloaded ${totalUnloaded} resources`,
            data: { unloaded: totalUnloaded, progress: this.unloadProgress }
        };
    }

    completeCheck(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) return true;

        // Команда завершена якщо немає ресурсів для вивантаження
        if (!this.hasResourcesToUnload(object)) {
            return true;
        }

        // Команда завершена тільки якщо ВСІ ресурси не можуть бути вивантажені (для storage)
        if (this.command.targetId) {
            const target = this.context.scene.getObjectById(this.command.targetId);
            if (target?.tags?.includes('storage') && target.data?.isBuilt) {
                const storage = object.data.storage as Record<string, number>;
                const resourceChanges: ResourceChange[] = [];
                
                // Створюємо список ресурсів для перевірки
                for (const [resourceId, amount] of Object.entries(storage)) {
                    if (amount > 0) {
                        resourceChanges.push({
                            resourceId: resourceId as any,
                            amount: amount,
                            reason: 'check'
                        });
                    }
                }
                
                const { canAddChanges } = this.filterResourcesByCapacity(resourceChanges);
                if (canAddChanges.length === 0 && resourceChanges.length > 0) {
                    return true; // Жоден ресурс не поміщається, завершуємо команду
                }
            } else if (target?.tags?.includes('road')) {
                // Для доріг - завершуємо якщо сегмент не потребує більше ресурсів
                const buildingsManager = this.context.mapLogic?.buildingsManager;
                if (buildingsManager) {
                    const roadInstance = buildingsManager.getRoadInfo(target.id);
                    const segmentIndex = this.command.parameters?.segmentIndex;

                    
                    if (roadInstance && roadInstance.segments && segmentIndex !== undefined) {
                        const segment = roadInstance.segments[segmentIndex];
                        if (segment && segment.buildingState === 'completed') {
                            return true; // Сегмент вже побудований
                        }
                        
                        // Перевіряємо чи всі потрібні ресурси доставлено
                        const requiredResources = buildingsManager.calculateRoadCost(target.id, segmentIndex);
                        
                        const deliveredResources = segment?.deliveredResources || {};
                        
                        let allResourcesDelivered = true;
                        for (const [resourceId, required] of Object.entries(requiredResources)) {
                            const delivered = deliveredResources[resourceId] || 0;
                            if (delivered < required) {
                                allResourcesDelivered = false;
                                break;
                            }
                        }
                        
                        if (allResourcesDelivered) {
                            return true; // Всі ресурси доставлено для сегмента
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Перевіряє чи є ресурси для вивантаження (з урахуванням фільтрації)
     */
    private hasResourcesToUnload(object: any): boolean {
        if (!object.data?.storage) return false;
        
        const storage = object.data.storage as Record<string, number>;
        
        // Якщо не передано конкретний список - перевіряємо чи є взагалі ресурси
        if (!this.command.parameters?.resourcesToUnload) {
            // Перевіряємо чи є хоч якісь ресурси в storage
            for (const [, amount] of Object.entries(storage)) {
                if (amount > 0) {
                    return true;
                }
            }
            return false;
        }

        const resourcesToUnload = this.command.parameters?.resourcesToUnload || {};
        
        // Перевіряємо чи є ресурси для вивантаження з конкретного списку
        for (const [resourceId, amountToUnload] of Object.entries(resourcesToUnload)) {
            const currentAmount = storage[resourceId] || 0;
            const amountToUnloadNum = typeof amountToUnload === 'number' ? amountToUnload : 0;
            if (currentAmount > 0 && amountToUnloadNum > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Визначає чи потрібно вивантажувати цей ресурс
     */
    private shouldUnloadResource(
        resourceId: string, 
        _currentAmount: number, 
        resourcesToUnload?: Record<string, number>
    ): boolean {
        // Якщо resourcesToUnload не передано - вивантажуємо все
        if (!resourcesToUnload) {
            return true;
        }

        // Якщо є конкретний список ресурсів для вивантаження - використовуємо його
        if (Object.keys(resourcesToUnload).length > 0) {
            return resourcesToUnload[resourceId] > 0;
        }

        // Якщо передано порожній об'єкт - НЕ вивантажуємо нічого
        return false;
    }

    /**
     * Обчислює скільки цього ресурсу потрібно вивантажити
     */
    private calculateUnloadAmount(
        resourceId: string,
        currentAmount: number,
        resourcesToUnload: Record<string, number> | undefined,
        maxUnloadAmount: number
    ): number {
        // Якщо resourcesToUnload не передано - вивантажуємо скільки можемо
        if (!resourcesToUnload) {
            return Math.min(maxUnloadAmount, currentAmount);
        }

        // Використовуємо конкретний список ресурсів для вивантаження
        const amountToUnload = resourcesToUnload[resourceId] || 0;
        return Math.min(maxUnloadAmount, Math.min(currentAmount, amountToUnload));
    }

    private calculateUnloadProgress(object: any): number {
        if (!object.data.storage) return 1.0;

        let totalResources = 0;
        let totalCurrent = 0;

        for (const [_resourceId, currentAmount] of Object.entries(object.data.storage as Record<string, number>)) {
            totalCurrent += currentAmount;
            // Приблизна оцінка максимальної ємності
            totalResources += Math.max(totalCurrent, 100);
        }

        if (totalResources === 0) return 1.0;
        return Math.max(0, 1.0 - (totalCurrent / totalResources));
    }

    /**
     * Додає ресурси до недобудови (тільки ті які потрібні)
     * Повертає список прийнятих ресурсів
     */
    private addResourcesToConstruction(target: any, resourceChanges: ResourceChange[]): ResourceChange[] {
        if (!target.data?.resourcesCollected) {
            target.data.resourcesCollected = {};
        }

        // Отримуємо список потрібних ресурсів для цієї будівлі
        const buildingId = target.id;
        const buildingsManager = this.context.mapLogic?.buildingsManager;
        if (!buildingsManager) {
            console.warn('[UnloadResourcesExecutor] BuildingsManager not found');
            return [];
        }
        
        let requiredResources: Record<string, number> = {};
        
        if (buildingsManager) {
            const buildingInstance = buildingsManager.getBuildingInstance(buildingId);
            if (buildingInstance) {
                const buildingType = buildingsManager.getBuildingType(buildingInstance.typeId);
                if (buildingType) {
                    requiredResources = buildingType.cost(1) || {};
                }
            }
        }

                            

        const acceptedResources: ResourceChange[] = [];
        const updatedResources = { ...target.data.resourcesCollected };
        let hasChanges = false;
        
        for (const change of resourceChanges) {
            const resourceId = change.resourceId;
            const amount = change.amount;
            
            // Перевіряємо чи потрібен цей ресурс для будівництва
            const requiredAmount = requiredResources[resourceId] || 0;
            if (requiredAmount > 0) {
                // Перевіряємо скільки вже зібрано
                const currentCollected = updatedResources[resourceId] || 0;
                const stillNeeded = requiredAmount - currentCollected;
                
                if (stillNeeded > 0) {
                    // Додаємо тільки те що ще потрібно
                    const amountToAdd = Math.min(amount, stillNeeded);
                    
                    // Накопичуємо зміни
                    if (!updatedResources[resourceId]) {
                        updatedResources[resourceId] = 0;
                    }
                    updatedResources[resourceId] += amountToAdd;
                    hasChanges = true;
                    
                    // Додаємо до списку прийнятих ресурсів
                    acceptedResources.push({
                        resourceId: change.resourceId,
                        amount: amountToAdd,
                        reason: change.reason
                    });
                    
                }
            }
        }
        
        // Викликаємо updateConstructionProgress один раз в кінці, якщо були зміни
        if (hasChanges) {
            buildingsManager.updateConstructionProgress(
                buildingId, 
                target.data.constructionProgress || 0, 
                updatedResources
            );
        }

        return acceptedResources;
    }

    /**
     * Додає ресурси до будівництва дороги (на конкретний сегмент)
     */
    private addResourcesToRoadConstruction(target: any, resourceChanges: ResourceChange[]): ResourceChange[] {
        
        const buildingsManager = this.context.mapLogic?.buildingsManager;
        if (!buildingsManager) {
            console.warn('[UnloadResourcesExecutor] BuildingsManager not found');
            return [];
        }

        // Отримуємо дані про дорогу
        const roadInstance = buildingsManager.getRoadInfo(target.id);
        if (!roadInstance || !roadInstance.segments) {
            console.warn('[UnloadResourcesExecutor] Road instance or segments not found');
            return [];
        }

        // Знаходимо параметри команди з roadId та segmentIndex
        const roadId = this.command.parameters?.roadId || target.id;
        const segmentIndex = this.command.parameters?.segmentIndex;
        
        if (segmentIndex === undefined || segmentIndex < 0 || segmentIndex >= roadInstance.segments.length) {
            console.warn('[UnloadResourcesExecutor] Invalid segment index:', segmentIndex);
            return [];
        }

        const segment = roadInstance.segments[segmentIndex];
        if (!segment || segment.buildingState === 'completed') {
            console.warn('[UnloadResourcesExecutor] Segment not found or already completed');
            return [];
        }

        // Ініціалізуємо deliveredResources якщо немає
        if (!segment.deliveredResources) {
            segment.deliveredResources = {};
        }

        // Отримуємо потрібні ресурси для сегмента через універсальний метод
        const requiredResources = buildingsManager.calculateRoadCost(roadId, segmentIndex);
        

        const acceptedResources: ResourceChange[] = [];
        let hasChanges = false;

        for (const change of resourceChanges) {
            const resourceId = change.resourceId;
            const amount = change.amount;
            
            // Перевіряємо чи потрібен цей ресурс для сегмента
            const requiredAmount = requiredResources[resourceId] || 0;
            if (requiredAmount > 0) {
                // Перевіряємо скільки вже доставлено
                const currentDelivered = segment.deliveredResources[resourceId] || 0;
                const stillNeeded = requiredAmount - currentDelivered;
                
                if (stillNeeded > 0) {
                    // Додаємо тільки те що ще потрібно
                    const amountToAdd = Math.min(amount, stillNeeded);
                    
                    // Оновлюємо deliveredResources
                    segment.deliveredResources[resourceId] = currentDelivered + amountToAdd;
                    hasChanges = true;
                    
                    acceptedResources.push({
                        resourceId: change.resourceId,
                        amount: amountToAdd,
                        reason: `Added to road segment ${segmentIndex}`
                    });
                    
                }
            }
        }

        // Позначаємо об'єкт як змінений якщо є зміни
        if (hasChanges) {
            // Оновлюємо road.resourcesDelivered для HUD
            if (!roadInstance.resourcesDelivered) {
                (roadInstance as any).resourcesDelivered = {};
            }
            
            for (const change of acceptedResources) {
                const currentDelivered = (roadInstance as any).resourcesDelivered[change.resourceId] || 0;
                (roadInstance as any).resourcesDelivered[change.resourceId] = currentDelivered + change.amount;
            }
            
            // Оновлюємо дані об'єкта на сцені
            if (target.data && target.data.segmentStates) {
                target.data.segmentStates = roadInstance.segments;
            }
            this.context.scene.markObjectDirty?.(target.id);
        }

        return acceptedResources;
    }

    /**
     * Повертає неприйняті ресурси назад у дрон
     */
    private returnUnacceptedResources(object: any, allResources: ResourceChange[], acceptedResources: ResourceChange[]): void {
        // Створюємо карту прийнятих ресурсів для швидкого пошуку
        const acceptedMap = new Map<string, number>();
        for (const accepted of acceptedResources) {
            const current = acceptedMap.get(accepted.resourceId) || 0;
            acceptedMap.set(accepted.resourceId, current + accepted.amount);
        }

        // Повертаємо неприйняті ресурси назад у storage дрона
        for (const change of allResources) {
            const acceptedAmount = acceptedMap.get(change.resourceId) || 0;
            const unacceptedAmount = change.amount - acceptedAmount;
            
            if (unacceptedAmount > 0) {
                // Повертаємо неприйнятий ресурс назад у дрон
                if (!object.data.storage[change.resourceId]) {
                    object.data.storage[change.resourceId] = 0;
                }
                object.data.storage[change.resourceId] += unacceptedAmount;
                
            }
        }
    }

    /**
     * Повертає ресурси назад у дрон (коли немає цілі)
     */
    private returnResourcesToDrone(object: any, resourceChanges: ResourceChange[]): void {
        for (const change of resourceChanges) {
            const resourceId = change.resourceId;
            const amount = change.amount;
            
            // Повертаємо ресурс назад у storage дрона
            if (!object.data.storage[resourceId]) {
                object.data.storage[resourceId] = 0;
            }
            object.data.storage[resourceId] += amount;
            
        }
    }

    /**
     * Фільтрує ресурси на ті що поміщаються у складі та ті що не поміщаються
     */
    private filterResourcesByCapacity(resourceChanges: ResourceChange[]): { 
        canAddChanges: ResourceChange[], 
        cantAddChanges: ResourceChange[] 
    } {
        const resourceManager = this.context.mapLogic?.resources;
        if (!resourceManager) {
            return { canAddChanges: [], cantAddChanges: resourceChanges };
        }

        const canAddChanges: ResourceChange[] = [];
        const cantAddChanges: ResourceChange[] = [];


        // Розділяємо ресурси на ті що поміщаються та ті що не поміщаються
        for (const change of resourceChanges) {
            const currentAmount = resourceManager.getResourceAmount(change.resourceId as any);
            const maxCapacity = resourceManager.getResourceCapacity(change.resourceId as any);
            
            // Обчислюємо скільки можемо додати
            const availableSpace = Math.max(0, maxCapacity - currentAmount);
            
            if (availableSpace >= change.amount) {
                // Весь ресурс поміщається
                canAddChanges.push(change);
            } else if (availableSpace > 0) {
                // Частково поміщається - розділяємо
                canAddChanges.push({
                    resourceId: change.resourceId,
                    amount: availableSpace,
                    reason: change.reason
                });
                cantAddChanges.push({
                    resourceId: change.resourceId,
                    amount: change.amount - availableSpace,
                    reason: change.reason
                });
            } else {
                // Нічого не поміщається
                cantAddChanges.push(change);
            }
        }

        return { canAddChanges, cantAddChanges };
    }
}
