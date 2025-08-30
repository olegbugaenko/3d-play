import { ParameterResolvers } from './ParameterResolvers';
import { ResolveParametersPipeline, ParameterArg, CommandGroupContext } from './command-group.types';
import { Vector3 } from 'three';
import { ValidationService, ValidationRule } from './ValidationService';

export class ParameterResolutionService {
  private parameterResolvers: ParameterResolvers;
  private validationService: ValidationService;

  constructor(mapLogic: any) {
    this.parameterResolvers = new ParameterResolvers(mapLogic);
    this.validationService = new ValidationService();
  }

  /**
   * Розв'язує параметри згідно з пайплайном
   */
  resolveParameters(
    pipeline: ResolveParametersPipeline[],
    context: CommandGroupContext,
    resolveWhen: 'group-start' | 'before-command' | 'all'
  ): Record<string, any> {
    const resolvedParameters: Record<string, any> = {};
    // Фільтруємо параметри за resolveWhen
    let relevantPipeline: ResolveParametersPipeline[];
    
    if (resolveWhen === 'all') {
      // Запускаємо всі пайплайни на початку групи
      relevantPipeline = pipeline;
    } else {
      // Фільтруємо за конкретним resolveWhen
      relevantPipeline = pipeline.filter(param => param.resolveWhen === resolveWhen);
    }

    for (const param of relevantPipeline) {
      try {
        // Перевіряємо чи це валідація
        if (param.getterType === 'validate') {
          const validationResult = this.validateParameter(param, context, resolvedParameters);
          if (!validationResult.success) {
            console.warn(`Validation failed for ${param.id}: ${validationResult.message}`);
            // Повертаємо результат валідації для обробки в CommandGroupSystem
            resolvedParameters[param.id] = validationResult;
            continue;
          }
        }

        const value = this.resolveParameter(param, context);
        console.warn(`Resolving param: ${param.id}: `, param, value);
        if (value !== null && value !== undefined) {
          resolvedParameters[param.id] = value;
        }
        if(!context.resolved) {
            context.resolved = {}
        }
        context.resolved = {...context.resolved, ...resolvedParameters};
      } catch (error) {
        console.error(`Failed to resolve parameter ${param.id}:`, error);
      }
    }

    return resolvedParameters;
  }

  /**
   * Розв'язує окремий параметр
   */
  private resolveParameter(param: ResolveParametersPipeline, context: CommandGroupContext): any {
    const resolvedArgs = this.resolveArgs(param.args, context);

    switch (param.getterType) {
      case 'getObjectPosition':
        return this.parameterResolvers.getObjectPosition(resolvedArgs[0]);
      
      case 'getClosestObjectByTag':
        const tag = resolvedArgs[0];
        const maxDistance = resolvedArgs[1]?.maxDistance || 1000;
        const fromPosition = this.getFromPosition(context);
        return this.parameterResolvers.getClosestObjectByTag(tag, fromPosition, maxDistance);
      
      case 'getClosestObjectByCommandType':
        const commandType = resolvedArgs[0];
        const maxDist = resolvedArgs[1]?.maxDistance || 1000;
        const fromPos = this.getFromPosition(context);
        return this.parameterResolvers.getClosestObjectByCommandType(commandType, fromPos, maxDist);
      
      case 'getCurrentObjectPosition':
        return this.parameterResolvers.getCurrentObjectPosition(context.objectId);
      
      case 'getClosestStorage':
        const maxDistStorage = resolvedArgs[0]?.maxDistance || 1000;
        const fromPosStorage = this.getFromPosition(context);
        return this.parameterResolvers.getClosestStorage(fromPosStorage, maxDistStorage);
      
      case 'getClosestUnloadTarget':
        const maxDistUnload = resolvedArgs[0]?.maxDistance || 1000;
        const fromPosUnload = this.getFromPosition(context);
        return this.parameterResolvers.getClosestUnloadTarget(fromPosUnload, maxDistUnload);
      
      case 'getClosestChargingStation':
        const maxDistCharging = resolvedArgs[0]?.maxDistance || 1000;
        const fromPosCharging = this.getFromPosition(context);
        console.warn("CL: ", fromPosCharging, maxDistCharging, context);
        return this.parameterResolvers.getClosestChargingStation(fromPosCharging, maxDistCharging);
      
      case 'getResourcesInRadius':
        const resourceTag = resolvedArgs[0];
        const resourceCenter = resolvedArgs[1];
        const resourceRadius = resolvedArgs[2] || 5;
        return this.parameterResolvers.getResourcesInRadius(resourceTag, resourceCenter, resourceRadius);
      
      case 'getResourceType':
        const resourceType = resolvedArgs[0];
        return this.parameterResolvers.getResourceType(resourceType);
      
      case 'getFirstOfList':
        const list = resolvedArgs[0];
        return this.parameterResolvers.getFirstOfList(list);
      
      case 'validate':
        return null;
      
      default:
        console.warn(`Unknown getter type: ${param.getterType}`);
        return null;
    }
  }

  /**
   * Розв'язує аргументи параметра
   */
  private resolveArgs(args: ParameterArg[], context: CommandGroupContext): any[] {
    return args.map(arg => {
      if (arg.type === 'var') {
        // Змінна з контексту
        const path: string[] = arg.value.split('.');
        let value = context;
        
        for (const key of path) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as any)[key];
          } else {
            return null;
          }
        }
        
        return value;
      } else if (arg.type === 'lit') {
        // Літерал
        return arg.value;
      }
      
      return null;
    });
  }

  /**
   * Отримує позицію "від" для пошуку найближчих об'єктів
   */
  private getFromPosition(context: CommandGroupContext): Vector3 {
    // Якщо є поточна позиція об'єкта - використовуємо її
    const currentPos = this.parameterResolvers.getCurrentObjectPosition(context.objectId);
    if (currentPos) {
      return currentPos;
    }
    
    // Інакше використовуємо позицію з targets або дефолтну
    if (context.targets.base) {
      return new Vector3(context.targets.base.x, context.targets.base.y, context.targets.base.z);
    }
    
    // Дефолтна позиція
    return new Vector3(0, 0, 0);
  }

  /**
   * Валідує параметр
   */
  private validateParameter(param: ResolveParametersPipeline, context: CommandGroupContext, resolvedParameters: Record<string, any>): any {
    const validationRule: ValidationRule = {
      type: param.args[0]?.value || 'arrayNotEmpty',
      value: param.args[1]?.value,
      customValidator: param.args[2]?.value
    };

    // Отримуємо значення для валідації з другого аргументу (перший - тип валідації)
    const valueToValidate = this.resolveValidationValue(param.args[1], context, resolvedParameters);
    
    // Виконуємо валідацію
    return this.validationService.validate(valueToValidate, validationRule, context);
  }

  /**
   * Розв'язує значення для валідації
   */
  private resolveValidationValue(arg: ParameterArg, context: CommandGroupContext, resolvedParameters: Record<string, any>): any {
    if (arg.type === 'var') {
      // Якщо це змінна, шукаємо в resolved параметрах
      if (arg.value.startsWith('resolved.')) {
        const paramId = arg.value.replace('resolved.', '');
        return resolvedParameters[paramId];
      }
      // Якщо це з контексту
      return (context as any)[arg.value];
    }
    
    if (arg.type === 'lit') {
      return arg.value;
    }
    
    return null;
  }

  /**
   * Перерозв'язує параметри команди з шаблонів
   */
  resolveCommandFromTemplates(command: any, resolvedParameters: Record<string, any>): void {
    if (!command.parameterTemplates) {
      return;
    }

    // Розв'язуємо position
    if (command.parameterTemplates.position) {
      const template = command.parameterTemplates.position;
      if (resolvedParameters[template.parameterId]) {
        command.position = resolvedParameters[template.parameterId];
      }
    }

    // Розв'язуємо targetId
    if (command.parameterTemplates.targetId) {
      const template = command.parameterTemplates.targetId;
      if (resolvedParameters[template.parameterId]) {
        command.targetId = resolvedParameters[template.parameterId]?.id || resolvedParameters[template.parameterId];
      }
    }

    // Можна додати інші параметри...
  }
}
