import { Command, CommandType } from '../command.types';
import { PlanExecutionContext } from './plan.types';

interface BuildCommandOptions extends Partial<Command> {
  priority?: number;
}

export function buildCommand(
  ctx: PlanExecutionContext,
  type: CommandType,
  overrides: BuildCommandOptions = {}
): Command {
  const id = overrides.id ?? ctx.generateCommandId(type);
  return {
    id,
    type,
    targetId: overrides.targetId,
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    parameters: overrides.parameters ?? {},
    status: overrides.status ?? 'pending',
    priority: overrides.priority ?? 1,
    createdAt: overrides.createdAt ?? Date.now(),
    groupId: ctx.groupId,
    resolvedParamsMapping: overrides.resolvedParamsMapping,
    groupRestartCodes: overrides.groupRestartCodes
  };
}
