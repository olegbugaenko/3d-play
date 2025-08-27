import { CommandSystem } from './CommandSystem';
import { Command } from './command.types';
import { CommandGroup, CommandGroupContext, CommandGroupState } from './command-group.types';
import { getCommandGroup } from './db/command-groups-db';
import { ParameterResolutionService } from './ParameterResolutionService';
import { SaveLoadManager } from '../save-load/save-load.types';

export class CommandGroupSystem implements SaveLoadManager {
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
      
      // Перевіряємо валідації
      const validationFailed = this.checkValidations(resolvedParameters);
      if (validationFailed) {
        console.warn(`Validation failed for group ${groupId}, cancelling group`);
        return false;
      }
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

            // Група команд запущена
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

            // Група команд скасована
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
   * Перевіряє валідації в resolved параметрах
   */
  private checkValidations(resolvedParameters: Record<string, any>): boolean {
    for (const [paramId, value] of Object.entries(resolvedParameters)) {
      // Перевіряємо чи це результат валідації
      if (value && typeof value === 'object' && 'success' in value && !value.success) {
        console.warn(`Validation failed for parameter ${paramId}: ${value.message} (${value.code})`);
        return true; // Валідація фейлилась
      }
    }
    return false; // Всі валідації пройшли
  }

  /**
   * Створює шаблони параметрів для команди
   */
  public createParameterTemplates(
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

  // ==================== SaveLoadManager Implementation ====================
  
  save(): any {
    console.log('[CommandGroupSystem] Saving groups...');
    
    const activeGroups: any[] = [];
    
    // Зберігаємо стан всіх активних груп
    this.activeGroups.forEach((groupState, groupKey) => {
      if (groupState.status === 'active') {
        activeGroups.push({
          groupKey,
          groupId: groupState.groupId,
          objectId: groupState.objectId,
          status: groupState.status,
          currentTaskIndex: groupState.currentTaskIndex,
          startTime: groupState.startTime,
          context: groupState.context,
          resolvedParameters: groupState.resolvedParameters
        });
      }
    });
    
    const saveData = { activeGroups };
    console.log('[CommandGroupSystem] Saved groups:', saveData);
    return saveData;
  }
  
  load(data: any): void {
    console.log('[CommandGroupSystem] Loading groups:', data);
    
    if (data.activeGroups) {
      data.activeGroups.forEach((groupData: any) => {
        const { groupId, objectId, context, resolvedParameters } = groupData;
        
        // Відновлюємо стан групи
        const groupState: CommandGroupState = {
          groupId,
          objectId,
          status: 'active',
          currentTaskIndex: groupData.currentTaskIndex || 0,
          startTime: groupData.startTime || Date.now(),
          context: context || {},
          resolvedParameters: resolvedParameters || {}
        };
        
        const groupKey = `${objectId}-${groupId}`;
        this.activeGroups.set(groupKey, groupState);
        
        console.log('[CommandGroupSystem] Restored group:', groupKey);
      });
    }
    
    console.log('[CommandGroupSystem] Loaded groups. Current active groups:', this.activeGroups);
  }
  
  reset(): void {
    console.log('[CommandGroupSystem] Resetting groups...');
    this.activeGroups.clear();
  }
}
