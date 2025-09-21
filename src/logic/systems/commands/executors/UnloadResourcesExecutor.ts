import { CommandExecutor } from '../CommandExecutor';
import { CommandResult } from '../command.types';
import {
    ensureDroneStorage,
    withdrawFromDrone,
    depositToGlobalStorage,
    depositToConstruction,
    depositToRoadSegment,
    depositToInternalStorage,
    getDroneCapacity,
    calculateUnloadProgress,
    isRoadSegmentSatisfied,
    getGlobalFreeCapacity,
    hasConstructionResources
} from './utils/resource-helpers';

type PlannedUnload = { resourceId: string; amount: number };

const EPSILON = 1e-8;

export class UnloadResourcesExecutor extends CommandExecutor {
    private unloadProgress: number = 0;
    private lastUnloadTime: number = 0;

    getEnergyUpkeep(): number {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.maxCapacity) {
            return 0;
        }

        return object.data.unloadSpeed || 0;
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

        const storage = ensureDroneStorage(object);

        if (this.command.targetId) {
            this.rotateToTarget(this.command.targetId);
        }

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUnloadTime) / 1000;

        if (this.lastUnloadTime === 0) {
            this.lastUnloadTime = currentTime;
            return { success: true, message: 'Starting resource unload' };
        }

        const unloadSpeed = object.data.unloadSpeed || 1.0;
        const unloadBudget = unloadSpeed * deltaTime;
        const resourcesToUnload = this.command.parameters?.resourcesToUnload as Record<string, number> | undefined;

        const { plan, totalRequested } = this.buildUnloadPlan(storage, resourcesToUnload, unloadBudget);
        if (totalRequested <= EPSILON) {
            this.lastUnloadTime = currentTime;
            this.unloadProgress = calculateUnloadProgress(storage, getDroneCapacity(object));
            return {
                success: true,
                message: 'Nothing to unload',
                data: { unloaded: 0, progress: this.unloadProgress }
            };
        }

        const targetId = this.command.targetId;
        if (!targetId) {
            return {
                success: false,
                message: 'No target specified for unloading',
                data: { unloaded: 0, progress: this.unloadProgress }
            };
        }

        const target = this.context.scene.getObjectById(targetId);
        if (!target) {
            return { success: false, message: `Target not found: ${targetId}` };
        }

        const totalUnloaded = this.applyUnloadPlan(object, target, storage, plan);

        this.lastUnloadTime = currentTime;
        this.unloadProgress = calculateUnloadProgress(storage, getDroneCapacity(object));

        return {
            success: true,
            message: `Unloaded ${totalUnloaded} resources`,
            data: { unloaded: totalUnloaded, progress: this.unloadProgress }
        };
    }

    completeCheck(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) return true;

        const storage = ensureDroneStorage(object);
        const resourcesToUnload = this.command.parameters?.resourcesToUnload as Record<string, number> | undefined;
        const remainingPlan = this.buildUnloadPlan(storage, resourcesToUnload, Number.POSITIVE_INFINITY);

        if (remainingPlan.totalRequested <= EPSILON) {
            return true;
        }

        const targetId = this.command.targetId;
        if (!targetId) {
            return false;
        }

        const target = this.context.scene.getObjectById(targetId);
        if (!target) {
            return false;
        }

        if (target.tags?.includes('storage') && target.data?.isBuilt) {
            const canFit = remainingPlan.plan.some(item => getGlobalFreeCapacity(this.context, item.resourceId) > EPSILON);
            if (!canFit && remainingPlan.plan.length > 0) {
                return true;
            }
        } else if (target.tags?.includes('road')) {
            const roadId = this.command.parameters?.roadId || target.id;
            const segmentIndex = this.command.parameters?.segmentIndex;
            if (segmentIndex !== undefined && isRoadSegmentSatisfied(this.context, roadId, segmentIndex)) {
                return true;
            }
        } else if (!target.data?.isBuilt) {
            if (hasConstructionResources(this.context, target.id)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Перевіряє чи є ресурси для вивантаження (з урахуванням фільтрації)
     */
    private hasResourcesToUnload(object: any): boolean {
        const storage = ensureDroneStorage(object);
        const resourcesToUnload = this.command.parameters?.resourcesToUnload as Record<string, number> | undefined;
        const { totalRequested } = this.buildUnloadPlan(storage, resourcesToUnload, Number.POSITIVE_INFINITY);
        return totalRequested > EPSILON;
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

    private buildUnloadPlan(
        storage: Record<string, number>,
        filter: Record<string, number> | undefined,
        maxAmount: number
    ): { plan: PlannedUnload[]; totalRequested: number } {
        const plan: PlannedUnload[] = [];
        let remaining = maxAmount;

        for (const [resourceId, amount] of Object.entries(storage)) {
            if (remaining <= EPSILON) break;
            if (amount <= EPSILON) continue;

            let allowed = amount;
            if (filter) {
                const desired = Number(filter[resourceId]) || 0;
                if (desired <= EPSILON) {
                    continue;
                }
                allowed = Math.min(allowed, desired);
            }

            const toUnload = Math.min(allowed, remaining);
            if (toUnload <= EPSILON) continue;

            plan.push({ resourceId, amount: toUnload });
            remaining -= toUnload;
        }

        const totalRequested = plan.reduce((sum, item) => sum + item.amount, 0);
        return { plan, totalRequested };
    }

    private applyUnloadPlan(
        object: any,
        target: any,
        storage: Record<string, number>,
        plan: PlannedUnload[]
    ): number {
        let totalAccepted = 0;

        for (const item of plan) {
            const accepted = this.depositPlannedResource(object, target, item.resourceId, item.amount);
            if (accepted > 0) {
                withdrawFromDrone(storage, item.resourceId, accepted);
                totalAccepted += accepted;
            }
        }

        return totalAccepted;
    }

    private depositPlannedResource(object: any, target: any, resourceId: string, amount: number): number {
        if (amount <= EPSILON) {
            return 0;
        }

        if (target?.tags?.includes('storage') && target.data?.isBuilt) {
            const reason = `Unloaded from ${object.id}`;
            return depositToGlobalStorage(this.context, resourceId, amount, reason);
        }

        if (target?.tags?.includes('road')) {
            const roadId = this.command.parameters?.roadId || target.id;
            const segmentIndex = this.command.parameters?.segmentIndex;
            if (segmentIndex === undefined) {
                return 0;
            }
            return depositToRoadSegment(this.context, roadId, segmentIndex, resourceId, amount);
        }

        if (!target?.data?.isBuilt) {
            return depositToConstruction(this.context, target.id, resourceId, amount);
        }

        if (target?.tags?.includes('building') && target.data?.isBuilt) {
            return depositToInternalStorage(this.context, target.id, resourceId, amount);
        }

        return 0;
    }
}
