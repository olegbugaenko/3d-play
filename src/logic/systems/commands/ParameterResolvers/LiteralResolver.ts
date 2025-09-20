import { IParameterResolver, ParameterResolveContext } from './IParameterResolver';

type Handler = (args: any[], context: ParameterResolveContext) => any;

export class LiteralResolver implements IParameterResolver {
  public readonly getterTypes = ['literal'] as const;

  private readonly handlers: Record<string, Handler> = {
    literal: ([value]) => value
  };

  resolve(getterType: string, args: any[], context: ParameterResolveContext): any {
    const handler = this.handlers[getterType];
    if (!handler) {
      return undefined;
    }
    return handler(args, context);
  }
}
