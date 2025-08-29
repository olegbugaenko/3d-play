import { Command, CommandType, CommandContext, CommandStatus, CommandFailureCode, CommandResult } from './command.types';
import { CommandExecutor } from './CommandExecutor';
import { MoveToExecutor, CollectResourceExecutor, UnloadResourcesExecutor, ChargeExecutor } from './executors';
import { CommandQueue } from './CommandQueue';
import { ICommandQueue } from '@interfaces/ICommandQueue';
import { SaveLoadManager, CommandSystemSaveData } from '../save-load/save-load.types';
import { ICommandSystem, IMapLogic } from '@interfaces/index';

export class CommandSystem implements SaveLoadManager, ICommandSystem {
    private commandQueues: Map<string, ICommandQueue> = new Map();
    private executors: Map<string, CommandExecutor> = new Map();
    private mapLogic: IMapLogic;

    constructor(mapLogic: IMapLogic) {
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

        console.log('AddCommand: ', objectId, command, this.commandQueues);

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
                console.warn(`Command execution failed for ${objectId}: ${result.message} [${result.code}]`);
                
                // Перевіряємо чи потрібно restart групи на основі коду фейлу
                const command = executor.getCommand();
                if(result.code === CommandFailureCode.OBJECT_STUCK) {
                    console.warn(`Stuck with following pipeline: `, this.commandQueues.get(objectId), executor.getContext());
                }
                if (result.code && command.groupId && command.groupRestartCodes?.includes(result.code)) {
                    console.warn('Restarting group', command.groupId, command);
                    // Спробуємо restart групи
                    const restartSuccess = this.restartCommandGroup(objectId, command.groupId);
                    if (restartSuccess) {
                        continue;
                    } else {
                        console.warn(`Failed to restart command group ${command.groupId}, marking as failed`);
                    }
                }
                
                executor.updateCommandStatus('failed');
                this.removeExecutor(objectId);
                continue;
            }

            // Перевіряємо чи завершена команда
            if (executor.completeCheck()) {
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
                                // Команда дубльована для циклічної групи
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
    private resolveCommandParameters(command: Command, objectId: string, persistContextResolved: boolean = false): void {
        if (!command.groupId || !command.parameterTemplates) {
            console.log('[CommandSystem] Skipping parameter resolution - no groupId or parameterTemplates:', { groupId: command.groupId, hasTemplates: !!command.parameterTemplates });
            return;
        }

        console.log('[CommandSystem] Resolving parameters for command:', command.id, 'with templates:', command.parameterTemplates);

        // Отримуємо стан групи
        const groupState = this.mapLogic.commandGroupSystem?.getGroupState(objectId, command.groupId);
        if (!groupState) {
            console.warn('[CommandSystem] Group state not found for:', objectId, command.groupId, this.mapLogic.commandGroupSystem?.activeGroups);
            return;
        }

        // Отримуємо визначення групи
        const groupDefinition = this.mapLogic.commandGroupSystem?.getCommandGroupDefinition(command.groupId);
        if (!groupDefinition?.resolveParametersPipeline) {
            console.warn('[CommandSystem] Group definition or resolveParametersPipeline not found for:', command.groupId);
            return;
        }

        console.log('[CommandSystem] Resolving parameters with pipeline:', groupDefinition.resolveParametersPipeline, groupState.context);

        // Розв'язуємо параметри перед командою
        const resolvedParameters = this.mapLogic.commandGroupSystem?.parameterResolutionService?.resolveParameters(
            groupDefinition.resolveParametersPipeline,
            groupState.context,
            'before-command'
        );

        console.log('[CommandSystem] Resolved parameters:', resolvedParameters, groupDefinition.resolveParametersPipeline);

        if (resolvedParameters) {
            let resolvedParamsToApply = resolvedParameters;
            if(persistContextResolved && groupState.context.resolved) {
                resolvedParamsToApply = {
                    ...groupState.context.resolved,
                    ...resolvedParamsToApply
                }
            }
            // Застосовуємо розв'язані параметри до команди
            this.applyResolvedParameters(command, resolvedParamsToApply);
            console.log('[CommandSystem] Applied resolved parameters to command:', command.id, 'position:', command.position, 'targetId:', command.targetId);
        }
    }

    /**
     * Генерує parameterTemplates для команди на основі визначення групи
     */
    private generateParameterTemplatesForCommand(command: Command, _objectId: string): void {
        if (!command.groupId) {
            return;
        }

        // Отримуємо визначення групи
        const groupDefinition = this.mapLogic.commandGroupSystem?.getCommandGroupDefinition(command.groupId);
        if (!groupDefinition?.resolveParametersPipeline) {
            return;
        }

        // Використовуємо існуючий метод з CommandGroupSystem замість дублювання
        command.parameterTemplates = this.mapLogic.commandGroupSystem.createParameterTemplates(
            command, 
            groupDefinition.resolveParametersPipeline
        );
        
        console.log('[CommandSystem] Generated parameterTemplates for command:', command.id, ':', command.parameterTemplates);
    }

    /**
     * Застосовує розв'язані параметри до команди
     */
    private applyResolvedParameters(command: Command, resolvedParameters: Record<string, any> | undefined): void {
        if (!command.parameterTemplates) {
            console.log('[CommandSystem] No parameterTemplates to apply');
            return;
        }

        if(!resolvedParameters) {
            console.log('[CommandSystem] No resolvedParameters to apply');
            return;
        }

        console.log('[CommandSystem] Applying resolved parameters:', resolvedParameters, 'to command:', command.id);

        // Застосовуємо position
        if (command.parameterTemplates.position && resolvedParameters[command.parameterTemplates.position.parameterId]) {
            const value = resolvedParameters[command.parameterTemplates.position.parameterId];
            if (value && typeof value === 'object' && value.x !== undefined) {
                command.position = { x: value.x, y: value.y, z: value.z };
                console.log('[CommandSystem] Applied position:', command.position);
            }
        }

        // Застосовуємо targetId
        if (command.parameterTemplates.targetId && resolvedParameters[command.parameterTemplates.targetId.parameterId]) {
            const value = resolvedParameters[command.parameterTemplates.targetId.parameterId];
            command.targetId = value?.id || value;
            console.log('[CommandSystem] Applied targetId:', command.targetId);
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

    /**
     * Перезапускає групу команд з новими параметрами
     */
    private restartCommandGroup(objectId: string, groupId: string): boolean {
        try {
            // Отримуємо стан групи
            const groupState = this.mapLogic?.commandGroupSystem?.getGroupState(objectId, groupId);
            if (!groupState) {
                console.warn(`Group state not found for ${groupId} on ${objectId}`);
                return false;
            }

            // Отримуємо визначення групи
            const groupDefinition = this.mapLogic?.commandGroupSystem?.getCommandGroupDefinition(groupId);
            if (!groupDefinition) {
                console.warn(`Group definition not found for ${groupId}`);
                return false;
            }

            // Очищаємо поточні команди цієї групи
            this.clearCommandsByGroup(objectId, groupId);

            // Перезапускаємо групу з новим контекстом
            const restartSuccess = this.mapLogic?.commandGroupSystem?.addCommandGroup(
                objectId,
                groupId,
                groupState.context
            );

            if (restartSuccess) {
                return true;
            } else {
                console.warn(`Failed to restart command group ${groupId} for ${objectId}`);
                return false;
            }
        } catch (error) {
            console.error(`Error restarting command group ${groupId} for ${objectId}:`, error);
            return false;
        }
    }

    // ==================== SaveLoadManager Implementation ====================
    
    save(): CommandSystemSaveData {
        console.log('[CommandSystem] Saving commands...', this.commandQueues);
        
        const commandQueues: CommandSystemSaveData['commandQueues'] = [];
        const activeCommands: CommandSystemSaveData['activeCommands'] = [];
        
        // Збираємо дані про ВСІ черги команд
        this.commandQueues.forEach((queue, objectId) => {
            const commands = queue.getAllCommands();
            if (commands.length > 0) {
                console.log('[CommandSystem] Saving queue for', objectId, 'with', commands.length, 'commands');
                
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
        console.log('[CommandSystem] Loading commands:', data);
        
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
                
                console.log('[CommandSystem] Loading queue for object:', objectId, 'with', commands.length, 'commands');
                
                // Додаємо всі команди в чергу для цього об'єкта
                commands.forEach((command: any) => {
                    // Перевіряємо чи є тип команди валідним
                    if (this.isValidCommandType(command.type)) {
                        // Створюємо нову команду з правильними параметрами
                        const restoredCommand: Command = {
                            id: command.id,
                            type: command.type as CommandType,
                            targetId: undefined,
                            position: { x: 0, y: 0, z: 0 }, // Буде оновлено під час виконання
                            parameters: command.parameters || {},
                            status: 'pending' as CommandStatus,
                            priority: 1,
                            createdAt: Date.now(),
                            groupId: command.groupId,
                            resolvedParamsMapping: command.resolvedParamsMapping, // Відновлюємо мапінг параметрів
                            groupRestartCodes: command.groupRestartCodes // Відновлюємо статус коди для restart
                        };
                        
                        // Якщо команда має groupId - генеруємо parameterTemplates та резолвимо параметри
                        if (restoredCommand.groupId) {
                            console.log('[CommandSystem] Command has groupId, generating templates and resolving parameters:', restoredCommand.groupId, {
                                resolvedParamsMapping: restoredCommand.resolvedParamsMapping,
                                groupRestartCodes: restoredCommand.groupRestartCodes
                            });
                            
                            // Генеруємо parameterTemplates на основі збереженого resolvedParamsMapping
                            this.generateParameterTemplatesForCommand(restoredCommand, objectId);
                            
                            // Резолвимо параметри
                            this.resolveCommandParameters(restoredCommand, objectId, true);
                        }
                        
                        this.addCommand(objectId, restoredCommand);
                    } else {
                        console.warn('[CommandSystem] Invalid command type:', command.type);
                    }
                });
            });
        }
        
        console.log('[CommandSystem] Loaded commands. Current queues:', this.commandQueues);
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
        return ['move-to', 'collect-resource', 'unload-resources', 'wait', 'attack', 'build', 'charge'].includes(type);
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
            // Якщо черга порожня, видаляємо executor
            this.executors.delete(objectId);
        }
        return removed;
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
