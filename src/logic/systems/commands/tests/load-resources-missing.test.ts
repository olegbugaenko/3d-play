// @ts-nocheck
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { LoadResourcesExecutor } from '../executors/LoadResourcesExecutor';
import { CommandFailureCode } from '../command.types';

function createTestContext() {
  const droneObject = {
    id: 'drone-1',
    coordinates: { x: 0, y: 0, z: 0 },
    data: {
      storage: {},
      loadSpeed: 10,
      maxCapacity: 10
    }
  };

  const storageResourceState: Record<string, number> = {
    stone: 0,
    wood: 5
  };

  const storageObject = {
    id: 'storage-1',
    coordinates: { x: 5, y: 0, z: 5 },
    tags: ['storage'],
    data: { isBuilt: true }
  };

  const objects: Record<string, any> = {
    [droneObject.id]: droneObject,
    [storageObject.id]: storageObject
  };

  const resourceManager = {
    getResourceAmount(resourceId: string) {
      return storageResourceState[resourceId] ?? 0;
    },
    getResourceCapacity(_resourceId: string) {
      return 999;
    },
    spendResources(requests: Array<{ resourceId: string; amount: number }>) {
      for (const { resourceId, amount } of requests) {
        const available = storageResourceState[resourceId] ?? 0;
        if (available + 1e-6 < amount) {
          return false;
        }
        storageResourceState[resourceId] = available - amount;
      }
      return true;
    }
  };

  const context = {
    objectId: droneObject.id,
    scene: {
      getObjectById(id: string) {
        return objects[id];
      },
      markObjectDirty() {
        // no-op
      }
    },
    deltaTime: 0,
    mapLogic: {
      resources: resourceManager
    }
  };

  return { context, droneObject, storageObject, storageResourceState };
}

export function runLoadResourcesMissingTest(): void {
  const { context, droneObject, storageResourceState } = createTestContext();

  const command = {
    id: 'cmd-1',
    type: 'load-resources',
    targetId: 'storage-1',
    position: { x: 0, y: 0, z: 0 },
    parameters: { resources: { stone: 4, wood: 1 } },
    status: 'pending',
    priority: 1,
    createdAt: Date.now()
  } as any;

  const executor = new LoadResourcesExecutor(command, context as any);

  assert.ok(executor.canExecute(), 'Expected executor to be able to start loading');

  const result = executor.execute();

  assert.strictEqual(result.success, false, 'Expected loading to fail when required resource is missing');
  assert.strictEqual(result.code, CommandFailureCode.INSUFFICIENT_RESOURCES, 'Failure should include insufficient resources code');
  assert.match(result.message, /Missing required resources in storage/, 'Failure message should mention missing resources');
  assert.match(result.message, /stone/, 'Failure message should mention stone');

  assert.strictEqual(droneObject.data.storage.wood || 0, 0, 'Drone should not load other resources when requirements cannot be met');
  assert.strictEqual(droneObject.data.storage.stone || 0, 0, 'Drone should not have any stone loaded');
  assert.strictEqual(storageResourceState.wood, 5, 'Global storage should remain untouched when loading fails immediately');

  console.log('✅ load-resources missing resource test passed');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runLoadResourcesMissingTest();
}
