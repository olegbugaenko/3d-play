import { Command, CommandResult, CommandContext } from './command.types';

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
}
