import { ResolveParametersPipeline, ParameterArg, CommandGroupContext } from './command-group.types';
import { ValidationService, ValidationRule } from './ValidationService';
import {
  ParameterResolveContext,
  ParameterResolverRegistry,
  ParameterResolverToolkit,
  createParameterResolverRegistry
} from './ParameterResolvers';
import { ResolvedParametersStore } from './ResolvedParametersStore';

export class ParameterResolutionService {
  private readonly registry: ParameterResolverRegistry;
  private readonly toolkit: ParameterResolverToolkit;
  private readonly validationService: ValidationService;

  constructor(mapLogic: any) {
    this.toolkit = new ParameterResolverToolkit(mapLogic);
    this.registry = createParameterResolverRegistry();
    this.validationService = new ValidationService();
  }

  resolveParameters(
    pipeline: ResolveParametersPipeline[],
    context: CommandGroupContext,
    resolveWhen: 'group-start' | 'before-command' | 'all'
  ): Record<string, any> {
    if (!pipeline || pipeline.length === 0) {
      return context.resolved ?? {};
    }

    const store = new ResolvedParametersStore(context);
    const resolvedParameters: Record<string, any> = {};
    const relevantPipeline =
      resolveWhen === 'all' ? pipeline : pipeline.filter(param => param.resolveWhen === resolveWhen);
    const resolveContext: ParameterResolveContext = { groupContext: context, toolkit: this.toolkit };
    let cachedValues = store.snapshot();

    for (const param of relevantPipeline) {
      const source = param.resolveWhen;

      if (!store.shouldResolve(param.id, source)) {
        const cached = store.get(param.id);
        if (cached !== undefined) {
          resolvedParameters[param.id] = cached;
        }
        continue;
      }

      try {
        if (param.getterType === 'validate') {
          const validationResult = this.validateParameter(param, context, {
            ...cachedValues,
            ...resolvedParameters
          });
          store.set(param.id, validationResult, source);
          cachedValues = store.snapshot();
          resolvedParameters[param.id] = validationResult;

          if (!validationResult.success) {
            continue;
          }

          continue;
        }

        const value = this.resolveParameter(param, resolveContext);
        if (value !== null && value !== undefined) {
          store.set(param.id, value, source);
          cachedValues = store.snapshot();
          resolvedParameters[param.id] = value;
        }
      } catch (error) {
        console.error(`Failed to resolve parameter ${param.id}:`, error);
        if (param.id === 'requiredResources' || param.id === 'missingResources') {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Critical parameter resolution failed: ${param.id} - ${errorMessage}`);
        }
      }
    }

    return resolvedParameters;
  }

  private resolveParameter(
    param: ResolveParametersPipeline,
    resolveContext: ParameterResolveContext
  ): any {
    const resolvedArgs = this.resolveArgs(param.args, resolveContext.groupContext);
    const resolver = this.registry.getResolver(param.getterType);

    if (!resolver) {
      console.warn(`Unknown getter type: ${param.getterType}`);
      return null;
    }

    return resolver.resolve(param.getterType, resolvedArgs, resolveContext);
  }

  private resolveArgs(args: ParameterArg[], context: CommandGroupContext): any[] {
    return args.map(arg => {
      if (arg.type === 'var') {
        const path: string[] = arg.value.split('.');
        let value = context as any;

        for (const key of path) {
          if (value && typeof value === 'object' && key in value) {
            value = value[key];
          } else {
            return null;
          }
        }

        return value;
      }

      if (arg.type === 'lit') {
        return arg.value;
      }

      return null;
    });
  }

  private validateParameter(
    param: ResolveParametersPipeline,
    context: CommandGroupContext,
    resolvedParameters: Record<string, any>
  ): any {
    const validationRule: ValidationRule = {
      type: param.args[0]?.value || 'arrayNotEmpty',
      value: param.args[1]?.value,
      customValidator: param.args[2]?.value
    };

    const valueToValidate = this.resolveValidationValue(param.args[1], context, resolvedParameters);

    return this.validationService.validate(valueToValidate, validationRule, context);
  }

  private resolveValidationValue(
    arg: ParameterArg,
    context: CommandGroupContext,
    resolvedParameters: Record<string, any>
  ): any {
    if (arg.type === 'var') {
      if (arg.value.startsWith('resolved.')) {
        const paramId = arg.value.replace('resolved.', '');
        return resolvedParameters[paramId];
      }

      return (context as any)[arg.value];
    }

    if (arg.type === 'lit') {
      return arg.value;
    }

    return null;
  }

  resolveCommandFromTemplates(command: any, resolvedParameters: Record<string, any>): void {
    if (!command.parameterTemplates) {
      return;
    }

    if (command.parameterTemplates.position) {
      const template = command.parameterTemplates.position;
      if (resolvedParameters[template.parameterId]) {
        command.position = resolvedParameters[template.parameterId];
      }
    }

    if (command.parameterTemplates.targetId) {
      const template = command.parameterTemplates.targetId;
      if (resolvedParameters[template.parameterId]) {
        command.targetId =
          resolvedParameters[template.parameterId]?.id || resolvedParameters[template.parameterId];
      }
    }
  }
}
