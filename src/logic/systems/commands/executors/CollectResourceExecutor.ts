import { CommandExecutor } from '../CommandExecutor';
import { CommandResult, CommandFailureCode } from '../command.types';
import { RESOURCES_DB } from '@resources/resources-db';
import {
    ensureDroneStorage,
    getDroneCapacity,
    getGlobalFreeCapacity,
    isGlobalStorageFull
} from './utils/resource-helpers';

export class CollectResourceExecutor extends CommandExecutor {
    private resourceType: string | null = null;

    getEnergyUpkeep(): number {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || getDroneCapacity(object) <= 0) {
            return 0;
        }

        return object.data.collectionSpeed || 0;
    }

    canExecute(): boolean {
        if (!this.command.targetId) {
            return false;
        }

        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || getDroneCapacity(object) <= 0) {
            return false;
        }

        const targetResource = this.context.scene.getObjectById(this.command.targetId);
        if (!targetResource || !targetResource.data?.resourceAmount || targetResource.data.resourceAmount <= 0) {
            return false;
        }

        return true;
    }

    execute(): CommandResult {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) {
            return { success: false, message: 'Object not found' };
        }
        object.data.animationId = 'collect';
        
        // Отримуємо цільовий ресурс
        if (!this.command.targetId) {
            return { success: false, message: 'No target resource specified' };
        }

        const targetResource = this.context.scene.getObjectById(this.command.targetId);
        if (!targetResource) {
            return { success: false, message: 'Target resource not found: '+this.command.targetId, code: CommandFailureCode.RESOURCE_NOT_FOUND };
        }

        // 🚀 Обертаємо дрона до ресурсу
        this.rotateToTarget(this.command.targetId!);

        // Визначаємо тип ресурсу з цілі
        if (!this.resourceType) {
            this.resourceType = targetResource.data?.resourceId || targetResource.type;
        }

        // Перевіряємо чи є ресурс для добування
        if (!targetResource.data?.resourceAmount || targetResource.data.resourceAmount <= 0) {
            return { success: false, message: 'Resource depleted' };
        }

        if (this.resourceType && isGlobalStorageFull(this.context, this.resourceType, 1e-8)) {
            return { success: false, message: 'Storage is full' };
        }

        const storage = ensureDroneStorage(object);

        // Поточна кількість ресурсу в баку
        if (!this.resourceType) {
            return { success: false, message: 'Resource type not determined' };
        }
        
        const currentAmount = storage[this.resourceType] || 0;
        const maxCapacity = getDroneCapacity(object) || 5;
        const baseCollectionSpeed = object.data.collectionSpeed || 0.5;
        
        // Застосовуємо множник складності добування з БД ресурсів
        const resourceData = RESOURCES_DB[this.resourceType as keyof typeof RESOURCES_DB];
        const difficultyMultiplier = resourceData?.miningDifficulty || 1.0;
        const effectiveCollectionSpeed = baseCollectionSpeed * difficultyMultiplier;

        // Перевіряємо чи бак не повний
        if (currentAmount >= maxCapacity) {
            return { success: true, message: 'Storage is full' };
        }

        // Перевіряємо чи є місце у глобальному складі
        const globalFreeSpace = getGlobalFreeCapacity(this.context, this.resourceType);
        if (globalFreeSpace <= currentAmount) {
            return { success: true, message: 'Global storage is full, need to unload first' };
        }

        // Додаємо ресурс з урахуванням складності
        const amountToAdd = Math.min(
            effectiveCollectionSpeed * this.context.deltaTime,
            maxCapacity - currentAmount,
            Math.max(0, globalFreeSpace)
        );
        storage[this.resourceType] = currentAmount + amountToAdd;

        // Зменшуємо кількість ресурсу в цілі
        targetResource.data.resourceAmount = Math.max(0, targetResource.data.resourceAmount - amountToAdd);

        // Якщо ресурс закінчився - видаляємо його з карти
        if (targetResource.data.resourceAmount <= 0) {
            // Очищаємо target у юніта
            if (object.data) {
                object.data.target = undefined;
            }
            
            // Додаємо ресурс до списку зібраних в MapLogic
            if (this.context.mapLogic) {
                if (targetResource.type === 'rock') {
                    this.context.mapLogic.collectRock(this.command.targetId!);
                } else if (targetResource.type === 'biomass') {
                    this.context.mapLogic.collectBiomass(this.command.targetId!);
                }
            }
            
            // Видаляємо ресурс з карти
            
            // Ресурс вичерпано та видалено зі сцени
            
            // Повертаємо failure з кодом для restart групи
            return { success: false, message: 'Resource depleted and removed', code: CommandFailureCode.RESOURCE_FINISHED };
        }

        return { success: true, message: `Collected ${amountToAdd} ${this.resourceType}` };
    }

    completeCheck(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object) return true;

        // Команда завершена якщо:
        // 1. Бак повний
        // 2. Ресурс закінчився
        // 3. Об'єкт не може більше збирати
        // 4. Глобальний склад повний і дрон має ресурси

        if (!this.resourceType) {
            return true; // Немає типу ресурсу - завершуємо
        }

        const storage = ensureDroneStorage(object);
        const currentAmount = storage?.[this.resourceType] || 0;
        const maxCapacity = getDroneCapacity(object) || 5;

        if (currentAmount >= maxCapacity) {
            return true; // Бак повний
        }

        // Перевіряємо чи є місце у глобальному складі
        if (getGlobalFreeCapacity(this.context, this.resourceType) <= currentAmount) {
            return true; // Глобальний склад повний, треба розвантажити
        }

        if (this.command.targetId) {
            const targetResource = this.context.scene.getObjectById(this.command.targetId);
            if (!targetResource || !targetResource.data?.resourceAmount || targetResource.data.resourceAmount <= 0) {
                return true; // Ресурс закінчився або видалений
            }
        }

        return false;
    }

}
