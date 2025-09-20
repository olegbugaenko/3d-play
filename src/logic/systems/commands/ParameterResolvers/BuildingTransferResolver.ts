import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class BuildingTransferResolver implements IParameterResolver {
  public readonly getterTypes = ['planBuildingTransfer'] as const;

  private readonly handlers: Record<string, Handler> = {
    planBuildingTransfer: ([buildingId], { toolkit, groupContext }) => {
      return toolkit.planBuildingTransfer(buildingId, groupContext.objectId);
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
