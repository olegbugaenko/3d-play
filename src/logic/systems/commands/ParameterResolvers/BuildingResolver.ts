import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class BuildingResolver implements IParameterResolver {
  public readonly getterTypes = [
    'getBuildingInstance',
    'getBuildingRequiredResources',
    'getMissingResources',
    'checkHasMissingResources'
  ] as const;

  private readonly handlers: Record<string, Handler> = {
    getBuildingInstance: ([buildingId], { toolkit }) => toolkit.getBuildingInstance(buildingId),
    getBuildingRequiredResources: ([buildingId], { toolkit }) => toolkit.getBuildingRequiredResources(buildingId),
    getMissingResources: ([buildingId], { toolkit }) => toolkit.getMissingResources(buildingId),
    checkHasMissingResources: ([buildingId], { toolkit }) => toolkit.checkHasMissingResources(buildingId)
  };

  resolve(getterType: string, args: any[], context: ParameterResolveContext): any {
    const handler = this.handlers[getterType];
    if (!handler) {
      return undefined;
    }
    return handler(args, context);
  }
}
