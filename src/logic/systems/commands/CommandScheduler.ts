import type { CommandSystem } from './CommandSystem';
import { Command, CommandResult } from './command.types';
import { CommandGroup } from './command-group.types';
import { CommandContextStore } from './CommandContextStore';
import { PlanInstance } from './plans/PlanInstance';

interface SchedulerCallbacks {
  onPlanCompleted(runtime: PlanRuntime): void;
  onPlanFailed(runtime: PlanRuntime, result?: CommandResult): void;
  onPlanRestarted?(runtime: PlanRuntime): void;
  onPlanCancelled?(runtime: PlanRuntime): void;
}

export interface PlanRuntime {
  instance: PlanInstance;
  group: CommandGroup;
  objectId: string;
  groupKey: string;
}

interface PendingCommand {
  runtime: PlanRuntime;
  command: Command;
}

export class CommandScheduler {
  private readonly commandSystem: CommandSystem;
  private readonly contextStore: CommandContextStore;
  private readonly callbacks: SchedulerCallbacks;

  private readonly runtimeQueuesByObject: Map<string, PlanRuntime[]> = new Map();
  private readonly runtimeByInstanceId: Map<string, PlanRuntime> = new Map();
  private readonly runtimeByGroupKey: Map<string, PlanRuntime> = new Map();
  private readonly activeCommandByObject: Map<string, string> = new Map();
  private readonly pendingCommandById: Map<string, PendingCommand> = new Map();

  constructor(commandSystem: CommandSystem, contextStore: CommandContextStore, callbacks: SchedulerCallbacks) {
    this.commandSystem = commandSystem;
    this.contextStore = contextStore;
    this.callbacks = callbacks;
  }

  registerPlan(instance: PlanInstance, group: CommandGroup, objectId: string): void {
    const runtime: PlanRuntime = {
      instance,
      group,
      objectId,
      groupKey: `${objectId}-${group.id}`
    };

    let queue = this.runtimeQueuesByObject.get(objectId);
    if (!queue) {
      queue = [];
    }

    const shouldInterrupt = group.autoExecute?.priority === 'interrupt';
    if (shouldInterrupt && queue.length > 0) {
      const activeRuntime = queue[0];
      this.pauseRuntime(activeRuntime);
      queue.unshift(runtime);
    } else {
      queue.push(runtime);
    }
    this.runtimeQueuesByObject.set(objectId, queue);

    this.runtimeByInstanceId.set(instance.id, runtime);
    this.runtimeByGroupKey.set(runtime.groupKey, runtime);

    this.contextStore.register(instance.id, instance.getContext(), group.resolveParametersPipeline);

    if (queue[0] === runtime && !this.activeCommandByObject.has(objectId)) {
      this.dispatchNext(runtime);
    }
  }

  cancelPlan(groupKey: string): void {
    const runtime = this.runtimeByGroupKey.get(groupKey);
    if (!runtime) {
      return;
    }

    this.clearPendingForRuntime(runtime);
    this.commandSystem.clearCommandsByGroup(runtime.objectId, runtime.group.id);
    this.removeRuntime(runtime);
    this.callbacks.onPlanCancelled?.(runtime);
  }

  onCommandCompleted(objectId: string, command: Command): void {
    const pending = this.pendingCommandById.get(command.id);
    if (!pending) {
      return;
    }

    pending.runtime.instance.markCommandComplete(command.id);
    this.pendingCommandById.delete(command.id);
    this.activeCommandByObject.delete(objectId);

    if (pending.runtime.instance.isCompleted()) {
      this.finalizeRuntime(pending.runtime);
      return;
    }

    this.dispatchNext(pending.runtime);
  }

  onCommandFailed(objectId: string, command: Command, result: CommandResult): void {
    const pending = this.pendingCommandById.get(command.id);
    if (!pending) {
      return;
    }

    pending.runtime.instance.markCommandFailed(command.id);
    this.pendingCommandById.delete(command.id);
    this.activeCommandByObject.delete(objectId);

    if (command.groupRestartCodes && result.code && command.groupRestartCodes.includes(result.code)) {
      this.restartRuntime(pending.runtime);
      return;
    }

    this.callbacks.onPlanFailed(pending.runtime, result);
    this.removeRuntime(pending.runtime);
  }

  private dispatchNext(runtime: PlanRuntime): void {
    if (this.activeCommandByObject.has(runtime.objectId)) {
      return;
    }

    this.contextStore.resolveForTiming(runtime.instance.id, 'before-command');
    const command = runtime.instance.nextCommand();
    if (!command) {
      this.finalizeRuntime(runtime);
      return;
    }

    command.groupId = runtime.group.id;
    this.applyResolvedParameters(runtime, command);

    this.pendingCommandById.set(command.id, { runtime, command });
    this.activeCommandByObject.set(runtime.objectId, command.id);
    this.commandSystem.addCommand(runtime.objectId, command);
  }

  private restartRuntime(runtime: PlanRuntime): void {
    runtime.instance.resetToInitialState();
    this.contextStore.reset(runtime.instance.id, runtime.instance.getContext());
    this.contextStore.resolveForTiming(runtime.instance.id, 'group-start');
    this.callbacks.onPlanRestarted?.(runtime);
    this.dispatchNext(runtime);
  }

  private finalizeRuntime(runtime: PlanRuntime): void {
    this.callbacks.onPlanCompleted(runtime);
    this.removeRuntime(runtime);
  }

  private removeRuntime(runtime: PlanRuntime): void {
    const queue = this.runtimeQueuesByObject.get(runtime.objectId);
    if (queue) {
      const index = queue.indexOf(runtime);
      if (index >= 0) {
        queue.splice(index, 1);
      }
      if (queue.length === 0) {
        this.runtimeQueuesByObject.delete(runtime.objectId);
      } else if (index === 0) {
        const nextRuntime = queue[0];
        if (!this.activeCommandByObject.has(runtime.objectId)) {
          this.dispatchNext(nextRuntime);
        }
      }
    }

    this.contextStore.unregister(runtime.instance.id);
    this.runtimeByInstanceId.delete(runtime.instance.id);
    this.runtimeByGroupKey.delete(runtime.groupKey);
  }

  private clearPendingForRuntime(runtime: PlanRuntime): void {
    for (const [commandId, pending] of this.pendingCommandById) {
      if (pending.runtime === runtime) {
        this.pendingCommandById.delete(commandId);
        this.activeCommandByObject.delete(runtime.objectId);
      }
    }
  }

  private applyResolvedParameters(runtime: PlanRuntime, command: Command): void {
    if (!command.resolvedParamsMapping) {
      return;
    }

    for (const [field, parameterId] of Object.entries(command.resolvedParamsMapping)) {
      const value = this.contextStore.getResolvedValue(runtime.instance.id, parameterId);
      if (value === undefined) {
        continue;
      }

      if (field === 'position' && value && typeof value === 'object') {
        command.position = {
          x: value.x ?? command.position.x,
          y: value.y ?? command.position.y,
          z: value.z ?? command.position.z
        };
        continue;
      }

      if (field === 'targetId') {
        command.targetId = value?.id ?? value;
        continue;
      }

      if (!command.parameters) {
        command.parameters = {};
      }
      command.parameters[field] = value;
    }
  }

  private pauseRuntime(runtime: PlanRuntime): void {
    const activeCommandId = this.activeCommandByObject.get(runtime.objectId);
    if (!activeCommandId) {
      return;
    }

    const pending = this.pendingCommandById.get(activeCommandId);
    if (pending && pending.runtime === runtime) {
      this.pendingCommandById.delete(activeCommandId);
      runtime.instance.markCommandFailed(activeCommandId);
    }

    this.activeCommandByObject.delete(runtime.objectId);
    this.commandSystem.clearCommandsByGroup(runtime.objectId, runtime.group.id);
  }
}
