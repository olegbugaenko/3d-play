// @ts-nocheck
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { CommandScheduler } from '../CommandScheduler';
import { CommandContextStore } from '../CommandContextStore';
import { ParameterResolutionService } from '../ParameterResolutionService';
import { COMMAND_GROUPS } from '../db/command-groups-db';
import { PlanInstance } from '../plans/PlanInstance';
import { Command, CommandFailureCode, CommandResult } from '../command.types';
import { CommandGroupContext } from '../command-group.types';

interface RecordedCommand {
  objectId: string;
  command: Command;
}

class TestCommandSystem {
  public readonly addedCommands: RecordedCommand[] = [];

  addCommand(objectId: string, command: Command): void {
    this.addedCommands.push({ objectId, command });
  }

  clearCommandsByGroup(_objectId: string, _groupId: string): void {
    // No-op for tests
  }
}

function createMapLogic() {
  const droneObject = {
    id: 'drone-1',
    coordinates: { x: 0, y: 0, z: 0 },
    bottomAnchor: 0,
    data: { storage: {} }
  };
  const resourceObject = {
    id: 'resource-1',
    coordinates: { x: 10, y: 0, z: 10 },
    bottomAnchor: 0,
    data: {}
  };
  const storageObject = {
    id: 'storage-1',
    coordinates: { x: -5, y: 0, z: -5 },
    bottomAnchor: 0,
    data: { isBuilt: true },
    commandType: ['unload-resources']
  };

  const objects: Record<string, any> = {
    [droneObject.id]: droneObject,
    [resourceObject.id]: resourceObject,
    [storageObject.id]: storageObject
  };

  const mapLogic = {
    scene: {
      getObjectById(id: string) {
        return objects[id];
      },
      getObjectsByTag(tag: string) {
        if (tag === 'storage') {
          return { [storageObject.id]: storageObject };
        }
        return {};
      },
      getObjectsInRadius() {
        return [];
      },
      getObjectsByTagInRadius() {
        return [];
      },
      pathfinder: {
        findDockingPointToStatic(_drone: any, target: any) {
          return {
            x: target.coordinates.x + 1,
            y: target.coordinates.y,
            z: target.coordinates.z + 1
          };
        }
      }
    },
    resources: {
      isUnlocked() {
        return true;
      }
    }
  };

  return { mapLogic, droneObject, resourceObject };
}

export function runCollectResourceRestartRegression(): void {
  const { mapLogic, droneObject, resourceObject } = createMapLogic();
  const parameterService = new ParameterResolutionService(mapLogic);
  const contextStore = new CommandContextStore(parameterService);
  const commandSystem = new TestCommandSystem();

  const callbacks = {
    onPlanCompleted: () => {
      // No-op
    },
    onPlanFailed: () => {
      throw new Error('Plan should not fail in regression test');
    },
    onPlanRestarted: () => {
      // No-op
    }
  };

  const scheduler = new CommandScheduler(commandSystem as any, contextStore, callbacks);

  const group = COMMAND_GROUPS.find(g => g.id === 'collect-resource');
  if (!group) {
    throw new Error('collect-resource group not found');
  }

  const context: CommandGroupContext = {
    objectId: droneObject.id,
    targets: {
      resource: resourceObject.id
    },
    parameters: {}
  };

  const planInstance = new PlanInstance({
    id: 'runtime-1',
    groupId: group.id,
    objectId: droneObject.id,
    root: group.plan,
    context,
    store: contextStore
  });

  scheduler.registerPlan(planInstance, group, droneObject.id);

  assert.strictEqual(commandSystem.addedCommands.length, 1, 'Expected initial move-to command');
  const initialMoveCommand = commandSystem.addedCommands[0].command;
  assert.strictEqual(initialMoveCommand.type, 'move-to');
  assert.deepStrictEqual(initialMoveCommand.position, { x: 11, y: 0, z: 11 });

  scheduler.onCommandCompleted(droneObject.id, initialMoveCommand);

  assert.strictEqual(commandSystem.addedCommands.length, 2, 'Expected collect-resource command after move completion');
  const collectCommand = commandSystem.addedCommands[1].command;
  assert.strictEqual(collectCommand.type, 'collect-resource');

  resourceObject.coordinates.x = 30;
  resourceObject.coordinates.y = 0;
  resourceObject.coordinates.z = 5;

  const failureResult: CommandResult = {
    success: false,
    message: 'Resource missing',
    code: CommandFailureCode.RESOURCE_NOT_FOUND
  };

  scheduler.onCommandFailed(droneObject.id, collectCommand, failureResult);

  assert.strictEqual(commandSystem.addedCommands.length, 3, 'Expected move-to command after restart');
  const restartedMoveCommand = commandSystem.addedCommands[2].command;
  assert.strictEqual(restartedMoveCommand.type, 'move-to');
  assert.deepStrictEqual(restartedMoveCommand.position, { x: 31, y: 0, z: 6 });

  const resolvedPosition = contextStore.getResolvedValue<any>(planInstance.id, 'resourcePosition');
  assert.ok(resolvedPosition, 'Resolved resource position should be available after restart');
  assert.strictEqual(resolvedPosition.x, 31);
  assert.strictEqual(resolvedPosition.z, 6);

  console.log('✅ collect-resource restart regression passed');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCollectResourceRestartRegression();
}
