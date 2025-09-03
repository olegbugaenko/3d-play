import { Command, CommandResult, CommandContext } from './command.types';
import { getCommandCost } from './db/commands-db';

export abstract class CommandExecutor {
    protected command: Command;
    protected context: CommandContext;

    constructor(command: Command, context: CommandContext) {
        this.command = command;
        this.context = context;
    }

    /**
     * Перевіряє чи може команда бути виконана
     */
    abstract canExecute(): boolean;

    /**
     * Виконує команду
     */
    abstract execute(): CommandResult;

    /**
     * Перевіряє чи завершена команда
     * Повертає true якщо команда завершена, false якщо ще виконується
     */
    abstract completeCheck(): boolean;

    abstract getEnergyUpkeep(): number;

    /**
     * Отримує затратність команди (power per second)
     */
    getPowerCostPerSecond(): number {
        const commandType = this.command.type;
        const cost = getCommandCost(commandType);
        const executorIntensityPower = this.getEnergyUpkeep()
        return cost.powerPerSecond*executorIntensityPower;
    }

    /**
     * Отримує коефіцієнт ефективності дрона
     */
    getEfficiencyMultiplier(): number {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || object.type !== 'rover') {
            return 1.0; // За замовчуванням
        }
        return object.data.efficiencyMultiplier || 1.0;
    }

    /**
     * Розраховує фінальну затратність команди для конкретного дрона
     */
    getFinalPowerCostPerSecond(): number {
        const baseCost = this.getPowerCostPerSecond();
        const efficiencyMultiplier = this.getEfficiencyMultiplier();
        return baseCost * efficiencyMultiplier;
    }

    /**
     * Перевіряє чи достатньо power для виконання команди
     */
    hasEnoughPower(): boolean {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || object.type !== 'rover') {
            return true; // Не дрони завжди мають достатньо power
        }
        
        const currentPower = object.data.power || 0;
        const powerCost = this.getFinalPowerCostPerSecond();
        
        // Якщо команда не споживає power, завжди можна виконати
        if (powerCost <= 0) {
            return true;
        }
        
        return currentPower > 0;
    }

    /**
     * Споживає power під час виконання команди
     */
    consumePower(deltaTime: number): void {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || object.type !== 'rover') {
            return; // Тільки дрони споживають power
        }
        
        const powerCost = this.getFinalPowerCostPerSecond();
        if (powerCost <= 0) {
            return; // Команда не споживає power
        }
        
        const powerToConsume = powerCost * deltaTime;
        const currentPower = object.data.power || 0;
        object.data.power = Math.max(0, currentPower - powerToConsume);
    }

    /**
     * Оновлює статус команди
     */
    updateCommandStatus(status: Command['status']): void {
        this.command.status = status;
    }

    /**
     * Отримує поточну команду
     */
    getCommand(): Command {
        return this.command;
    }

    /**
     * Отримує контекст команди
     */
    getContext(): CommandContext {
        return this.context;
    }

    /**
     * 🚀 Утилітний метод для обертання об'єкта до цілі
     */
    protected rotateToTarget(targetId: string): void {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.rotatable) {
            return;
        }

        const target = this.context.scene.getObjectById(targetId);
        if (!target) {
            return;
        }

        const direction = {
            x: target.coordinates.x - object.coordinates.x,
            z: target.coordinates.z - object.coordinates.z
        };
        const targetRotation = Math.atan2(direction.x, direction.z);
        const rotationOffset = object.data.rotationOffset || 0;
        
        // Якщо об'єкт terrainAlign - зберігаємо 2D ротацію відносно нормалі
        if (object.terrainAlign) {
            object.rotation2D = targetRotation + rotationOffset;
        } else {
            // Для звичайних об'єктів
            object.rotation.y = targetRotation + rotationOffset;
        }
        
        // 🚀 Синхронізуємо ротацію з рендерером
        this.syncRotation(object);
    }

    /**
     * 🚀 Утилітний метод для обертання об'єкта до цілі (по об'єкту)
     */
    protected rotateToTargetObject(target: any): void {
        const object = this.context.scene.getObjectById(this.context.objectId);
        if (!object || !object.data?.rotatable || !target) {
            return;
        }

        const direction = {
            x: target.coordinates.x - object.coordinates.x,
            z: target.coordinates.z - object.coordinates.z
        };
        const targetRotation = Math.atan2(direction.x, direction.z);
        const rotationOffset = object.data.rotationOffset || 0;
        
        // Якщо об'єкт terrainAlign - зберігаємо 2D ротацію відносно нормалі
        if (object.terrainAlign) {
            object.rotation2D = targetRotation + rotationOffset;
        } else {
            // Для звичайних об'єктів
            object.rotation.y = targetRotation + rotationOffset;
        }
        
        // 🚀 Синхронізуємо ротацію з рендерером
        this.syncRotation(object);
    }

    /**
     * 🚀 Синхронізує ротацію об'єкта з рендерером
     */
    protected syncRotation(object: any): void {
        // Викликаємо метод SceneLogic для синхронізації ротації
        if (this.context.scene.syncRotation) {
            this.context.scene.syncRotation(object);
        }
    }
}
