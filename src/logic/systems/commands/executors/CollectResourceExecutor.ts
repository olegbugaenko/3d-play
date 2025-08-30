import { CommandExecutor } from '../CommandExecutor';
import { CommandResult, CommandFailureCode } from '../command.types';

export class CollectResourceExecutor extends CommandExecutor {
    private resourceType: string | null = null;

    getEnergyUpkeep() {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.maxCapacity) {
            return false;
        }
        
        return object.data.collectionSpeed;
    }

    canExecute(): boolean {
        if (!this.command.targetId) {
            return false;
        }

        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.maxCapacity) {
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

        // Визначаємо тип ресурсу з цілі
        if (!this.resourceType) {
            this.resourceType = targetResource.data?.resourceId || targetResource.type;
        }

        // Перевіряємо чи є ресурс для добування
        if (!targetResource.data?.resourceAmount || targetResource.data.resourceAmount <= 0) {
            return { success: false, message: 'Resource depleted' };
        }

        // Ініціалізуємо storage якщо не існує
        if (!object.data.storage) {
            object.data.storage = {};
        }

        // Поточна кількість ресурсу в баку
        if (!this.resourceType) {
            return { success: false, message: 'Resource type not determined' };
        }
        
        const currentAmount = object.data.storage[this.resourceType] || 0;
        const maxCapacity = object.data.maxCapacity || 5;
        const collectionSpeed = object.data.collectionSpeed || 0.5;

        // Перевіряємо чи бак не повний
        if (currentAmount >= maxCapacity) {
            return { success: true, message: 'Storage is full' };
        }

        // Додаємо ресурс
        const amountToAdd = Math.min(collectionSpeed * this.context.deltaTime, maxCapacity - currentAmount);
        object.data.storage[this.resourceType] = currentAmount + amountToAdd;

        // Зменшуємо кількість ресурсу в цілі
        targetResource.data.resourceAmount = Math.max(0, targetResource.data.resourceAmount - amountToAdd);

        // Якщо ресурс закінчився - видаляємо його з карти
        if (targetResource.data.resourceAmount <= 0) {
            // Очищаємо target у юніта
            if (object.data) {
                object.data.target = undefined;
            }
            
            // Додаємо каменюк до списку зібраних в MapLogic
            if (this.context.mapLogic) {
                this.context.mapLogic.collectRock(this.command.targetId!);
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

        if (!this.resourceType) {
            return true; // Немає типу ресурсу - завершуємо
        }

        const currentAmount = object.data.storage?.[this.resourceType] || 0;
        const maxCapacity = object.data.maxCapacity || 5;

        if (currentAmount >= maxCapacity) {
            return true; // Бак повний
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
