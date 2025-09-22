import { CommandExecutor } from '../CommandExecutor';
import { CommandResult, CommandFailureCode } from '../command.types';
import { hasConstructionResources } from './utils/resource-helpers';

export class BuildExecutor extends CommandExecutor {
    private lastBuildTime: number = 0;

    getEnergyUpkeep() {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.buildSpeed) {
            return 0.2; // Мінімальне споживання енергії для будівництва
        }
        
        return object.data.buildSpeed * 0.15; // Споживання енергії пропорційне швидкості будівництва
    }

    canExecute(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        const buildingId = this.command.parameters?.buildingId;

        console.log('[BuildExecutor] canExecute');
        
        if (!object || !buildingId) {
            return false;
        }

        // Перевіряємо чи є buildSpeed
        if (!object.data?.buildSpeed || object.data.buildSpeed <= 0) {
            return false;
        }

        // Перевіряємо чи існує будівля для будівництва
        const buildingsManager = this.context.mapLogic?.buildingsManager;
        if (!buildingsManager) {
            return false;
        }

        const buildingInstance = buildingsManager.getBuildingInstance(buildingId);
        if (!buildingInstance) {
            return false;
        }

        // Перевіряємо чи будівля ще не добудована
        if (buildingInstance.constructionProgress >= 1.0) {
            return false;
        }

        // Перевіряємо чи є достатньо ресурсів для завершення будівництва
        if (!hasConstructionResources(this.context, buildingId)) {
            return false;
        }

        return true;
    }

    execute(): CommandResult {
        const object = this.context.scene.getObjectById(this.context.objectId);
        const buildingId = this.command.parameters?.buildingId;
        
        if (!object || !buildingId) {
            return { success: false, message: 'Object or building ID not found' };
        }

        const buildingsManager = this.context.mapLogic?.buildingsManager;
        if (!buildingsManager) {
            return { success: false, message: 'BuildingsManager not found' };
        }

        const buildingInstance = buildingsManager.getBuildingInstance(buildingId);
        if (!buildingInstance) {
            return { success: false, message: 'Building instance not found' };
        }

        // Перевіряємо чи є достатньо ресурсів для будівництва
        if (!hasConstructionResources(this.context, buildingId)) {
            return {
                success: false,
                message: 'Insufficient resources for construction',
                code: CommandFailureCode.INSUFFICIENT_RESOURCES
            };
        }

        // 🚀 Обертаємо дрона до будівлі
        if (this.command.targetId) {
            this.rotateToTarget(this.command.targetId);
        }

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastBuildTime) / 1000; // в секундах
        
        if (this.lastBuildTime === 0) {
            this.lastBuildTime = currentTime;
            return { success: true, message: 'Starting construction' };
        }

        const buildSpeed = object.data.buildSpeed || 0.5; // прогрес будівництва в секунду (50% за секунду за замовчуванням)
        const progressIncrement = buildSpeed * deltaTime;

        // Оновлюємо прогрес будівництва
        const newProgress = Math.min(1.0, buildingInstance.constructionProgress + progressIncrement);
        
        // Використовуємо метод BuildingsManager для оновлення прогресу
        buildingsManager.updateConstructionProgress(buildingId, newProgress);

        this.lastBuildTime = currentTime;

        console.log(`[BuildExecutor] Building progress for ${buildingId}: ${(newProgress * 100).toFixed(1)}%`);

        // Якщо будівництво завершено - активуємо будівлю
        if (newProgress >= 1.0) {
            this.completeBuildingConstruction(buildingsManager, buildingId);
            return { 
                success: true, 
                message: `Construction completed!`,
                data: { progress: newProgress, completed: true }
            };
        }

        return { 
            success: true, 
            message: `Building in progress: ${(newProgress * 100).toFixed(1)}%`,
            data: { progress: newProgress, completed: false }
        };
    }

    completeCheck(): boolean {
        const buildingId = this.command.parameters?.buildingId;
        if (!buildingId) return true;

        const buildingsManager = this.context.mapLogic?.buildingsManager;
        if (!buildingsManager) return true;

        const buildingInstance = buildingsManager.getBuildingInstance(buildingId);
        if (!buildingInstance) return true;

        // Завершуємо коли будівництво досягло 100%
        const isCompleted = buildingInstance.constructionProgress >= 1.0;
        
        if (isCompleted) {
            console.log(`[BuildExecutor] Construction completed for ${buildingId}`);
        }

        return isCompleted;
    }

    /**
     * Завершує будівництво - активує будівлю та очищає ресурси
     */
    private completeBuildingConstruction(buildingsManager: any, buildingId: string): void {
        try {
            // Використовуємо новий метод який все робить правильно
            buildingsManager.completeBuildingConstruction(buildingId);

        } catch (error) {
            console.error(`[BuildExecutor] Error completing construction for ${buildingId}:`, error);
        }
    }
}
