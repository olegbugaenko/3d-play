// @ts-nocheck
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { ParameterResolutionService } from '../ParameterResolutionService';
import { CommandGroupContext, ResolveParametersPipeline } from '../command-group.types';

function createBaseContext(): CommandGroupContext {
  return {
    objectId: 'drone-1',
    targets: {},
    parameters: {}
  };
}

export function testGroupStartCaching(): void {
  const drone = {
    id: 'drone-1',
    coordinates: { x: 0, y: 0, z: 0 },
    bottomAnchor: 0,
    data: {}
  };
  const storage = {
    id: 'storage-1',
    coordinates: { x: 10, y: 0, z: 0 },
    bottomAnchor: 0,
    data: { isBuilt: true }
  };

  let lookupCount = 0;

  const mapLogic = {
    scene: {
      getObjectById(id: string) {
        if (id === drone.id) {
          return drone;
        }
        if (id === storage.id) {
          return storage;
        }
        return undefined;
      },
      getObjectsByTag(tag: string) {
        if (tag === 'storage') {
          lookupCount += 1;
          return { [storage.id]: storage };
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
        findDockingPointToStatic() {
          return { x: 0, y: 0, z: 0 };
        }
      }
    },
    resources: {
      isUnlocked() {
        return true;
      }
    }
  };

  const service = new ParameterResolutionService(mapLogic);
  const context = createBaseContext();

  const pipeline: ResolveParametersPipeline[] = [
    {
      id: 'closestStorage',
      getterType: 'getClosestStorage',
      args: [{ type: 'lit', value: { maxDistance: 100 } }],
      resolveWhen: 'group-start'
    }
  ];

  const first = service.resolveParameters(pipeline, context, 'group-start');
  assert.strictEqual(first.closestStorage, storage.id);
  assert.strictEqual(lookupCount, 1, 'Storage lookup should happen once on first resolve');
  assert.strictEqual(context.resolved?.closestStorage, storage.id);

  const second = service.resolveParameters(pipeline, context, 'group-start');
  assert.strictEqual(second.closestStorage, storage.id);
  assert.strictEqual(lookupCount, 1, 'Cached group-start resolver should not trigger new lookup');
}

export function testBeforeCommandRecomputation(): void {
  const drone = {
    id: 'drone-1',
    coordinates: { x: 0, y: 0, z: 0 },
    bottomAnchor: 0,
    data: {}
  };

  const unloadTarget = {
    id: 'unload-1',
    coordinates: { x: 5, y: 0, z: 0 },
    bottomAnchor: 0,
    commandType: ['unload-resources']
  };

  let searchCount = 0;

  const mapLogic = {
    scene: {
      getObjectById(id: string) {
        if (id === drone.id) {
          return drone;
        }
        if (id === unloadTarget.id) {
          return unloadTarget;
        }
        return undefined;
      },
      getObjectsInRadius() {
        searchCount += 1;
        return [unloadTarget];
      },
      getObjectsByTag() {
        return {};
      },
      getObjectsByTagInRadius() {
        return [];
      },
      pathfinder: {
        findDockingPointToStatic() {
          return { x: 0, y: 0, z: 0 };
        }
      }
    },
    resources: {
      isUnlocked() {
        return true;
      }
    }
  };

  const service = new ParameterResolutionService(mapLogic);
  const context = createBaseContext();

  const pipeline: ResolveParametersPipeline[] = [
    {
      id: 'unloadTarget',
      getterType: 'getClosestUnloadTarget',
      args: [{ type: 'lit', value: { maxDistance: 50 } }],
      resolveWhen: 'before-command'
    }
  ];

  const first = service.resolveParameters(pipeline, context, 'before-command');
  assert.strictEqual(first.unloadTarget, unloadTarget.id);
  assert.strictEqual(searchCount, 1);

  const second = service.resolveParameters(pipeline, context, 'before-command');
  assert.strictEqual(second.unloadTarget, unloadTarget.id);
  assert.strictEqual(searchCount, 2, 'before-command resolvers should recompute on each invocation');
}

export function testRoadResolver(): void {
  const drone = {
    id: 'drone-1',
    coordinates: { x: 0, y: 0, z: 0 },
    bottomAnchor: 0,
    data: {}
  };

  const roadInstance = {
    segments: [
      {
        buildingState: 'pending',
        deliveredResources: { stone: 1 },
        startPoint: { x: 0, y: 0, z: 0 },
        endPoint: { x: 2, y: 0, z: 0 }
      },
      {
        buildingState: 'completed',
        deliveredResources: { stone: 3 },
        startPoint: { x: 2, y: 0, z: 0 },
        endPoint: { x: 4, y: 0, z: 0 }
      }
    ],
    path: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 }
    ]
  };

  const mapLogic = {
    scene: {
      getObjectById(id: string) {
        if (id === drone.id) {
          return drone;
        }
        return undefined;
      },
      getObjectsByTag() {
        return {};
      },
      getObjectsInRadius() {
        return [];
      },
      getObjectsByTagInRadius() {
        return [];
      },
      pathfinder: {
        findDockingPointToStatic() {
          return { x: 0, y: 0, z: 0 };
        }
      }
    },
    buildingsManager: {
      getRoadInfo(roadId: string) {
        if (roadId === 'road-1') {
          return roadInstance;
        }
        return null;
      },
      calculateRoadCost(roadId: string, segmentIndex: number) {
        if (roadId === 'road-1' && segmentIndex === 0) {
          return { stone: 3 };
        }
        return {};
      }
    },
    resources: {
      isUnlocked() {
        return true;
      }
    }
  };

  const service = new ParameterResolutionService(mapLogic);
  const context = createBaseContext();

  const pipeline: ResolveParametersPipeline[] = [
    {
      id: 'nextSegment',
      getterType: 'getNextUnbuiltRoadSegment',
      args: [{ type: 'lit', value: 'road-1' }],
      resolveWhen: 'group-start'
    },
    {
      id: 'segmentResources',
      getterType: 'getRoadSegmentRequiredResources',
      args: [
        { type: 'lit', value: 'road-1' },
        { type: 'lit', value: 0 }
      ],
      resolveWhen: 'group-start'
    },
    {
      id: 'missingResources',
      getterType: 'getMissingResourcesForRoadSegment',
      args: [
        { type: 'lit', value: 'road-1' },
        { type: 'lit', value: 0 }
      ],
      resolveWhen: 'group-start'
    },
    {
      id: 'segmentPosition',
      getterType: 'getRoadSegmentPosition',
      args: [
        { type: 'lit', value: 'road-1' },
        { type: 'lit', value: 0 }
      ],
      resolveWhen: 'group-start'
    }
  ];

  const resolved = service.resolveParameters(pipeline, context, 'group-start');

  assert.ok(resolved.nextSegment, 'Road resolver should return next segment metadata');
  assert.strictEqual(resolved.nextSegment.index, 0);
  assert.deepStrictEqual(resolved.segmentResources, { stone: 3 });
  assert.deepStrictEqual(resolved.missingResources, { stone: 2 });
  assert.ok(resolved.segmentPosition);
  assert.strictEqual(Math.round(resolved.segmentPosition.x), 1);
  assert.strictEqual(resolved.segmentPosition.y, 0);
  assert.strictEqual(Math.round(resolved.segmentPosition.z), 0);
}

export function runParameterResolversTests(): void {
  testGroupStartCaching();
  testBeforeCommandRecomputation();
  testRoadResolver();
  console.log('✅ Parameter resolver unit tests passed');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runParameterResolversTests();
}
