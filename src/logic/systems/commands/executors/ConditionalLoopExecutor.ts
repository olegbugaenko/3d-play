import { CommandExecutor } from '../CommandExecutor';
import { CommandResult, Command } from '../command.types';

export class ConditionalLoopExecutor extends CommandExecutor {
    private loopCommands: Command[] = [];
    private maxIterations: number = 10; // Максимальна кількість ітерацій циклу

    getEnergyUpkeep() {
        return 0.0; // Мінімальне споживання енергії для логічних операцій
    }

    canExecute(): boolean {
        // ConditionalLoop завжди може виконуватися
        return true;
    }

    execute(): CommandResult {
        // Отримуємо універсальні параметри умови
        const value1 = this.command.parameters?.value1; // З resolved параметрів
        const condition = this.command.parameters?.condition; // Оператор порівняння
        const value2 = this.command.parameters?.value2; // Значення для порівняння


        // Перевіряємо ліміт ітерацій
        const iterationCount = this.getIterationCount();
        if (iterationCount >= this.maxIterations) {
            return { 
                success: true, 
                message: `Max iterations reached, proceeding to next commands`,
                data: { loopComplete: true, maxIterationsReached: true }
            };
        }

        // Якщо умова не спрацювала - завершуємо цикл
        if (!this.evaluateCondition(value1, condition, value2)) {
            return { 
                success: true, 
                message: 'Loop condition false, proceeding to next commands',
                data: { loopComplete: true }
            };
        }

        // Якщо умова true - вставляємо команди циклу та ре-інсертимо себе для наступної перевірки
        this.insertLoopCommands();
        
        // Ре-інсертимо поточну команду для наступної перевірки умови
        this.reinsertSelfForNextCheck();
        
        
        return { 
            success: true, 
            message: `Inserted ${this.loopCommands.length} loop commands, re-inserted self for next check (iteration ${iterationCount + 1})`,
            data: { loopContinue: true, commandsInserted: this.loopCommands.length, selfReinserted: true, iteration: iterationCount + 1 }
        };
    }

    completeCheck(): boolean {
        return true;
        
        const value1 = this.command.parameters?.value1; // З resolved параметрів
        const condition = this.command.parameters?.condition; // Оператор порівняння
        const value2 = this.command.parameters?.value2; // Значення для порівняння

        // ConditionalLoop завжди завершується одразу - вона не блокує чергу
        // Цикл досягається через ре-інсертинг команди в execute()
        return !this.evaluateCondition(value1, condition, value2);
    }

    // ========== Helper Methods ==========

    /**
     * Універсальна оцінка умови: value1 condition value2
     */
    private evaluateCondition(value1: any, condition: string, value2: any): boolean {
        if (value1 === undefined || condition === undefined || value2 === undefined) {
            console.warn(`[ConditionalLoopExecutor] Missing condition parameters:`, { value1, condition, value2 });
            return false;
        }

        // Конвертуємо value1 в число якщо це об'єкт (наприклад, сума ресурсів)
        let numValue1: number;
        if (typeof value1 === 'object' && value1 !== null) {
            // Якщо це об'єкт ресурсів - обчислюємо суму
            numValue1 = Object.values(value1).reduce((sum: number, val: any) => {
                return sum + (typeof val === 'number' ? val : 0);
            }, 0);
        } else {
            numValue1 = Number(value1);
        }

        const numValue2 = Number(value2);


        // Виконуємо порівняння
        switch (condition) {
            case '>':
                return numValue1 > numValue2;
            case '>=':
                return numValue1 >= numValue2;
            case '<':
                return numValue1 < numValue2;
            case '<=':
                return numValue1 <= numValue2;
            case '==':
            case '===':
                return numValue1 === numValue2;
            case '!=':
            case '!==':
                return numValue1 !== numValue2;
            default:
                console.warn(`[ConditionalLoopExecutor] Unknown condition operator: ${condition}`);
                return false;
        }
    }

    /**
     * Обчислює кількість ітерацій циклу на основі ID команди
     */
    private getIterationCount(): number {
        // Рахуємо кількість "_check_" в ID команди
        const checkMatches = this.command.id.match(/_check_/g);
        return checkMatches ? checkMatches.length : 0;
    }

    /**
     * Ре-інсертимо поточну команду для наступної перевірки умови
     */
    private reinsertSelfForNextCheck(): void {
        const commandSystem = this.context.mapLogic?.commandSystem;
        if (!commandSystem) {
            console.error(`[ConditionalLoopExecutor] CommandSystem not found in context`);
            return;
        }

        // Отримуємо доступ до CommandGroupSystem для створення parameterTemplates
        const commandGroupSystem = this.context.mapLogic?.commandGroupSystem;
        if (!commandGroupSystem) {
            console.error(`[ConditionalLoopExecutor] CommandGroupSystem not found in context for reinsert`);
            return;
        }

        // Отримуємо групу команд для доступу до resolveParametersPipeline
        const group = commandGroupSystem.getCommandGroup(this.command.groupId!);
        if (!group || !group.resolveParametersPipeline) {
            console.error(`[ConditionalLoopExecutor] Command group or resolveParametersPipeline not found for reinsert`);
            return;
        }

        // Створюємо копію поточної команди з новим ID
        const reinsertedCommand = {
            ...this.command,
            id: `${this.command.id}_check_${Date.now()}`,
            status: 'pending' as const,
            createdAt: Date.now(),
            // Копіюємо resolvedParamsMapping
            resolvedParamsMapping: this.command.resolvedParamsMapping,
            // Копіюємо всі resolved параметри
            parameters: {
                ...this.command.parameters
            }
        };

        // Створюємо parameterTemplates для ре-інсертованої команди
        reinsertedCommand.parameterTemplates = commandGroupSystem.createParameterTemplates(reinsertedCommand, group.resolveParametersPipeline);

        // Вставляємо команду ПІСЛЯ останньої команди циклу (якщо є команди циклу)
        // Або після поточної команди (якщо команд циклу немає)
        const targetCommandId = this.loopCommands && this.loopCommands.length > 0 
            ? this.loopCommands[this.loopCommands.length - 1].id 
            : this.command.id;
            
        const success = commandSystem.insertCommandsAfter(
            this.context.objectId,
            targetCommandId,
            [reinsertedCommand]
        );

        if (success) {
            // Резолвимо параметри для ре-інсертованої команди
            if (reinsertedCommand.groupId) {
                commandSystem.resolveCommandParameters(reinsertedCommand, this.context.objectId, true);
            }
        } else {
            console.error(`[ConditionalLoopExecutor] Failed to re-insert self for next check`);
        }
    }

    /**
     * Вставляє команди циклу в чергу команд дрона ПЕРЕД поточною командою
     */
    private insertLoopCommands(): void {
        const loopCommands = this.command.parameters?.loopCommands;
        if (!loopCommands || !Array.isArray(loopCommands)) {
            console.warn(`[ConditionalLoopExecutor] No loop commands provided`);
            return;
        }

        // Отримуємо доступ до CommandSystem через context
        const commandSystem = this.context.mapLogic?.commandSystem;
        if (!commandSystem) {
            console.error(`[ConditionalLoopExecutor] CommandSystem not found in context`);
            return;
        }

        // Отримуємо доступ до CommandGroupSystem для створення parameterTemplates
        const commandGroupSystem = this.context.mapLogic?.commandGroupSystem;
        if (!commandGroupSystem) {
            console.error(`[ConditionalLoopExecutor] CommandGroupSystem not found in context`);
            return;
        }

        // Отримуємо групу команд для доступу до resolveParametersPipeline
        const group = commandGroupSystem.getCommandGroup(this.command.groupId!);
        if (!group || !group.resolveParametersPipeline) {
            console.error(`[ConditionalLoopExecutor] Command group or resolveParametersPipeline not found`);
            return;
        }

        // Створюємо копії команд циклу з унікальними ID
        this.loopCommands = loopCommands.map((templateCmd: any, index: number) => {
            const newCommand: Command = {
                ...templateCmd,
                id: `${this.command.id}_loop_${Date.now()}_${index}`,
                status: 'pending' as const,
                createdAt: Date.now(),
                groupId: this.command.groupId, // Зберігаємо groupId
                // Копіюємо resolvedParamsMapping з оригінальної команди
                resolvedParamsMapping: templateCmd.resolvedParamsMapping,
                // Копіюємо resolved параметри з поточної команди
                parameters: {
                    ...templateCmd.parameters,
                    // Прокидаємо resolved параметри які можуть знадобитися
                    closestStorageId: this.command.parameters?.closestStorageId,
                    requiredResources: this.command.parameters?.requiredResources,
                    missingResources: this.command.parameters?.missingResources,
                    buildingInstance: this.command.parameters?.buildingInstance
                }
            };

            // Створюємо parameterTemplates для команди
            newCommand.parameterTemplates = commandGroupSystem.createParameterTemplates(newCommand, group.resolveParametersPipeline);
            
            return newCommand;
        });

        // Вставляємо команди в чергу ПІСЛЯ поточної команди
        try {
            commandSystem.insertCommandsAfter(this.context.objectId, this.command.id, this.loopCommands);
            
            // Важливо: резолвимо параметри для вставлених команд
            for (const loopCommand of this.loopCommands) {
                if (loopCommand.groupId) {
                    commandSystem.resolveCommandParameters(loopCommand, this.context.objectId, true);
                }
            }
            
        } catch (error) {
            console.error(`[ConditionalLoopExecutor] Error inserting loop commands:`, error);
        }
    }
}
