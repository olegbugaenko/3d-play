import { CommandSystem } from './CommandSystem';
import { Command } from './command.types';
import { CommandGroup, CommandGroupContext, CommandGroupState } from './command-group.types';
import { getCommandGroup } from './db/command-groups-db';
import { ParameterResolutionService } from './ParameterResolutionService';

export class CommandGroupSystem {
  private commandSystem: CommandSystem;
  private activeGroups: Map<string, CommandGroupState> = new Map();
  public parameterResolutionService: ParameterResolutionService;

  constructor(commandSystem: CommandSystem, mapLogic: any) {
    this.commandSystem = commandSystem;
    this.parameterResolutionService = new ParameterResolutionService(mapLogic);
  }

  // Запуск групи команд
  addCommandGroup(
    objectId: string,
    groupId: string,
    context: CommandGroupContext
  ): boolean {
    const group = getCommandGroup(groupId);
    if (!group) {
      console.error(`Command group '${groupId}' not found`);
      return false;
    }

    // Перевіряємо startCondition якщо є
    if (group.startCondition && !group.startCondition(context)) {
      console.error(`Start condition failed for group '${groupId}'`);
      return false;
    }

    // Розв'язуємо параметри на початку групи
    let resolvedParameters: Record<string, any> = {};
    if (group.resolveParametersPipeline) {
      resolvedParameters = this.parameterResolutionService.resolveParameters(
        group.resolveParametersPipeline,
        context,
        'all'
      );
    }

    // Генеруємо команди з пайплайну
    const commands = group.tasksPipeline({
      ...context,
      resolved: resolvedParameters
    });
    
    // Додаємо groupId та resolvedParameters до кожної команди
    commands.forEach(cmd => {
      cmd.groupId = groupId;
      
      // Додаємо шаблони параметрів для динамічної резолюції
      if (group.resolveParametersPipeline) {
        cmd.parameterTemplates = this.createParameterTemplates(cmd, group.resolveParametersPipeline);
      }
    });

    // Додаємо команди до черги об'єкта
    commands.forEach(cmd => {
      this.commandSystem.addAutoresolveCommand(objectId, cmd, context.resolved);
    });

    // Створюємо стан групи
    const groupState: CommandGroupState = {
      groupId,
      objectId,
      status: 'active',
      currentTaskIndex: 0,
      startTime: Date.now(),
      context,
      resolvedParameters
    };

    const groupKey = `${objectId}-${groupId}`;
    this.activeGroups.set(groupKey, groupState);

    console.log(`Command group '${groupId}' started for object ${objectId}`, this.commandSystem.getCommandQueue(objectId));
    return true;
  }

  // Зупинка групи команд
  cancelCommandGroup(objectId: string, groupId: string): boolean {
    const groupKey = `${objectId}-${groupId}`;
    const groupState = this.activeGroups.get(groupKey);
    
    if (!groupState) {
      console.error(`Command group '${groupId}' not found for object ${objectId}`);
      return false;
    }

    // Змінюємо статус на cancelled
    groupState.status = 'cancelled';
    
    // Видаляємо всі команди цієї групи з черги
    this.commandSystem.clearCommandsByGroup(objectId, groupId);

    console.log(`Command group '${groupId}' cancelled for object ${objectId}`);
    return true;
  }

  // Отримання стану групи
  getGroupState(objectId: string, groupId: string): CommandGroupState | undefined {
    const groupKey = `${objectId}-${groupId}`;
    return this.activeGroups.get(groupKey);
  }

  // Отримання всіх активних груп для об'єкта
  getActiveGroupsForObject(objectId: string): CommandGroupState[] {
    return Array.from(this.activeGroups.values())
      .filter(state => state.objectId === objectId && state.status === 'active');
  }

  // Отримання визначення групи команд
  getCommandGroupDefinition(groupId: string): CommandGroup | undefined {
    return getCommandGroup(groupId);
  }

  /**
   * Створює шаблони параметрів для команди
   */
  private createParameterTemplates(
    command: Command, 
    resolvePipeline: any[]
  ): Record<string, any> {
    const templates: Record<string, any> = {};

    // Якщо команда має явне мапінг параметрів - використовуємо його
    if (command.resolvedParamsMapping) {
      for (const [commandField, resolvedParamId] of Object.entries(command.resolvedParamsMapping)) {
        // Перевіряємо чи існує параметр з таким ID в resolvePipeline
        const paramExists = resolvePipeline.some(param => param.id === resolvedParamId);
        if (paramExists) {
          templates[commandField] = {
            type: 'resolved',
            parameterId: resolvedParamId,
            resolveWhen: 'before-command'
          };
        }
      }
      return templates;
    }

    return templates;
  }

  // Очищення завершених груп
  cleanupCompletedGroups(): void {
    for (const [key, state] of this.activeGroups.entries()) {
      if (state.status === 'completed' || state.status === 'cancelled' || state.status === 'failed') {
        this.activeGroups.delete(key);
      }
    }
  }

  // Оновлення стану груп (викликається кожен кадр)
  update(deltaTime: number): void {
    // Тут можна додати логіку для відстеження прогресу груп
    // Наприклад, оновлювати currentTaskIndex на основі виконаних команд
    
    this.cleanupCompletedGroups();
  }
}
