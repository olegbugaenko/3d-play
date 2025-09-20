import { Command } from '../command.types';
import { ActionNode, ConditionNode, LoopNode, PlanCondition, PlanNode, SequenceNode } from './plan.types';

export function sequence(id: string, children: PlanNode[]): SequenceNode {
  return {
    id,
    kind: 'sequence',
    children
  };
}

export function loop(id: string, condition: PlanCondition, body: PlanNode[], maxIterations?: number): LoopNode {
  return {
    id,
    kind: 'loop',
    condition,
    body,
    maxIterations
  };
}

export function condition(id: string, predicate: PlanCondition, thenBranch: PlanNode[], otherwise: PlanNode[] = []): ConditionNode {
  return {
    id,
    kind: 'condition',
    predicate,
    then: thenBranch,
    otherwise
  };
}

export type CommandFactory = (context: any) => Command;

export function action(id: string, producer: CommandFactory): ActionNode {
  return {
    id,
    kind: 'action',
    produce: producer
  };
}
