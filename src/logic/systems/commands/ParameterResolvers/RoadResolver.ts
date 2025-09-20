import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class RoadResolver implements IParameterResolver {
  public readonly getterTypes = [
    'getRoadInstance',
    'getNextUnbuiltRoadSegment',
    'getRoadSegmentRequiredResources',
    'getMissingResourcesForRoadSegment',
    'getRoadSegmentPosition'
  ] as const;

  private readonly handlers: Record<string, Handler> = {
    getRoadInstance: ([roadId], { toolkit }) => toolkit.getRoadInstance(roadId),
    getNextUnbuiltRoadSegment: ([roadId], { toolkit }) => toolkit.getNextUnbuiltRoadSegment(roadId),
    getRoadSegmentRequiredResources: ([roadId, segmentIndex], { toolkit }) =>
      toolkit.getRoadSegmentRequiredResources(roadId, segmentIndex),
    getMissingResourcesForRoadSegment: ([roadId, segmentIndex], { toolkit }) =>
      toolkit.getMissingResourcesForRoadSegment(roadId, segmentIndex),
    getRoadSegmentPosition: ([roadId, segmentIndex], { toolkit }) =>
      toolkit.getRoadSegmentPosition(roadId, segmentIndex)
  };

  resolve(getterType: string, args: any[], context: ParameterResolveContext): any {
    const handler = this.handlers[getterType];
    if (!handler) {
      return undefined;
    }
    return handler(args, context);
  }
}
