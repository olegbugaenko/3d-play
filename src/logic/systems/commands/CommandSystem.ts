import { Command, CommandType, CommandContext, CommandStatus, CommandFailureCode, CommandResult } from './command.types';
import { CommandExecutor } from './CommandExecutor';
import {
    MoveToExecutor,
    CollectResourceExecutor,
    UnloadResourcesExecutor,
    LoadResourcesExecutor,
    BuildExecutor,
    ChargeExecutor,
    BuildRoadExecutor
} from './executors';
import { CommandQueue } from './CommandQueue';
import { ICommandQueue } from '@interfaces/ICommandQueue';
import { SaveLoadManager, CommandSystemSaveData } from '../save-load/save-load.types';
import { ICommandSystem, IMapLogic } from '@interfaces/index';
import type { CommandScheduler } from './CommandScheduler';

export class CommandSystem implements SaveLoadManager, ICommandSystem {
    private commandQueues: Map<string, ICommandQueue> = new Map();
    private executors: Map<string, CommandExecutor> = new Map();
    private mapLogic: IMapLogic;
    private scheduler?: CommandScheduler;

    constructor(mapLogic: IMapLogic) {
        this.mapLogic = mapLogic;
    }

    setScheduler(scheduler: CommandScheduler): void {
        this.scheduler = scheduler;
    }

    /**
     * Додає команду для об'єкта
     */
    addCommand(objectId: string, command: Command): void {
        let queue = this.commandQueues.get(objectId);
        if (!queue) {
            queue = new CommandQueue();
            this.commandQueues.set(objectId, queue);
        }

        queue.addCommand(command);
        
        // Якщо це перша команда, створюємо executor
        if (queue.getLength() === 1 || !this.executors.get(objectId)) {
            this.createExecutor(objectId, command);
        }
    }

    /**
     * Додає команду для об'єкта
     */
    addAutoresolveCommand(objectId: string, command: Command, _resolved: Record<string, any> | undefined): void {
        this.addCommand(objectId, command);
    }

    /**
     * Додає команду з пріоритетом
     */
    addPriorityCommand(objectId: string, command: Command): void {
        let queue = this.commandQueues.get(objectId);
        if (!queue) {
            queue = new CommandQueue();
            this.commandQueues.set(objectId, queue);
        }

        queue.addPriorityCommand(command);
        
        // Якщо немає активного executor для цього об'єкта, створюємо новий
        if (!this.executors.has(objectId)) {
            this.createExecutor(objectId, command);
        }
    }

     /**
     * Заміняє поточні команди новою
     */
    replaceCommand(objectId: string, command: Command): void {
        this.clearCommands(objectId);
        this.addCommand(objectId, command);
    }



    /**
     * Створює executor для команди
     */
    private createExecutor(objectId: string, command: Command): void {
        const context: CommandContext = {
            objectId,
            scene: this.mapLogic.scene, // SceneLogic через MapLogic
            deltaTime: 0,
            mapLogic: this.mapLogic // Додаємо доступ до MapLogic
        };

        let executor: CommandExecutor;

        switch (command.type as CommandType) {
            case 'move-to':
                executor = new MoveToExecutor(command, context);
                break;
            case 'build-road':
                executor = new BuildRoadExecutor(command, context);
                break;
            case 'collect-resource':
                executor = new CollectResourceExecutor(command, context);
                break;
            case 'unload-resources':
                executor = new UnloadResourcesExecutor(command, context);
                break;
            case 'load-resources':
                executor = new LoadResourcesExecutor(command, context);
                break;
            case 'build':
                executor = new BuildExecutor(command, context);
                break;
            case 'charge':
                executor = new ChargeExecutor(command, context);
                break;
            // Тут можна додати інші типи команд
            default:
                console.warn(`Unknown command type: ${command.type}`);
                return;
        }

        this.executors.set(objectId, executor);
        executor.updateCommandStatus('executing');
    }

    /**
     * Оновлює всі команди (викликається кожен кадр)
     */
    update(deltaTime: number): void {
        for (const [objectId, executor] of this.executors) {
            const context = executor.getContext();
            context.deltaTime = deltaTime;

            if (!executor.hasEnoughPower()) {
                executor.updateCommandStatus('failed');
                const failedCommand = executor.getCommand();
                this.removeExecutor(objectId);
                this.scheduler?.onCommandFailed(objectId, failedCommand, {
                    success: false,
                    message: 'INSUFFICIENT_POWER',
                    code: CommandFailureCode.INSUFFICIENT_POWER
                });
                continue;
            }

            executor.consumePower(deltaTime);

            const result = executor.execute();
            if (!result.success) {
                const failedCommand = executor.getCommand();
                executor.updateCommandStatus('failed');
                this.removeExecutor(objectId);
                const queue = this.commandQueues.get(objectId);
                if (queue) {
                    queue.removeCompletedCommand();
                }
                this.scheduler?.onCommandFailed(objectId, failedCommand, result);
                continue;
            }

            // console.log('RUN CMD: ', executor.getCommand().type, result, executor.completeCheck());

            if (executor.completeCheck()) {
                const completedCommand = executor.getCommand();
                executor.updateCommandStatus('completed');
                const queue = this.commandQueues.get(objectId);
                if (queue) {
                    queue.removeCompletedCommand();
                    if (queue.getLength() > 0) {
                        const nextCommand = queue.getCurrentCommand();
                        if (nextCommand) {
                            this.createExecutor(objectId, nextCommand);
                        }
                    } else {
                        this.removeExecutor(objectId);
                    }
                } else {
                    this.removeExecutor(objectId);
                }

                this.scheduler?.onCommandCompleted(objectId, completedCommand);
            }
        }
    }

    /**
     * Видаляє executor для об'єкта
     */
    private removeExecutor(objectId: string): void {
        // Очищаємо target та animationId коли executor видаляється
        const object = this.mapLogic.scene.getObjectById(objectId);
        if (object && object.data) {
            object.data.target = undefined;
            object.data.animationId = null;
        }
        
        this.executors.delete(objectId);
    }

    // Очищення target та animationId для конкретної команди
    private clearTargetForCommand(objectId: string, command: Command): void {
        if (command.type === 'move-to') {
            const object = this.mapLogic.scene.getObjectById(objectId);
            if (object && object.data) {
                object.data.target = undefined;
                object.data.animationId = null;
            }
        }
    }

    // Очищення всіх команд для об'єкта
    clearCommands(objectId: string): void {
        const queue = this.commandQueues.get(objectId);
        if (queue) {
            // Очищаємо target для всіх команд
            queue.getAllCommands().forEach(cmd => {
                if (cmd.groupId) {
                    // Якщо це команда з групи, очищаємо target
                    this.clearTargetForCommand(objectId, cmd);
                }
            });
            queue.clearAll();
        }
        
        // Видаляємо executor
        this.removeExecutor(objectId);
    }

    // Очищення команд конкретної групи для об'єкта
    clearCommandsByGroup(objectId: string, groupId: string): void {
        const queue = this.commandQueues.get(objectId);
        if (queue) {
            const commandsToRemove = queue.getAllCommands().filter(cmd => cmd.groupId === groupId);
            
            commandsToRemove.forEach(cmd => {
                // Очищаємо target для команди
                this.clearTargetForCommand(objectId, cmd);
                // Видаляємо команду з черги
                queue.removeCommand(cmd.id);
            });
        }
        
        // Якщо черга порожня, видаляємо executor
        if (queue && queue.isEmpty()) {
            this.removeExecutor(objectId);
        }
    }

    /**
     * Оновлює систему команд (викликається кожен тік)
     */
    tick(dT: number): void {
        // Оновлюємо всі активні executors
        this.executors.forEach((executor, _objectId) => {
            // Викликаємо update якщо він існує
            if ('update' in executor && typeof executor.update === 'function') {
                (executor as any).update(dT);
            }
        });
    }

    /**
     * Отримує поточну команду для об'єкта
     */
    getCurrentCommand(objectId: string): Command | null {
        const queue = this.commandQueues.get(objectId);
        return queue ? queue.getCurrentCommand() : null;
    }

    /**
     * Перевіряє чи є активні команди для об'єкта
     */
    hasActiveCommands(objectId: string): boolean {
        return this.executors.has(objectId);
    }

    /**
     * Отримує кількість активних команд
     */
    getActiveCommandsCount(): number {
        return this.executors.size;
    }

    // ==================== SaveLoadManager Implementation ====================
    
    save(): CommandSystemSaveData {
        
        const commandQueues: CommandSystemSaveData['commandQueues'] = [];
        const activeCommands: CommandSystemSaveData['activeCommands'] = [];
        
        // Збираємо дані про ВСІ черги команд
        this.commandQueues.forEach((queue, objectId) => {
            const commands = queue.getAllCommands();
            if (commands.length > 0) {
                
                // Зберігаємо всі команди в черзі з їх порядком
                commandQueues.push({
                    objectId,
                    commands: commands.map(cmd => ({
                        id: cmd.id,
                        type: cmd.type,
                        status: this.mapCommandStatus(cmd.status),
                        parameters: cmd.parameters || {},
                        progress: 0,
                        groupId: cmd.groupId,
                        resolvedParamsMapping: cmd.resolvedParamsMapping, // Зберігаємо мапінг параметрів
                        groupRestartCodes: cmd.groupRestartCodes // Зберігаємо статус коди для restart
                    }))
                });
            }
        });
        
        // Збираємо дані про активні команди
        this.executors.forEach((_executor, objectId) => {
            const currentCommand = this.getCurrentCommand(objectId);
            if (currentCommand) {
                activeCommands.push({
                    id: currentCommand.id,
                    groupId: currentCommand.groupId || '',
                    executorId: objectId,
                    status: this.mapCommandStatus(currentCommand.status) === 'pending' ? 'active' : 'paused',
                    progress: 0
                });
            }
        });
        
        const saveData = {
            commandQueues,
            activeCommands
        };
        
        return saveData;
    }
    
    load(data: CommandSystemSaveData): void {
        
        // Очищаємо поточні команди
        this.commandQueues.forEach((_queue, objectId) => {
            this.clearCommands(objectId);
        });
        
        // Завантажуємо черги команд
        if (data.commandQueues) {
            data.commandQueues.forEach(queueData => {
                const { objectId, commands } = queueData;
                
                if (!objectId || objectId === 'unknown') {
                    console.warn('[CommandSystem] Skipping queue with invalid objectId:', objectId);
                    return;
                }
                

                
                // Додаємо всі команди в чергу для цього об'єкта
                commands.forEach((command: any) => {
                    // Перевіряємо чи є тип команди валідним
                    if (this.isValidCommandType(command.type)) {
                        // Створюємо нову команду з правильними параметрами
                        const restoredCommand: Command = {
                            id: command.id,
                            type: command.type as CommandType,
                            targetId: command.targetId,
                            position: command.position || { x: 0, y: 0, z: 0 },
                            parameters: command.parameters || {},
                            status: 'pending' as CommandStatus,
                            priority: command.priority || 1,
                            createdAt: Date.now(),
                            groupId: command.groupId,
                            resolvedParamsMapping: command.resolvedParamsMapping,
                            groupRestartCodes: command.groupRestartCodes
                        };

                        this.addCommand(objectId, restoredCommand);
                    } else {
                        console.warn('[CommandSystem] Invalid command type:', command.type);
                    }
                });
            });
        }
        

    }
    
    reset(): void {
        // Очищаємо всі команди
        this.commandQueues.forEach((_queue, objectId) => {
            this.clearCommands(objectId);
        });
    }

    /**
     * Мапить статус команди з CommandStatus на статус для збереження
     */
    private mapCommandStatus(status: CommandStatus): 'pending' | 'active' | 'completed' | 'failed' {
        switch (status) {
            case 'pending':
            case 'executing':
                return 'active';
            case 'completed':
                return 'completed';
            case 'failed':
            case 'cancelled':
                return 'failed';
            default:
                return 'pending';
        }
    }

    /**
     * Перевіряє чи є тип команди валідним
     */
    private isValidCommandType(type: string): type is CommandType {
        return ['move-to', 'collect-resource', 'unload-resources', 'wait', 'attack', 'build', 'charge', 'load-resources', 'build-road'].includes(type);
    }

    // ==================== ICommandSystem Implementation ====================

    /**
     * Виконує команду (реалізація інтерфейсу)
     */
    executeCommand(command: Command): CommandResult {
        // Створюємо тимчасовий executor для виконання команди
        const context: CommandContext = {
            objectId: command.targetId || 'unknown',
            scene: this.mapLogic.scene,
            deltaTime: 0,
            mapLogic: this.mapLogic
        };

        let executor: CommandExecutor;

        switch (command.type as CommandType) {
            case 'move-to':
                executor = new MoveToExecutor(command, context);
                break;
            case 'collect-resource':
                executor = new CollectResourceExecutor(command, context);
                break;
            case 'unload-resources':
                executor = new UnloadResourcesExecutor(command, context);
                break;
            case 'load-resources':
                executor = new LoadResourcesExecutor(command, context);
                break;
            case 'build':
                executor = new BuildExecutor(command, context);
                break;
            case 'build-road':
                executor = new BuildRoadExecutor(command, context);
                break;
            case 'charge':
                executor = new ChargeExecutor(command, context);
                break;
            default:
                return { success: false, message: `Unknown command type: ${command.type}` };
        }

        return executor.execute();
    }

    /**
     * Додає команду до черги (реалізація інтерфейсу)
     */
    addCommandToQueue(command: Command, objectId: string): boolean {
        try {
            this.addCommand(objectId, command);
            return true;
        } catch (error) {
            console.error('[CommandSystem] Failed to add command to queue:', error);
            return false;
        }
    }

    /**
     * Видаляє команду з черги (реалізація інтерфейсу)
     */
    removeCommandFromQueue(commandId: string, objectId: string): boolean {
        const queue = this.commandQueues.get(objectId);
        if (!queue) return false;

        const removed = queue.removeCommand(commandId);
        if (removed && queue.getLength() === 0) {
            // Якщо черга порожня, видаляємо executor та очищаємо animationId
            const object = this.mapLogic.scene.getObjectById(objectId);
            if (object && object.data) {
                object.data.animationId = null;
            }
            this.executors.delete(objectId);
        }
        return removed;
    }

    /**
     * Вставляє команди в чергу перед вказаною командою
     */
    insertCommandsBefore(objectId: string, beforeCommandId: string, commands: Command[]): boolean {
        const queue = this.commandQueues.get(objectId);
        if (!queue) {
            console.error(`[CommandSystem] No command queue found for object ${objectId}`);
            return false;
        }

        try {
            // Використовуємо метод черги для вставки команд
            if (typeof queue.insertCommandsBefore === 'function') {
                queue.insertCommandsBefore(beforeCommandId, commands);
                console.log(`[CommandSystem] Inserted ${commands.length} commands before ${beforeCommandId} for ${objectId}`);
                return true;
            } else {
                console.error(`[CommandSystem] Queue does not support insertCommandsBefore method`);
                return false;
            }
        } catch (error) {
            console.error(`[CommandSystem] Error inserting commands:`, error);
            return false;
        }
    }

    /**
     * Вставляє команди в чергу після вказаної команди
     */
    insertCommandsAfter(objectId: string, afterCommandId: string, commands: Command[]): boolean {
        const queue = this.commandQueues.get(objectId);
        if (!queue) {
            console.error(`[CommandSystem] No command queue found for object ${objectId}`);
            return false;
        }

        try {
            // Використовуємо метод черги для вставки команд
            if (typeof queue.insertCommandsAfter === 'function') {
                queue.insertCommandsAfter(afterCommandId, commands);
                console.log(`[CommandSystem] Inserted ${commands.length} commands after ${afterCommandId} for ${objectId}`);
                return true;
            } else {
                console.error(`[CommandSystem] Queue does not support insertCommandsAfter method`);
                return false;
            }
        } catch (error) {
            console.error(`[CommandSystem] Error inserting commands:`, error);
            return false;
        }
    }

    /**
     * Отримує чергу команд для об'єкта (реалізація інтерфейсу)
     */
    getCommandQueue(objectId: string): ICommandQueue | undefined {
        return this.commandQueues.get(objectId);
    }

    /**
     * Отримує об'єкт черги команд для об'єкта
     */
    getCommandQueueObject(objectId: string): ICommandQueue | undefined {
        return this.commandQueues.get(objectId);
    }

    /**
     * Отримує всі черги команд (реалізація інтерфейсу)
     */
    getAllCommandQueues(): Map<string, ICommandQueue> {
        return new Map(this.commandQueues);
    }

    /**
     * Отримує executor для типу команди (реалізація інтерфейсу)
     */
    getCommandExecutor(commandType: string): CommandExecutor | undefined {
        // Шукаємо перший доступний executor для цього типу команди
        for (const executor of this.executors.values()) {
            // Перевіряємо тип команди через getCommand
            const command = executor.getCommand();
            if (command && command.type === commandType) {
                return executor;
            }
        }
        return undefined;
    }
}
