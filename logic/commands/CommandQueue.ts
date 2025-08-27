import { Command } from './command.types';

export class CommandQueue {
    private commands: Command[] = [];
    private currentCommandIndex: number = -1;

    /**
     * Додає команду в чергу
     */
    addCommand(command: Command): void {
        this.commands.push(command);
        // Якщо черга порожня або поточна команда завершена, додаємо в кінець
        if (this.currentCommandIndex === -1) {
            
            this.currentCommandIndex = 0;
        }
    }

    /**
     * Додає команду з пріоритетом (вища пріоритетність = менший номер)
     */
    addPriorityCommand(command: Command): void {
        // Сортуємо за пріоритетом
        this.commands.push(command);
        this.commands.sort((a, b) => a.priority - b.priority);
        
        // Якщо це перша команда, встановлюємо її як поточну
        if (this.commands.length === 1) {
            this.currentCommandIndex = 0;
        }
    }

    /**
     * Додає команду в початок черги (високий пріоритет)
     */
    addCommandToFront(command: Command): void {
        // Додаємо команду в початок масиву
        this.commands.unshift(command);
        
        // Якщо це перша команда, встановлюємо її як поточну
        if (this.commands.length === 1) {
            this.currentCommandIndex = 0;
        } else {
            // Збільшуємо індекс поточної команди, оскільки додали команду в початок
            this.currentCommandIndex++;
        }
        
        // Команда додана в початок черги
    }

    /**
     * Отримує поточну команду
     */
    getCurrentCommand(): Command | null {
        if (this.currentCommandIndex >= 0 && this.currentCommandIndex < this.commands.length) {
            return this.commands[this.currentCommandIndex];
        }
        return null;
    }

    /**
     * Переходить до наступної команди
     */
    nextCommand(): Command | null {
        if (this.currentCommandIndex < this.commands.length - 1) {
            this.currentCommandIndex++;
            return this.getCurrentCommand();
        }
        
        // Черга завершена
        return null;
    }

    /**
     * Очищає чергу команд
     */
    clear(): void {
        this.commands = [];
        this.currentCommandIndex = -1;
    }

    /**
     * Очищає всі команди (alias для clear)
     */
    clearAll(): void {
        this.clear();
    }

    /**
     * Видаляє команду по ID
     */
    removeCommand(commandId: string): boolean {
        const index = this.commands.findIndex(cmd => cmd.id === commandId);
        if (index !== -1) {
            this.commands.splice(index, 1);
            
            // Коригуємо індекс поточної команди
            if (this.commands.length === 0) {
                this.currentCommandIndex = -1;
            } else if (index <= this.currentCommandIndex) {
                this.currentCommandIndex = Math.max(0, this.currentCommandIndex - 1);
            }
            return true;
        }
        return false;
    }

    /**
     * Очищає всі команди після поточної
     */
    clearAfterCurrent(): void {
        if (this.currentCommandIndex >= 0) {
            this.commands = this.commands.slice(0, this.currentCommandIndex + 1);
        }
    }

    /**
     * Отримує всі команди в черзі
     */
    getAllCommands(): Command[] {
        return [...this.commands];
    }

    /**
     * Отримує кількість команд в черзі
     */
    getLength(): number {
        return this.commands.length;
    }

    /**
     * Перевіряє чи черга порожня
     */
    isEmpty(): boolean {
        return this.commands.length === 0;
    }

    /**
     * Перевіряє чи є поточна команда
     */
    hasCurrentCommand(): boolean {
        return this.currentCommandIndex >= 0 && this.currentCommandIndex < this.commands.length;
    }

    /**
     * Отримує індекс поточної команди
     */
    getCurrentIndex(): number {
        return this.currentCommandIndex;
    }

    /**
     * Скидає індекс поточної команди для додавання нових команд
     */
    resetIndex(): void {
        this.currentCommandIndex = -1;
    }

    /**
     * Видаляє завершену команду з черги
     */
    removeCompletedCommand(): void {
        if (this.currentCommandIndex >= 0 && this.currentCommandIndex < this.commands.length) {
            // Видаляємо завершену команду
            this.commands.splice(this.currentCommandIndex, 1);
            
            // Якщо черга порожня, скидаємо індекс
            if (this.commands.length === 0) {
                this.currentCommandIndex = -1;
            } else if (this.currentCommandIndex >= this.commands.length) {
                // Якщо індекс виходить за межі, встановлюємо на останню команду
                this.currentCommandIndex = this.commands.length - 1;
            }
            // Інакше індекс залишається на тій же позиції (наступна команда)
        }
    }
}
