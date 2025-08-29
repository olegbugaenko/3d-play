import { Command } from '@systems/commands/command.types';

/**
 * Інтерфейс для черги команд
 * Відповідає за управління чергою команд для одного об'єкта
 */
export interface ICommandQueue {
    /**
     * Додає команду в чергу
     */
    addCommand(command: Command): void;

    /**
     * Додає команду з пріоритетом (вища пріоритетність = менший номер)
     */
    addPriorityCommand(command: Command): void;

    /**
     * Додає команду в початок черги (високий пріоритет)
     */
    addCommandToFront(command: Command): void;

    /**
     * Отримує поточну команду
     */
    getCurrentCommand(): Command | null;

    /**
     * Переходить до наступної команди
     */
    nextCommand(): Command | null;

    /**
     * Очищає чергу команд
     */
    clear(): void;

    /**
     * Очищає всі команди (alias для clear)
     */
    clearAll(): void;

    /**
     * Видаляє команду по ID
     */
    removeCommand(commandId: string): boolean;

    /**
     * Очищає всі команди після поточної
     */
    clearAfterCurrent(): void;

    /**
     * Отримує всі команди в черзі
     */
    getAllCommands(): Command[];

    /**
     * Отримує кількість команд в черзі
     */
    getLength(): number;

    /**
     * Перевіряє чи черга порожня
     */
    isEmpty(): boolean;

    /**
     * Перевіряє чи є поточна команда
     */
    hasCurrentCommand(): boolean;

    /**
     * Отримує індекс поточної команди
     */
    getCurrentIndex(): number;

    /**
     * Скидає індекс поточної команди для додавання нових команд
     */
    resetIndex(): void;

    /**
     * Видаляє завершену команду з черги
     */
    removeCompletedCommand(): void;
}
