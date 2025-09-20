import { CommandGroupContext } from '../command-group.types';
import { ParameterResolverToolkit } from './ParameterResolverToolkit';

export type ResolverSource = 'group-start' | 'before-command';

export interface ParameterResolveContext {
  groupContext: CommandGroupContext;
  toolkit: ParameterResolverToolkit;
}

export interface IParameterResolver {
  readonly getterTypes: readonly string[];
  resolve(getterType: string, args: any[], context: ParameterResolveContext): any;
}
