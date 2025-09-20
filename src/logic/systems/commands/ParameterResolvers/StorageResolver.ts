import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class StorageResolver implements IParameterResolver {
  public readonly getterTypes = [
    'getClosestStorage',
    'getClosestUnloadTarget',
    'getClosestChargingStation',
    'getUnnecessaryResources'
  ] as const;

  private readonly handlers: Record<string, Handler> = {
    getClosestStorage: ([options], { toolkit, groupContext }) => {
      const maxDistance = options?.maxDistance ?? 1000;
      const fromPosition = toolkit.getFromPosition(groupContext);
      return toolkit.getClosestStorage(fromPosition, maxDistance);
    },
    getClosestUnloadTarget: ([options], { toolkit, groupContext }) => {
      const maxDistance = options?.maxDistance ?? 1000;
      const fromPosition = toolkit.getFromPosition(groupContext);
      return toolkit.getClosestUnloadTarget(fromPosition, maxDistance);
    },
    getClosestChargingStation: ([options], { toolkit, groupContext }) => {
      const maxDistance = options?.maxDistance ?? 1000;
      const fromPosition = toolkit.getFromPosition(groupContext);
      return toolkit.getClosestChargingStation(fromPosition, maxDistance);
    },
    getUnnecessaryResources: ([objectId, requiredResources], { toolkit, groupContext }) => {
      const targetId = objectId ?? groupContext.objectId;
      return toolkit.getUnnecessaryResources(targetId, requiredResources ?? {});
    }
  };

  resolve(getterType: string, args: any[], context: ParameterResolveContext): any {
    const handler = this.handlers[getterType];
    if (!handler) {
      return undefined;
    }
    return handler(args, context);
  }
}
