import { ParameterResolvers } from './ParameterResolvers';
import { ResolveParametersPipeline, ParameterArg, CommandGroupContext } from './command-group.types';
import { Vector3 } from 'three';

export class ParameterResolutionService {
  private parameterResolvers: ParameterResolvers;

  constructor(mapLogic: any) {
    this.parameterResolvers = new ParameterResolvers(mapLogic);
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
        const value = this.resolveParameter(param, context);
        console.log('RESOLVE_PARAM: ', param, value);
        if (value !== null && value !== undefined) {
          resolvedParameters[param.id] = value;
        }
        if(!context.resolved) {
            context.resolved = {}
        }
        context.resolved = {...context.resolved, ...resolvedParameters};
        console.log('RSNOW: ', context.resolved);
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
    console.log('PARAM_ARGS: ', resolvedArgs, param, context.resolved);

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
        return this.parameterResolvers.getClosestChargingStation(fromPosCharging, maxDistCharging);
      
      case 'getResourcesInRadius':
        const resourceTag = resolvedArgs[0];
        const resourceCenter = resolvedArgs[1];
        const resourceRadius = resolvedArgs[2] || 5;
        return this.parameterResolvers.getResourcesInRadius(resourceTag, resourceCenter, resourceRadius);
      
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
        const path = arg.value.split('.');
        let value = context;
        
        for (const key of path) {
          if (value && typeof value === 'object' && key in value) {
            value = value[key];
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
