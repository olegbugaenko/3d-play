import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class ResourceResolver implements IParameterResolver {
  public readonly getterTypes = [
    'getResourcesInRadius',
    'getResourceType',
    'getFirstOfList',
    'getValuesSum'
  ] as const;

  private readonly handlers: Record<string, Handler> = {
    getResourcesInRadius: ([tag, center, radius], { toolkit }) => {
      return toolkit.getResourcesInRadius(tag, center, radius ?? 5);
    },
    getResourceType: ([resourceType]) => resourceType,
    getFirstOfList: ([list]) => {
      if (!Array.isArray(list) || list.length === 0) {
        return null;
      }
      return list[0];
    },
    getValuesSum: ([values], { toolkit }) => toolkit.getValuesSum(values ?? {})
  };

  resolve(getterType: string, args: any[], context: ParameterResolveContext): any {
    const handler = this.handlers[getterType];
    if (!handler) {
      return undefined;
    }
    return handler(args, context);
  }
}
