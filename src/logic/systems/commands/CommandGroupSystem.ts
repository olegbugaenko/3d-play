import { Command } from './command.types';
import { CommandGroup, CommandGroupContext, CommandGroupState } from './command-group.types';
import { getCommandGroup, COMMAND_GROUPS } from './db/command-groups-db';
import { ParameterResolutionService } from './ParameterResolutionService';
import { SaveLoadManager } from '../save-load/save-load.types';
import { ICommandGroupSystem, IMapLogic } from '@interfaces/index';
import { GameContainer } from '@core/game/GameContainer';
import { CommandContextStore } from './CommandContextStore';
import { CommandScheduler, PlanRuntime } from './CommandScheduler';
import { PlanInstance } from './plans/PlanInstance';
import type { CommandSystem } from './CommandSystem';

function createGroupKey(objectId: string, groupId: string): string {
  return `${objectId}-${groupId}`;
}

function cloneContext(context: CommandGroupContext): CommandGroupContext {
  return JSON.parse(JSON.stringify(context));
}

export class CommandGroupSystem implements SaveLoadManager, ICommandGroupSystem {
  private readonly commandSystem: CommandSystem;
  private readonly parameterResolutionService: ParameterResolutionService;
  private readonly contextStore: CommandContextStore;
  private readonly scheduler: CommandScheduler;
  private readonly container: GameContainer;
  private readonly activeGroups: Map<string, CommandGroupState> = new Map();
  private readonly planInstances: Map<string, PlanInstance> = new Map();

  constructor(commandSystem: CommandSystem, mapLogic: IMapLogic, container: GameContainer) {
    this.commandSystem = commandSystem;
    this.parameterResolutionService = new ParameterResolutionService(mapLogic);
    this.contextStore = new CommandContextStore(this.parameterResolutionService);
    this.scheduler = new CommandScheduler(this.commandSystem, this.contextStore, {
      onPlanCompleted: runtime => this.handlePlanCompleted(runtime),
      onPlanFailed: runtime => this.handlePlanFailed(runtime),
      onPlanRestarted: runtime => this.handlePlanRestarted(runtime),
      onPlanCancelled: runtime => this.handlePlanCancelled(runtime)
    });
    this.commandSystem.setScheduler(this.scheduler);
    this.container = container;
  }

  private prepareContext(objectId: string, context: CommandGroupContext): CommandGroupContext {
    const prepared: CommandGroupContext = {
      objectId,
      targets: context.targets ? { ...context.targets } : {},
      parameters: context.parameters ? { ...context.parameters } : {},
      resolved: context.resolved ? { ...context.resolved } : {}
    };
    return prepared;
  }

  private createPlanInstance(objectId: string, group: CommandGroup, context: CommandGroupContext): PlanInstance {
    const instanceId = `${objectId}-${group.id}-${Date.now()}`;
    const clonedContext = cloneContext(context);
    const planContext = { ...clonedContext, objectId } as CommandGroupContext;
    const instance = new PlanInstance({
      id: instanceId,
      groupId: group.id,
      objectId,
      root: group.plan,
      context: planContext,
      store: this.contextStore
    });
    this.planInstances.set(instanceId, instance);
    return instance;
  }

  addCommandGroup(objectId: string, groupId: string, context: CommandGroupContext): boolean {
    const group = getCommandGroup(groupId);
    if (!group || !group.plan) {
      console.error(`Command group '${groupId}' not found`);
      return false;
    }

    const preparedContext = this.prepareContext(objectId, context);

    if (group.startCondition && !group.startCondition(preparedContext)) {
      console.warn(`Start condition failed for group '${groupId}'`);
      return false;
    }

    const state: CommandGroupState = {
      groupId,
      objectId,
      status: 'active',
      currentTaskIndex: 0,
      startTime: Date.now(),
      context: preparedContext,
      resolvedParameters: preparedContext.resolved
    };

    const instance = this.createPlanInstance(objectId, group, preparedContext);
    state.planInstanceId = instance.id;

    const groupKey = createGroupKey(objectId, groupId);
    this.activeGroups.set(groupKey, state);

    this.scheduler.registerPlan(instance, group, objectId);
    return true;
  }

  cancelCommandGroup(objectId: string, groupId: string): boolean {
    const groupKey = createGroupKey(objectId, groupId);
    const state = this.activeGroups.get(groupKey);
    if (!state) {
      return false;
    }

    state.status = 'cancelled';
    this.scheduler.cancelPlan(groupKey);
    this.activeGroups.delete(groupKey);
    return true;
  }


  interruptObjectCommands(objectId: string): void {
    const activeStates = this.getActiveGroupsForObject(objectId);
    if (activeStates.length > 0) {
      for (const state of activeStates) {
        this.cancelCommandGroup(objectId, state.groupId);
      }
    }

    this.commandSystem.clearCommands(objectId);
  }

  getGroupState(objectId: string, groupId: string): CommandGroupState | undefined {
    return this.activeGroups.get(createGroupKey(objectId, groupId));
  }

  getActiveGroupsForObject(objectId: string): CommandGroupState[] {
    return Array.from(this.activeGroups.values()).filter(state => state.objectId === objectId);
  }

  getCommandGroupDefinition(groupId: string): CommandGroup | undefined {
    return getCommandGroup(groupId);
  }

  private handlePlanCompleted(runtime: PlanRuntime): void {
    const state = this.activeGroups.get(runtime.groupKey);
    if (!state) {
      return;
    }
    state.status = 'completed';
    this.activeGroups.delete(runtime.groupKey);
    this.planInstances.delete(runtime.instance.id);
  }

  private handlePlanFailed(runtime: PlanRuntime): void {
    const state = this.activeGroups.get(runtime.groupKey);
    if (!state) {
      return;
    }
    state.status = 'failed';
    this.activeGroups.delete(runtime.groupKey);
    this.planInstances.delete(runtime.instance.id);
  }

  private handlePlanRestarted(runtime: PlanRuntime): void {
    const state = this.activeGroups.get(runtime.groupKey);
    if (!state) {
      return;
    }
    state.status = 'active';
    state.currentTaskIndex = 0;
    state.startTime = Date.now();
    const context = this.contextStore.getContext(runtime.instance.id);
    if (context) {
      state.context = cloneContext(context);
      state.resolvedParameters = context.resolved;
    }
  }

  private handlePlanCancelled(runtime: PlanRuntime): void {
    this.activeGroups.delete(runtime.groupKey);
    this.planInstances.delete(runtime.instance.id);
  }

  cleanupCompletedGroups(): void {
    for (const [key, state] of this.activeGroups.entries()) {
      if (state.status === 'completed' || state.status === 'cancelled' || state.status === 'failed') {
        this.activeGroups.delete(key);
      }
    }
  }

  update(_deltaTime: number): void {
    this.cleanupCompletedGroups();
  }

  save(): any {
    const activeGroups: any[] = [];
    this.activeGroups.forEach((state, key) => {
      if (state.status === 'active') {
        activeGroups.push({
          groupKey: key,
          groupId: state.groupId,
          objectId: state.objectId,
          context: state.context,
          resolvedParameters: state.resolvedParameters
        });
      }
    });
    return { activeGroups };
  }

  load(data: any): void {
    if (!data?.activeGroups) {
      return;
    }

    data.activeGroups.forEach((groupData: any) => {
      const context: CommandGroupContext = {
        objectId: groupData.objectId,
        targets: groupData.context?.targets ?? {},
        parameters: groupData.context?.parameters ?? {},
        resolved: groupData.resolvedParameters ?? {}
      };
      this.addCommandGroup(groupData.objectId, groupData.groupId, context);
    });
  }

  reset(): void {
    this.activeGroups.clear();
    this.planInstances.forEach(instance => {
      this.contextStore.unregister(instance.id);
    });
    this.planInstances.clear();
  }

  executeCommandGroup(groupId: string, objectIds: string[]): boolean {
    let success = true;
    for (const objectId of objectIds) {
      const context: CommandGroupContext = {
        objectId,
        targets: {},
        parameters: {},
        resolved: {}
      };
      if (!this.addCommandGroup(objectId, groupId, context)) {
        success = false;
      }
    }
    return success;
  }

  addCommandToGroup(groupId: string, command: Command, objectIds: string[]): boolean {
    let success = true;
    for (const objectId of objectIds) {
      command.groupId = groupId;
      this.commandSystem.addCommandToQueue(command, objectId);
    }
    return success;
  }

  getCommandGroup(groupId: string): CommandGroup | undefined {
    return getCommandGroup(groupId);
  }

  getAllCommandGroups(): Map<string, CommandGroup> {
    const result = new Map<string, CommandGroup>();
    COMMAND_GROUPS.forEach(group => {
      result.set(group.id, group);
    });
    return result;
  }

  getActiveGroups(): Map<string, CommandGroup> {
    const result = new Map<string, CommandGroup>();
    this.activeGroups.forEach((state, key) => {
      const group = getCommandGroup(state.groupId);
      if (group) {
        result.set(key, group);
      }
    });
    return result;
  }

  public isUnlocked(groupId: string): boolean {
    const group = getCommandGroup(groupId);
    if (!group || !group.requirements || group.requirements.length === 0) {
      return true;
    }
    const requirementsSystem = this.container.get('requirementsSystem') as any;
    const result = requirementsSystem.checkRequirements(group.requirements);
    return result.satisfied;
  }

  public getAvailableCommandGroups(): CommandGroup[] {
    return COMMAND_GROUPS.filter(group => this.isUnlocked(group.id));
  }

  public getAvailableUIGroups(): CommandGroup[] {
    return this.getAvailableCommandGroups().filter(group => group.ui);
  }

  public getAvailableGroupsByScope(scope: 'gather' | 'build' | 'none'): CommandGroup[] {
    return this.getAvailableCommandGroups().filter(group => group.ui?.scope === scope);
  }

  public getAvailableGroupsByScopeAndCategory(scope: 'gather' | 'build' | 'none', category: string): CommandGroup[] {
    return this.getAvailableCommandGroups().filter(group => group.ui?.scope === scope && group.ui?.category === category);
  }

  tick(dT: number): void {
    this.update(dT);
  }
}
