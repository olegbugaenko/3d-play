import { Vector3 } from 'three';
import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class ObjectResolver implements IParameterResolver {
  public readonly getterTypes = [
    'getObjectPosition',
    'getClosestObjectByTag',
    'getClosestObjectByCommandType',
    'getCurrentObjectPosition',
    'sortObjectsByDistanceToDrone',
    'getObjectAccessPoint'
  ] as const;

  private readonly handlers: Record<string, Handler> = {
    getObjectPosition: ([objectId], { toolkit }) => toolkit.getObjectPosition(objectId),
    getClosestObjectByTag: ([tag, options], { toolkit, groupContext }) => {
      const maxDistance = options?.maxDistance ?? 1000;
      const fromPosition = toolkit.getFromPosition(groupContext);
      return toolkit.getClosestObjectByTag(tag, fromPosition, maxDistance);
    },
    getClosestObjectByCommandType: ([commandType, options], { toolkit, groupContext }) => {
      const maxDistance = options?.maxDistance ?? 1000;
      const fromPosition = toolkit.getFromPosition(groupContext);
      return toolkit.getClosestObjectByCommandType(commandType, fromPosition, maxDistance);
    },
    getCurrentObjectPosition: ([objectId], { toolkit, groupContext }) => {
      const targetId = objectId ?? groupContext.objectId;
      return toolkit.getCurrentObjectPosition(targetId);
    },
    sortObjectsByDistanceToDrone: ([objectIds, position], { toolkit, groupContext }) => {
      const dronePosition = position ?? toolkit.getCurrentObjectPosition(groupContext.objectId) ?? new Vector3(0, 0, 0);
      return toolkit.sortObjectsByDistanceToDrone(objectIds, dronePosition);
    },
    getObjectAccessPoint: ([targetObjectId, droneObjectId], { toolkit, groupContext }) => {
      const droneId = droneObjectId ?? groupContext.objectId;
      return toolkit.getObjectAccessPoint(targetObjectId, droneId);
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
