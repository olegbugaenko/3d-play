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
    update(_deltaTime: number): void {
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
        
        const activeGroupState = this.mapLogic.commandGroupSystem.getGroupState(object.id, group.id);
        if (activeGroupState && activeGroupState.status === 'active') {
            return false;
        }

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
        const autoGroupContext = {
            objectId,
            targets: {},
            parameters: {},
            resolved: {}
        };

        const started = this.mapLogic.commandGroupSystem.addCommandGroup(objectId, group.id, autoGroupContext);
        if (!started) {
            console.warn(`[Auto-command] Failed to start auto group ${group.id} for ${objectId}`);
        }
    }

}
