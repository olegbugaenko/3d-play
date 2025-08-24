import { Command, CommandType, CommandContext } from './command.types';
import { CommandExecutor } from './CommandExecutor';
import { MoveToExecutor } from './MoveToExecutor';
import { CommandQueue } from './CommandQueue';

export class CommandSystem {
    private commandQueues: Map<string, CommandQueue> = new Map();
    private executors: Map<string, CommandExecutor> = new Map();
    private scene: any;

    constructor(scene: any) {
        this.scene = scene;
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
            scene: this.scene,
            deltaTime: 0
        };

        let executor: CommandExecutor;

        switch (command.type as CommandType) {
            case 'move-to':
                executor = new MoveToExecutor(command, context);
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

            // Виконуємо команду
            const result = executor.execute();

            if (!result.success) {
                console.warn(`Command execution failed for ${objectId}: ${result.message}`);
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
     * Видаляє executor для об'єкта
     */
    private removeExecutor(objectId: string): void {
        // Очищаємо target коли executor видаляється
        const object = this.scene.getObjectById(objectId);
        if (object && object.data) {
            object.data.target = undefined;
        }
        
        this.executors.delete(objectId);
    }

    /**
     * Очищає всі команди для об'єкта
     */
    clearCommands(objectId: string): void {
        // Очищаємо target коли всі команди очищаються
        const object = this.scene.getObjectById(objectId);
        if (object && object.data) {
            object.data.target = undefined;
        }
        
        this.commandQueues.delete(objectId);
        this.removeExecutor(objectId);
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
