import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';
import { ResourceChange } from '../../resources/resource-types';

export class UnloadResourcesExecutor extends CommandExecutor {
    private unloadProgress: number = 0;
    private lastUnloadTime: number = 0;

    canExecute(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.storage) {
            return false;
        }

        // Перевіряємо чи є що вивантажувати
        const hasResources = Object.values(object.data.storage as Record<string, number>).some(amount => amount > 0);
        if (!hasResources) {
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

        // Проходимо по всіх ресурсах в storage
        for (const [resourceId, currentAmount] of Object.entries(object.data.storage as Record<string, number>)) {
            if (currentAmount > 0) {
                const amountToTake = Math.min(amountToUnload, currentAmount);
                
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

        // Додаємо ресурси гравцю через ResourceManager
        if (resourceChanges.length > 0) {
            // Отримуємо ResourceManager через MapLogic
            const resourceManager = this.context.mapLogic?.resources;
            if (resourceManager) {
                const success = resourceManager.addResources(resourceChanges);
                if (success) {
                    console.log(`Unloaded ${totalUnloaded} resources from ${object.id}`);
                } else {
                    console.warn(`Failed to add resources to player storage`);
                }
            } else {
                console.warn('ResourceManager not available');
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

        // Команда завершена якщо storage порожній
        if (!object.data.storage) return true;

        const hasResources = Object.values(object.data.storage as Record<string, number>).some(amount => amount > 0);
        return !hasResources;
    }

    private calculateUnloadProgress(object: any): number {
        if (!object.data.storage) return 1.0;

        let totalResources = 0;
        let totalCurrent = 0;

        for (const [resourceId, currentAmount] of Object.entries(object.data.storage as Record<string, number>)) {
            totalCurrent += currentAmount;
            // Приблизна оцінка максимальної ємності
            totalResources += Math.max(totalCurrent, 100);
        }

        if (totalResources === 0) return 1.0;
        return Math.max(0, 1.0 - (totalCurrent / totalResources));
    }
}
