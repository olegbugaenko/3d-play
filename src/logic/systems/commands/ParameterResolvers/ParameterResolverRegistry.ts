import { IParameterResolver } from './IParameterResolver';

export class ParameterResolverRegistry {
  private readonly resolverMap = new Map<string, IParameterResolver>();

  constructor(resolvers: IParameterResolver[]) {
    for (const resolver of resolvers) {
      for (const getterType of resolver.getterTypes) {
        if (this.resolverMap.has(getterType)) {
          console.warn(`Duplicate resolver registration for getter ${getterType}`);
        }
        this.resolverMap.set(getterType, resolver);
      }
    }
  }

  getResolver(getterType: string): IParameterResolver | undefined {
    return this.resolverMap.get(getterType);
  }
}
