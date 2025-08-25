import { Command, CommandType, CommandContext } from './command.types';
import { CommandExecutor } from './CommandExecutor';
import { MoveToExecutor, CollectResourceExecutor, UnloadResourcesExecutor, ChargeExecutor } from './executors';
import { CommandQueue } from './CommandQueue';

export class CommandSystem {
    private commandQueues: Map<string, CommandQueue> = new Map();
    private executors: Map<string, CommandExecutor> = new Map();
    private mapLogic: any; // MapLogic instance

    constructor(mapLogic: any) {
        this.mapLogic = mapLogic;
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
    addAutoresolveCommand(objectId: string, command: Command, resolved: Record<string, any> | undefined): void {
        this.applyResolvedParameters(command, resolved);
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
        // Розв'язуємо динамічні параметри перед створенням executor
        if (command.groupId && command.parameterTemplates) {
            console.log('PARAMETRIC COMMAND PASSED');
            this.resolveCommandParameters(command, objectId);
        }

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
            case 'collect-resource':
                executor = new CollectResourceExecutor(command, context);
                break;
            case 'unload-resources':
                executor = new UnloadResourcesExecutor(command, context);
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
        // Оновлюємо всі активні executors
        for (const [objectId, executor] of this.executors) {
            const context = executor.getContext();
            context.deltaTime = deltaTime;

            // Перевіряємо чи достатньо power для виконання команди
            if (!executor.hasEnoughPower()) {
                console.warn(`Insufficient power for command execution on ${objectId}`);
                executor.updateCommandStatus('failed');
                this.removeExecutor(objectId);
                continue;
            }

            // Споживаємо power під час виконання команди
            executor.consumePower(deltaTime);

            // Виконуємо команду
            const result = executor.execute();

            if (!result.success) {
                console.warn(`Command execution failed for ${objectId}: ${result.message}`);
                executor.updateCommandStatus('failed');
                this.removeExecutor(objectId);
                continue;
            }

            console.log(`Starting command: ${executor.getCommand().id}`);

            // Перевіряємо чи завершена команда
            if (executor.completeCheck()) {
                console.log(`Command ${executor.getCommand().id} finished`);
                executor.updateCommandStatus('completed');
                
                // Отримуємо чергу команд
                const queue = this.commandQueues.get(objectId);
                if (queue) {
                    // Перевіряємо чи це команда з групи та чи має група isLoop
                    const completedCommand = executor.getCommand();
                    if (completedCommand.groupId) {
                        const group = this.mapLogic.commandGroupSystem?.getGroupState(objectId, completedCommand.groupId);
                        if (group) {
                            const groupDefinition = this.mapLogic.commandGroupSystem?.getCommandGroupDefinition(completedCommand.groupId);
                            if (groupDefinition?.isLoop) {
                                // Дублюємо завершену команду в кінець черги
                                const duplicatedCommand = this.duplicateCommandForLoop(completedCommand);
                                queue.addCommand(duplicatedCommand);
                                console.log(`Command ${completedCommand.id} duplicated for loop group ${completedCommand.groupId}`);
                            }
                        }
                    }
                    
                    // Видаляємо завершену команду з черги
                    queue.removeCompletedCommand();
                    
                    // Перевіряємо чи є ще команди
                    if (queue.getLength() > 0) {
                        // Створюємо новий executor для наступної команди
                        const nextCommand = queue.getCurrentCommand();
                        if (nextCommand) {
                            this.createExecutor(objectId, nextCommand);
                        }
                    } else {
                        // Черга порожня - видаляємо executor
                        this.removeExecutor(objectId);
                    }
                } else {
                    // Черга не знайдена - видаляємо executor
                    this.removeExecutor(objectId);
                }
            }
        }
    }

    /**
     * Дублює команду для циклічного повторення
     */
    private duplicateCommandForLoop(command: Command): Command {
        const duplicatedCommand: Command = {
            ...command,
            id: `${command.id}_loop_${Date.now()}`,
            status: 'pending' as const,
            createdAt: Date.now()
        };

        // Якщо команда має шаблони параметрів - перерозв'язуємо
        if (duplicatedCommand.groupId && duplicatedCommand.parameterTemplates) {
            // Отримуємо objectId з контексту команди
            const objectId = this.getObjectIdFromCommand(command);
            if (objectId) {
                this.resolveCommandParameters(duplicatedCommand, objectId);
            }
        }

        return duplicatedCommand;
    }

    /**
     * Отримує objectId з команди (через контекст executor)
     */
    private getObjectIdFromCommand(command: Command): string | null {
        // Шукаємо executor для цієєї команди
        for (const [objectId, executor] of this.executors) {
            if (executor.getCommand().id === command.id) {
                return objectId;
            }
        }
        return null;
    }

    /**
     * Розв'язує динамічні параметри команди
     */
    private resolveCommandParameters(command: Command, objectId: string): void {
        if (!command.groupId || !command.parameterTemplates) {
            return;
        }

        // Отримуємо стан групи
        const groupState = this.mapLogic.commandGroupSystem?.getGroupState(objectId, command.groupId);
        if (!groupState) {
            return;
        }

        // Отримуємо визначення групи
        const groupDefinition = this.mapLogic.commandGroupSystem?.getCommandGroupDefinition(command.groupId);
        if (!groupDefinition?.resolveParametersPipeline) {
            return;
        }

        // Розв'язуємо параметри перед командою
        const resolvedParameters = this.mapLogic.commandGroupSystem?.parameterResolutionService?.resolveParameters(
            groupDefinition.resolveParametersPipeline,
            groupState.context,
            'before-command'
        );

        console.log(`PARAMS_RESOLVED: `, resolvedParameters, command);

        if (resolvedParameters) {
            // Застосовуємо розв'язані параметри до команди
            this.applyResolvedParameters(command, resolvedParameters);
        }
    }

    /**
     * Застосовує розв'язані параметри до команди
     */
    private applyResolvedParameters(command: Command, resolvedParameters: Record<string, any> | undefined): void {
        if (!command.parameterTemplates) {
            return;
        }

        if(!resolvedParameters) {
            return;
        }

        // Застосовуємо position
        if (command.parameterTemplates.position && resolvedParameters[command.parameterTemplates.position.parameterId]) {
            const value = resolvedParameters[command.parameterTemplates.position.parameterId];
            if (value && typeof value === 'object' && value.x !== undefined) {
                command.position = { x: value.x, y: value.y, z: value.z };
            }
        }

        // Застосовуємо targetId
        if (command.parameterTemplates.targetId && resolvedParameters[command.parameterTemplates.targetId.parameterId]) {
            const value = resolvedParameters[command.parameterTemplates.targetId.parameterId];
            command.targetId = value?.id || value;
        }
    }

    /**
     * Видаляє executor для об'єкта
     */
    private removeExecutor(objectId: string): void {
        // Очищаємо target коли executor видаляється
        const object = this.mapLogic.scene.getObjectById(objectId);
        if (object && object.data) {
            object.data.target = undefined;
        }
        
        this.executors.delete(objectId);
    }

    // Очищення target для конкретної команди
    private clearTargetForCommand(objectId: string, command: Command): void {
        if (command.type === 'move-to') {
            const object = this.mapLogic.scene.getObjectById(objectId);
            if (object && object.data) {
                object.data.target = undefined;
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
     * Отримує чергу команд для об'єкта
     */
    getCommandQueue(objectId: string): CommandQueue | undefined {
        return this.commandQueues.get(objectId);
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
}
