import { Command } from '../command.types';
import { CommandGroupContext } from '../command-group.types';
import { CommandContextStore } from '../CommandContextStore';

export type PlanNode =
  | SequenceNode
  | ParallelNode
  | LoopNode
  | ConditionNode
  | ActionNode;

export interface PlanExecutionContext {
  readonly objectId: string;
  readonly groupId: string;
  readonly context: CommandGroupContext;
  readonly store: CommandContextStore;
  generateCommandId(prefix: string): string;
  getResolvedValue<T = any>(path: string): T | undefined;
}

export interface PlanNodeBase {
  id: string;
  kind: 'sequence' | 'parallel' | 'loop' | 'condition' | 'action';
}

export interface SequenceNode extends PlanNodeBase {
  kind: 'sequence';
  children: PlanNode[];
}

export interface ParallelNode extends PlanNodeBase {
  kind: 'parallel';
  branches: PlanNode[];
}

export type PlanCondition = (context: PlanExecutionContext) => boolean;

export interface LoopNode extends PlanNodeBase {
  kind: 'loop';
  condition: PlanCondition;
  body: PlanNode[];
  maxIterations?: number;
}

export interface ConditionNode extends PlanNodeBase {
  kind: 'condition';
  predicate: PlanCondition;
  then: PlanNode[];
  otherwise?: PlanNode[];
}

export type ActionProducer = (context: PlanExecutionContext) => Command;

export interface ActionNode extends PlanNodeBase {
  kind: 'action';
  produce: ActionProducer;
}
