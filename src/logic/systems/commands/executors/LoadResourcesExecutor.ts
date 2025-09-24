import { CommandExecutor } from '../CommandExecutor';
import { CommandResult, CommandFailureCode } from '../command.types';
import {
    ensureDroneStorage,
    getDroneFreeCapacity,
    withdrawFromGlobalStorage,
    withdrawFromInternalStorage,
    hasAnyRequiredInGlobalStorage,
    hasAnyRequiredInInternalStorage,
    calculateLoadProgress
} from './utils/resource-helpers';

export class LoadResourcesExecutor extends CommandExecutor {
    private loadProgress: number = 0;
    private lastLoadTime: number = 0;
    private static readonly EPSILON = 1e-6;

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

        if (getDroneFreeCapacity(object) <= 0) {
            return false;
        }

        const requiredResources = this.command.parameters?.resources || {};
        const storage = ensureDroneStorage(object);

        if (Object.keys(requiredResources).length > 0) {
            if (!this.targetHasRequiredResources(target, requiredResources, storage)) {
                return false;
            }
        } else if (!this.hasAnyAvailableResource(target)) {
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

        if (this.command.targetId) {
            this.rotateToTarget(this.command.targetId);
        }

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastLoadTime) / 1000;

        if (this.lastLoadTime === 0) {
            this.lastLoadTime = currentTime;
            return { success: true, message: 'Starting resource loading' };
        }

        const loadSpeed = object.data.loadSpeed || 1.0;
        const storage = ensureDroneStorage(object);
        let remainingBySpeed = loadSpeed * deltaTime;
        let remainingCapacity = getDroneFreeCapacity(object);

        if (remainingCapacity <= 0) {
            return { success: true, message: 'Inventory full', data: { loaded: 0, progress: this.loadProgress } };
        }

        const requiredResources = this.command.parameters?.resources || {};
        let totalLoaded = 0;

        for (const [resourceId, requiredAmount] of Object.entries(requiredResources)) {
            if (remainingBySpeed <= 0 || remainingCapacity <= 0) {
                break;
            }

            const targetAmount = Number(requiredAmount);
            if (targetAmount <= 0) {
                continue;
            }

            const alreadyInDrone = storage[resourceId] || 0;
            const stillNeeded = Math.max(0, targetAmount - alreadyInDrone);
            if (stillNeeded <= 0) {
                continue;
            }

            const maxCanTake = Math.min(stillNeeded, remainingBySpeed, remainingCapacity);
            const loaded = this.takeFromTarget(target, resourceId, maxCanTake, object);

            if (loaded > 0) {
                storage[resourceId] = alreadyInDrone + loaded;
                totalLoaded += loaded;
                remainingBySpeed -= loaded;
                remainingCapacity -= loaded;
            }
        }

        const hasResourcesAvailable = this.targetHasRequiredResources(target, requiredResources, storage);
        const missingResources = this.getMissingResources(requiredResources, storage);

        if (missingResources.length > 0 && !hasResourcesAvailable) {
            this.lastLoadTime = currentTime;
            this.loadProgress = calculateLoadProgress(storage, requiredResources);

            const missingDescription = missingResources
                .map(({ resourceId, missing }) => `${resourceId} (${missing.toFixed(2)})`)
                .join(', ');

            return {
                success: false,
                message: `Missing required resources in storage: ${missingDescription}`,
                code: CommandFailureCode.INSUFFICIENT_RESOURCES,
                data: { loaded: totalLoaded, progress: this.loadProgress }
            };
        }

        if (totalLoaded === 0 && !this.hasSomethingLoaded(object, requiredResources)) {
            if (!hasResourcesAvailable) {
                this.lastLoadTime = currentTime;
                this.loadProgress = calculateLoadProgress(storage, requiredResources);

                return {
                    success: false,
                    message: 'No resources available to load and drone has nothing useful',
                    code: CommandFailureCode.INSUFFICIENT_RESOURCES,
                    data: { loaded: 0, progress: this.loadProgress }
                };
            }
        }

        this.lastLoadTime = currentTime;
        this.loadProgress = calculateLoadProgress(storage, requiredResources);

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

        if (getDroneFreeCapacity(object) <= 0) {
            return true;
        }

        if (this.hasAllRequiredResources(object, requiredResources)) {
            return true;
        }

        if (target && this.hasSomethingLoaded(object, requiredResources)) {
            const storage = ensureDroneStorage(object);
            if (!this.targetHasRequiredResources(target, requiredResources, storage)) {
                return true;
            }
        }

        return false;
    }

    // ========== Helper Methods ==========

    private takeFromTarget(target: any, resourceId: string, amount: number, object: any): number {
        if (amount <= 0) {
            return 0;
        }

        if (target?.tags?.includes('building') && target.data?.isBuilt && !target?.tags?.includes('storage')) {
            return withdrawFromInternalStorage(this.context, target.id, resourceId, amount);
        }

        const reason = `Loaded by ${object.id}`;
        return withdrawFromGlobalStorage(this.context, resourceId, amount, reason);
    }

    private targetHasRequiredResources(
        target: any,
        requiredResources: Record<string, number>,
        alreadyLoaded: Record<string, number>
    ): boolean {
        if (Object.keys(requiredResources).length === 0) {
            return this.hasAnyAvailableResource(target);
        }

        if (target?.tags?.includes('building') && target.data?.isBuilt && !target?.tags?.includes('storage')) {
            return hasAnyRequiredInInternalStorage(this.context, target.id, requiredResources, alreadyLoaded);
        }

        return hasAnyRequiredInGlobalStorage(this.context, requiredResources, alreadyLoaded);
    }

    private hasAnyAvailableResource(target: any): boolean {
        if (target?.tags?.includes('building') && target.data?.isBuilt && !target?.tags?.includes('storage')) {
            const bm: any = this.context.mapLogic?.buildingsManager;
            const inst = bm?.getBuildingInstance?.(target.id);
            if (!inst?.internalStorage) return false;
            return Object.values(inst.internalStorage).some((bucket: any) => (bucket?.current || 0) > 0);
        }

        const resourceManager = this.context.mapLogic?.resources;
        if (!resourceManager) return false;

        const resources: any = resourceManager.getResources?.();
        if (!resources) {
            return false;
        }

        if (typeof resources.values === 'function') {
            for (const value of resources.values()) {
                const balance = typeof value === 'number' ? value : Number(value?.balance ?? 0);
                if (balance > 0) {
                    return true;
                }
            }
            return false;
        }

        return Object.values(resources).some((value: any) => {
            if (typeof value === 'number') {
                return value > 0;
            }
            if (value && typeof value === 'object') {
                return Number(value.balance ?? 0) > 0;
            }
            return Number(value) > 0;
        });
    }

    private hasAllRequiredResources(object: any, requiredResources: Record<string, number>): boolean {
        if (Object.keys(requiredResources).length === 0) {
            return false;
        }

        const inventory = ensureDroneStorage(object);

        for (const [resourceId, requiredAmount] of Object.entries(requiredResources)) {
            const currentAmount = inventory[resourceId] || 0;
            if (currentAmount + 1e-8 < requiredAmount) {
                return false;
            }
        }

        return true;
    }

    /**
     * Перевіряє чи дрон завантажив хоча б щось з потрібних ресурсів
     */
    private hasSomethingLoaded(object: any, requiredResources: Record<string, number>): boolean {
        if (Object.keys(requiredResources).length === 0) {
            return false;
        }

        const inventory = ensureDroneStorage(object);

        for (const [resourceId] of Object.entries(requiredResources)) {
            const currentAmount = inventory[resourceId] || 0;
            if (currentAmount > 0) {
                return true;
            }
        }

        return false;
    }

    private getMissingResources(
        requiredResources: Record<string, number>,
        storage: Record<string, number>
    ): Array<{ resourceId: string; missing: number }> {
        const missing: Array<{ resourceId: string; missing: number }> = [];

        for (const [resourceId, requiredAmount] of Object.entries(requiredResources)) {
            const required = Number(requiredAmount) || 0;
            if (required <= LoadResourcesExecutor.EPSILON) {
                continue;
            }

            const current = Number(storage[resourceId] || 0);
            const stillNeeded = required - current;

            if (stillNeeded > LoadResourcesExecutor.EPSILON) {
                missing.push({ resourceId, missing: stillNeeded });
            }
        }

        return missing;
    }
}
