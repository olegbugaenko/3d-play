import { getAutoExecuteGroups } from './db/command-groups-db';

export class AutoGroupMonitor {
    private mapLogic: any;
    private lastCheckTime: number = 0;
    private checkInterval: number = 1000; // 1 секунда

    constructor(mapLogic: any) {
        this.mapLogic = mapLogic;
    }

    /**
     * Оновлює монітор (викликається кожен кадр)
     */
    update(deltaTime: number): void {
        const currentTime = Date.now();
        
        // Перевіряємо кожну секунду
        if (currentTime - this.lastCheckTime < this.checkInterval) {
            return;
        }
        
        this.lastCheckTime = currentTime;
        this.checkAllControlledObjects();
    }

    /**
     * Перевіряє всі об'єкти з тегом 'controlled'
     */
    private checkAllControlledObjects(): void {
        const controlledObjects = this.mapLogic.scene.getObjectsByTag('controlled');
        
        for (const object of controlledObjects) {
            this.checkObjectForAutoGroups(object);
        }
    }

    /**
     * Перевіряє конкретний об'єкт на наявність автоматичних груп
     */
    private checkObjectForAutoGroups(object: any): void {
        const autoGroups = getAutoExecuteGroups();
        
        for (const group of autoGroups) {
            if (this.shouldExecuteAutoGroup(group, object)) {
                // Авто-команда запущена
                this.executeAutoGroup(object.id, group);
                break; // Виконуємо тільки першу знайдену групу
            }
        }
    }

    /**
     * Перевіряє чи потрібно виконати автоматичну групу
     */
    private shouldExecuteAutoGroup(group: any, object: any): boolean {
        if (!group.autoExecute) return false;
        
        // Перевіряємо чи перша команда не належить цій групі
        const commandQueue = this.mapLogic.commandSystem.getCommandQueue(object.id);
        if (commandQueue && commandQueue.getLength() > 0) {
            const firstCommand = commandQueue.getCurrentCommand();
            if (firstCommand?.groupId === group.id) {
                return false; // Вже виконується ця група
            }
        }
        
        // Перевіряємо умову
        switch (group.autoExecute.condition) {
            case 'power-low':
                const currentPower = object.data.power || 0;
                return currentPower < group.autoExecute.threshold;
                
            case 'health-low':
                const currentHealth = object.data.health || 100;
                return currentHealth < group.autoExecute.threshold;
                
            case 'custom':
                return group.autoExecute.customCheck?.(object) || false;
                
            default:
                return false;
        }
    }

    /**
     * Виконує автоматичну групу команд
     */
    private executeAutoGroup(objectId: string, group: any): void {
        // Отримуємо поточну чергу команд
        const commandQueue = this.mapLogic.commandSystem.getCommandQueue(objectId);
        
        if (!commandQueue) {
            console.warn(`[Auto-command] No command queue found for ${objectId}`);
            return;
        }

        // Зберігаємо ВСІ поточні команди (включаючи executing)
        const currentCommands = commandQueue.getAllCommands();
        
        // Очищаємо чергу
        commandQueue.clearAll();
        
        // Додаємо автоматичну групу БЕЗ loop
        const autoGroupContext = {
            objectId,
            targets: {},
            parameters: {}
        };
        
        // Створюємо команди з групи
        const autoCommands = group.tasksPipeline(autoGroupContext);
        
        // Розв'язуємо параметри для автоматичної групи
        if (group.resolveParametersPipeline) {
            const resolvedParameters = this.mapLogic.commandGroupSystem.parameterResolutionService.resolveParameters(
                group.resolveParametersPipeline,
                autoGroupContext,
                'group-start' // Розв'язуємо всі параметри на початку групи
            );
            
            // Параметри розв'язані
            
            // Застосовуємо розв'язані параметри до команд
            for (const command of autoCommands) {
                this.applyResolvedParameters(command, resolvedParameters);
            }
        }
        
        // Додаємо команди з групи в початок
        for (const command of autoCommands) {
            // Встановлюємо groupId та вимикаємо loop
            command.groupId = group.id;
            command.status = 'pending';
            command.createdAt = Date.now();
            
            // Додаємо команду
            this.mapLogic.commandSystem.addCommand(objectId, command);
        }
        
        // Додаємо назад поточні команди
        for (const command of currentCommands) {
            command.status = 'pending'; // Скидаємо статус
            this.mapLogic.commandSystem.addCommand(objectId, command);
        }
        
        // Авто-група вставлена
    }

    /**
     * Застосовує розв'язані параметри до команди
     */
    private applyResolvedParameters(command: any, resolvedParameters: Record<string, any> | undefined): void {
        if (!resolvedParameters) return;
        
        // Застосовуємо position
        if (command.resolvedParamsMapping?.position && resolvedParameters[command.resolvedParamsMapping.position]) {
            const value = resolvedParameters[command.resolvedParamsMapping.position];
            if (value && typeof value === 'object' && value.x !== undefined) {
                command.position = { x: value.x, y: value.y, z: value.z };
                // Позиція застосована
            }
        }
        
        // Застосовуємо targetId
        if (command.resolvedParamsMapping?.targetId && resolvedParameters[command.resolvedParamsMapping.targetId]) {
            const value = resolvedParameters[command.resolvedParamsMapping.targetId];
            command.targetId = value?.id || value;
            // TargetId застосовано
        }
    }
}
