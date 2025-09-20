import { Command } from '../command.types';
import { CommandGroupContext } from '../command-group.types';
import { CommandContextStore } from '../CommandContextStore';
import { ActionNode, ConditionNode, LoopNode, PlanExecutionContext, PlanNode, SequenceNode } from './plan.types';

interface SequenceFrame {
  type: 'sequence';
  node: SequenceNode;
  index: number;
}

interface LoopFrame {
  type: 'loop';
  node: LoopNode;
  iteration: number;
}

interface ConditionFrame {
  type: 'condition';
  node: ConditionNode;
  evaluated: boolean;
  branch?: PlanNode[];
  index: number;
}

interface ActionFrame {
  type: 'action';
  node: ActionNode;
  dispatched: boolean;
  command?: Command;
}

type Frame = SequenceFrame | LoopFrame | ConditionFrame | ActionFrame;

function deepCloneContext(context: CommandGroupContext): CommandGroupContext {
  return JSON.parse(JSON.stringify(context));
}

export interface PlanInstanceOptions {
  id: string;
  groupId: string;
  objectId: string;
  root: PlanNode;
  context: CommandGroupContext;
  store: CommandContextStore;
}

export class PlanInstance {
  public readonly id: string;
  public readonly groupId: string;
  public readonly objectId: string;
  private readonly root: PlanNode;
  private readonly store: CommandContextStore;
  private readonly initialContext: CommandGroupContext;
  private context: CommandGroupContext;
  private stack: Frame[] = [];
  private awaitingCommand: ActionFrame | null = null;
  private commandCounter = 0;
  private completed = false;

  constructor(options: PlanInstanceOptions) {
    this.id = options.id;
    this.groupId = options.groupId;
    this.objectId = options.objectId;
    this.root = options.root;
    this.store = options.store;
    this.initialContext = deepCloneContext(options.context);
    this.context = options.context;
    this.initialize();
  }

  private initialize(): void {
    this.stack = [];
    this.awaitingCommand = null;
    this.completed = false;
    this.commandCounter = 0;
    this.pushNode(this.root);
  }

  public getContext(): CommandGroupContext {
    return this.context;
  }

  public isCompleted(): boolean {
    return this.completed;
  }

  public resetToInitialState(): void {
    this.context = deepCloneContext(this.initialContext);
    this.initialize();
  }

  private pushNode(node: PlanNode): void {
    switch (node.kind) {
      case 'sequence':
        this.stack.push({ type: 'sequence', node, index: 0 });
        break;
      case 'parallel':
        // Parallel nodes are currently treated as sequence for simplicity.
        this.stack.push({ type: 'sequence', node: { kind: 'sequence', id: `${node.id}-seq`, children: node.branches }, index: 0 });
        break;
      case 'loop':
        this.stack.push({ type: 'loop', node, iteration: 0 });
        break;
      case 'condition':
        this.stack.push({ type: 'condition', node, evaluated: false, index: 0 });
        break;
      case 'action':
        this.stack.push({ type: 'action', node, dispatched: false });
        break;
      default:
        const exhaustive: never = node;
        throw new Error(`Unknown plan node kind ${(exhaustive as any).kind}`);
    }
  }

  private buildExecutionContext(): PlanExecutionContext {
    const instance = this;
    return {
      objectId: this.objectId,
      groupId: this.groupId,
      context: this.context,
      store: this.store,
      generateCommandId(prefix: string): string {
        instance.commandCounter += 1;
        return `${instance.groupId}-${prefix}-${instance.commandCounter}`;
      },
      getResolvedValue: <T = any>(path: string): T | undefined => {
        return this.store.getResolvedValue<T>(this.id, path);
      }
    };
  }

  public nextCommand(): Command | null {
    if (this.completed) {
      return null;
    }

    if (this.awaitingCommand) {
      return null;
    }

    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1];
      switch (frame.type) {
        case 'sequence': {
          if (frame.index >= frame.node.children.length) {
            this.stack.pop();
            continue;
          }
          const nextNode = frame.node.children[frame.index];
          frame.index += 1;
          this.pushNode(nextNode);
          continue;
        }
        case 'loop': {
          const execContext = this.buildExecutionContext();
          const conditionResult = frame.node.condition(execContext);
          if (!conditionResult) {
            this.stack.pop();
            continue;
          }

          if (frame.node.maxIterations !== undefined && frame.iteration >= frame.node.maxIterations) {
            this.stack.pop();
            continue;
          }

          frame.iteration += 1;
          this.stack.push({ type: 'sequence', node: { kind: 'sequence', id: `${frame.node.id}-iter-${frame.iteration}`, children: frame.node.body }, index: 0 });
          continue;
        }
        case 'condition': {
          if (!frame.evaluated) {
            const execContext = this.buildExecutionContext();
            const predicateResult = frame.node.predicate(execContext);
            frame.branch = predicateResult ? frame.node.then : frame.node.otherwise ?? [];
            frame.evaluated = true;
          }

          if (!frame.branch || frame.index >= frame.branch.length) {
            this.stack.pop();
            continue;
          }

          const nextNode = frame.branch[frame.index];
          frame.index += 1;
          this.pushNode(nextNode);
          continue;
        }
        case 'action': {
          if (frame.dispatched) {
            this.stack.pop();
            continue;
          }
          const execContext = this.buildExecutionContext();
          const command = frame.node.produce(execContext);
          frame.command = command;
          frame.dispatched = true;
          this.awaitingCommand = frame;
          return command;
        }
      }
    }

    this.completed = true;
    return null;
  }

  public markCommandComplete(commandId: string): void {
    if (!this.awaitingCommand) {
      return;
    }
    if (this.awaitingCommand.command?.id !== commandId) {
      return;
    }

    this.awaitingCommand = null;
  }

  public markCommandFailed(commandId: string): void {
    if (!this.awaitingCommand) {
      return;
    }
    if (this.awaitingCommand.command?.id !== commandId) {
      return;
    }

    this.awaitingCommand.dispatched = false;
    this.awaitingCommand.command = undefined;
    this.awaitingCommand = null;
  }
}
