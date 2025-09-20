export { ParameterResolverToolkit } from './ParameterResolverToolkit';
export { ParameterResolverRegistry } from './ParameterResolverRegistry';
export type { IParameterResolver, ParameterResolveContext, ResolverSource } from './IParameterResolver';

import { BuildingResolver } from './BuildingResolver';
import { BuildingTransferResolver } from './BuildingTransferResolver';
import { LiteralResolver } from './LiteralResolver';
import { ObjectResolver } from './ObjectResolver';
import { ResourceResolver } from './ResourceResolver';
import { RoadResolver } from './RoadResolver';
import { StorageResolver } from './StorageResolver';
import { ParameterResolverRegistry } from './ParameterResolverRegistry';

export function createParameterResolverRegistry(): ParameterResolverRegistry {
  return new ParameterResolverRegistry([
    new ObjectResolver(),
    new StorageResolver(),
    new ResourceResolver(),
    new BuildingResolver(),
    new BuildingTransferResolver(),
    new RoadResolver(),
    new LiteralResolver()
  ]);
}
