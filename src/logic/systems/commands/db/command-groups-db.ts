import { CommandGroup } from '../command-group.types';
import { Command, CommandFailureCode } from '../command.types';

// База даних груп команд
export const COMMAND_GROUPS: CommandGroup[] = [
  {
    id: 'collect-resource',
    name: 'Collect Resource',
    description: 'Collect resources from target and return to base',
    startCondition: null, // Завжди можна запустити
    endCondition: null,   // Завершується після виконання всіх команд
    loopCondition: null,  // Не повторюється
    isLoop: true, // Команди будуть повторюватися після завершення
    resolveParametersPipeline: [
      {
        id: 'resourcePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'targets.resource'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'group-start'
      },
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
      {
        id: `move-to-resource-${Date.now()}`,
        type: 'move-to',
        targetId: context.targets.resource,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'resourcePosition'  // position команди = resourcePosition з resolved
        }
      },
      {
        id: `collect-resource-${Date.now()}`,
        type: 'collect-resource',
        targetId: context.targets.resource,
        position: { x: 0, y: 0, z: 0 },
        parameters: {
          amount: context.parameters.amount || 100
        },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        // Без resolvedParamsMapping - беремо все з контексту
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND, CommandFailureCode.TARGET_INACCESSIBLE]
      },
      {
        id: `return-to-base-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'low' },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'storagePosition'  // position команди = storagePosition з resolved
        }
      },
      {
        id: `unload-resources-${Date.now()}`,
        type: 'unload-resources',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 4,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'closestStorageId'  // targetId команди = closestStorageId з resolved
        }
      }
    ]
  },

  // Дороги → Будівництво
  {
    id: 'road-construction',
    name: 'Road Construction',
    description: 'Builds a road by gathering resources and constructing segments',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: false,
    ui: {
      scope: 'build',
      category: 'road',
      name: 'Build Road',
      description: 'Gather resources and build road segments'
    },
    resolveParametersPipeline: [
      // ID дороги
      {
        id: 'roadId',
        getterType: 'literal',
        args: [{type: 'var', value: 'targets.roadId'}],
        resolveWhen: 'before-command'
      },
      // Базові дані про дорогу
      {
        id: 'roadInstance',
        getterType: 'getRoadInstance',
        args: [{type: 'var', value: 'targets.roadId'}],
        resolveWhen: 'before-command'
      },
      // Наступний сегмент для будівництва
      {
        id: 'nextSegment',
        getterType: 'getNextUnbuiltRoadSegment',
        args: [{type: 'var', value: 'targets.roadId'}],
        resolveWhen: 'before-command'
      },
      // Потрібні ресурси для сегмента
      {
        id: 'requiredResources',
        getterType: 'getRoadSegmentRequiredResources',
        args: [
          {type: 'var', value: 'targets.roadId'},
          {type: 'var', value: 'resolved.nextSegment.index'}
        ],
        resolveWhen: 'before-command'
      },
      // Відсутні ресурси для сегмента
      {
        id: 'missingResources',
        getterType: 'getMissingResourcesForRoadSegment',
        args: [
          {type: 'var', value: 'targets.roadId'},
          {type: 'var', value: 'resolved.nextSegment.index'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'missingSum',
        getterType: 'getValuesSum',
        args: [{type: 'var', value: 'resolved.missingResources'}],
        resolveWhen: 'before-command'
      },
      // Ресурси які потрібно вивантажити (непотрібні для будівництва)
      {
        id: 'resourcesToUnload',
        getterType: 'getUnnecessaryResources',
        args: [
          {type: 'var', value: 'objectId'},
          {type: 'var', value: 'resolved.requiredResources'}
        ],
        resolveWhen: 'before-command'
      },
      // Найближчий склад
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      // Позиція сегмента дороги
      {
        id: 'segmentPosition',
        getterType: 'getRoadSegmentPosition',
        args: [
          {type: 'var', value: 'targets.roadId'},
          {type: 'var', value: 'resolved.nextSegment.index'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
      // 1. Цикл збору ресурсів (conditional-loop)
      {
        id: `road-construction-resource-loop-${Date.now()}`,
        type: 'conditional-loop',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {
          // Універсальні параметри умови
          condition: '>',
          value2: 1.e-10,
          // Команди циклу для збору ресурсів
          loopCommands: [
            // A) Рухаємося до складу
            {
              id: `move-to-storage-${Date.now()}`,
              type: 'move-to',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: { priority: 'high' },
              status: 'pending',
              priority: 1,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                position: 'storagePosition'
              }
            },
            // B) Вивантажуємо непотрібні ресурси
            {
              id: `unload-unnecessary-${Date.now()}`,
              type: 'unload-resources',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: {},
              status: 'pending',
              priority: 2,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                targetId: 'closestStorageId',
                resourcesToUnload: 'resourcesToUnload'
              }
            },
            // C) Завантажуємо потрібні ресурси
            {
              id: `load-needed-resources-${Date.now()}`,
              type: 'load-resources',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: {},
              status: 'pending',
              priority: 3,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                targetId: 'closestStorageId',
                resources: 'missingResources'
              }
            },
            // D) Рухаємося до сегмента дороги
            {
              id: `move-to-road-segment-${Date.now()}`,
              type: 'move-to',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: { priority: 'high' },
              status: 'pending',
              priority: 4,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                position: 'segmentPosition'
              }
            },
            // E) Вивантажуємо ресурси на сегмент дороги
            {
              id: `unload-to-road-segment-${Date.now()}`,
              type: 'unload-resources',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: {
                roadId: context.targets?.roadId,
                segmentIndex: context.resolved?.nextSegment?.index
              },
              status: 'pending',
              priority: 5,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                targetId: 'roadId',
                resourcesToUnload: 'missingResources'
              }
            }
          ]
        },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          value1: 'missingSum',
          missingResources: 'missingResources',
          requiredResources: 'requiredResources',
          closestStorageId: 'closestStorageId',
          roadInstance: 'roadInstance'
        }
      },
      // 2. Рух до сегмента дороги для будівництва
      {
        id: `final-move-to-road-segment-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'segmentPosition'
        }
      },
      // 3. Власне будівництво сегмента дороги
      {
        id: `build-road-segment-${Date.now()}`,
        type: 'build-road',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {
          roadId: context.targets?.roadId,
          segmentIndex: context.resolved?.nextSegment?.index
        },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          roadId: 'roadId',
          segmentIndex: 'nextSegment.index',
          position: 'segmentPosition'
        }
      }
    ]
  },

  // Building → Refill group (storage -> building)
  {
    id: 'building-refill',
    name: 'Building Refill',
    description: 'Deliver resources from global storage to building internal storage',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true,
    resolveParametersPipeline: [
      { id: 'buildingId', getterType: 'literal', args: [{ type: 'var', value: 'targets.buildingId' }], resolveWhen: 'before-command' },
      { id: 'plan', getterType: 'planBuildingTransfer', args: [ { type: 'var', value: 'targets.buildingId' } ], resolveWhen: 'before-command' },
      { id: 'buildingPosition', getterType: 'getObjectAccessPoint', args: [ {type:'var', value:'resolved.buildingId' }, {type:'var', value:'objectId'} ], resolveWhen: 'before-command' },
      { id: 'closestStorageId', getterType: 'getClosestStorage', args: [ { type: 'lit', value: { maxDistance: 200 } } ], resolveWhen: 'before-command' },
      { id: 'storagePosition', getterType: 'getObjectAccessPoint', args: [ { type:'var', value:'resolved.closestStorageId' }, {type:'var', value:'objectId'} ], resolveWhen: 'before-command' },
      { id: 'validatePlan', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.plan' } ], resolveWhen: 'before-command' },
      { id: 'planAmount', getterType: 'literal', args: [ { type:'var', value:'resolved.plan.amount' } ], resolveWhen: 'before-command' },
      { id: 'validateAmount', getterType: 'validate', args: [ { type:'lit', value:'resourceAmount' }, { type:'var', value:'resolved.planAmount' } ], resolveWhen: 'before-command' },
      { id: 'validateStorage', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.closestStorageId' } ], resolveWhen: 'before-command' },
      { id: 'validatePositions1', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.storagePosition' } ], resolveWhen: 'before-command' },
      { id: 'validatePositions2', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.buildingPosition' } ], resolveWhen: 'before-command' },
      { id: 'planResourcesToUnload', getterType: 'literal', args: [ { type:'var', value:'resolved.plan.resourcesToUnload' } ], resolveWhen: 'before-command' },
    ],
    tasksPipeline: (context): Command[] => {
      const resources = context.resolved?.plan?.resources || {};
      return [
        {
          id: `move-to-storage-${Date.now()}`,
          type: 'move-to', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { priority:'high' }, status:'pending', priority:1, createdAt: Date.now(),
          resolvedParamsMapping: { position: 'storagePosition' }
        },
        {
          id: `load-from-storage-${Date.now()}`,
          type: 'load-resources', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { resources }, status:'pending', priority:2, createdAt: Date.now(),
          resolvedParamsMapping: { targetId: 'closestStorageId' }
        },
        {
          id: `move-to-building-${Date.now()}`,
          type: 'move-to', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { priority:'high' }, status:'pending', priority:3, createdAt: Date.now(),
          resolvedParamsMapping: { position: 'buildingPosition' }
        },
        {
          id: `unload-to-building-${Date.now()}`,
          type: 'unload-resources', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { }, status:'pending', priority:4, createdAt: Date.now(),
          resolvedParamsMapping: { targetId: 'buildingId', resourcesToUnload: 'planResourcesToUnload' }
        }
      ];
    }
  },

  // Building → Collect group (building -> storage)
  {
    id: 'building-collect',
    name: 'Building Collect',
    description: 'Collect resources from building internal storage to global storage',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true,
    resolveParametersPipeline: [
      { id: 'buildingId', getterType: 'literal', args: [{ type: 'var', value: 'targets.buildingId' }], resolveWhen: 'before-command' },
      { id: 'plan', getterType: 'planBuildingTransfer', args: [ { type: 'var', value: 'targets.buildingId' } ], resolveWhen: 'before-command' },
      { id: 'buildingPosition', getterType: 'getObjectAccessPoint', args: [ {type:'var', value:'resolved.buildingId' }, {type:'var', value:'objectId'} ], resolveWhen: 'before-command' },
      { id: 'closestStorageId', getterType: 'getClosestStorage', args: [ { type: 'lit', value: { maxDistance: 200 } } ], resolveWhen: 'before-command' },
      { id: 'storagePosition', getterType: 'getObjectAccessPoint', args: [ { type:'var', value:'resolved.closestStorageId' }, {type:'var', value:'objectId'} ], resolveWhen: 'before-command' },
      { id: 'validatePlan', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.plan' } ], resolveWhen: 'before-command' },
      { id: 'planResourcesToUnload', getterType: 'literal', args: [ { type:'var', value:'resolved.plan.resourcesToUnload' } ], resolveWhen: 'before-command' },
    ],
    tasksPipeline: (context): Command[] => {
      const resources = context.resolved?.plan?.resources || {};
      const resourcesToUnload = context.resolved?.plan?.resourcesToUnload || {};
      return [
        {
          id: `move-to-building-${Date.now()}`,
          type: 'move-to', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { priority:'high' }, status:'pending', priority:1, createdAt: Date.now(),
          resolvedParamsMapping: { position: 'buildingPosition' }
        },
        {
          id: `load-from-building-${Date.now()}`,
          type: 'load-resources', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { resources }, status:'pending', priority:2, createdAt: Date.now(),
          resolvedParamsMapping: { targetId: 'buildingId' }
        },
        {
          id: `move-to-storage-${Date.now()}`,
          type: 'move-to', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { priority:'low' }, status:'pending', priority:3, createdAt: Date.now(),
          resolvedParamsMapping: { position: 'storagePosition' }
        },
        {
          id: `unload-to-storage-${Date.now()}`,
          type: 'unload-resources', targetId: undefined, position: {x:0,y:0,z:0}, parameters: { resourcesToUnload }, status:'pending', priority:4, createdAt: Date.now(),
          resolvedParamsMapping: { targetId: 'closestStorageId', resourcesToUnload: 'planResourcesToUnload' }
        }
      ];
    }
  },
  
  {
    id: 'charge-group',
    name: 'Charge',
    description: 'Move to charging station and charge',
    startCondition: null, // Завжди можна запустити
    endCondition: null,   // Завершується після зарядки
    loopCondition: null,  // Не повторюється
    isLoop: false, // Команди не повторюються
    resolveParametersPipeline: [
      {
        id: 'chargingStationId',
        getterType: 'getClosestChargingStation',
        args: [{type: 'lit', value: {maxDistance: 50}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'chargingStationPosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.chargingStationId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `move-to-charging-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 }, // Placeholder, to be resolved
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'chargingStationPosition'
        }
      },
      {
        id: `charge-${Date.now()}`,
        type: 'charge',
        targetId: undefined, // Placeholder, to be resolved
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'chargingStationId'
        }
      }
    ]
  },

  // Автоматична група зарядки
  {
    id: 'auto-charge',
    name: 'Auto Charge',
    description: 'Automatically charge when power is low',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: false,
    autoExecute: {
      condition: 'power-low',
      threshold: 2,        // Коли power < 0.2
      priority: 'interrupt'  // Перериває поточні команди
    },
    loopConditions: {
      maxIterations: 1,      // Тільки одна ітерація
      powerThreshold: 0.8    // Вихід коли power >= 0.8
    },
    resolveParametersPipeline: [
      {
        id: 'chargingStationId',
        getterType: 'getClosestChargingStation',
        args: [{type: 'lit', value: {maxDistance: 50}}],
        resolveWhen: 'group-start'
      },
      {
        id: 'chargingStationPosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.chargingStationId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'group-start'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `auto-move-to-charging-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'critical' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'chargingStationPosition'
        }
      },
      {
        id: `auto-charge-${Date.now()}`,
        type: 'charge',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'chargingStationId'
        }
      }
    ]
  },

  // Група для збору каменю у радіусі
  {
    id: 'gather-stone-radius',
    name: 'Gather Stone',
    description: 'Gather stone resources in radius',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true, // Повторюємо поки є ресурси
    ui: {
      scope: 'gather',
      category: 'stone',
      name: 'Gather Stone',
      description: 'Gather stone resources in radius'
    },
    resolveParametersPipeline: [
      {
        id: 'resourcesInRadius',
        getterType: 'getResourcesInRadius',
        args: [
          {type: 'lit', value: 'stone'},
          {type: 'var', value: 'targets.center'},
          {type: 'lit', value: 5}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'dronePosition',
        getterType: 'getCurrentObjectPosition',
        args: [],
        resolveWhen: 'before-command'
      },
      {
        id: 'sortedResourcesByDistance',
        getterType: 'sortObjectsByDistanceToDrone',
        args: [
          {type: 'var', value: 'resolved.resourcesInRadius'},
          {type: 'var', value: 'resolved.dronePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.sortedResourcesByDistance'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.sortedResourcesByDistance'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.firstResourceId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateFirstResourcePosition',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'objectExists'},
          {type: 'var', value: 'resolved.firstResourcePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `move-to-resource-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'firstResourcePosition'
        }
      },
      {
        id: `collect-resource-${Date.now()}`,
        type: 'collect-resource',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { amount: 100 },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'firstResourceId'
        },
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND, CommandFailureCode.TARGET_INACCESSIBLE]
      },
      {
        id: `return-to-storage-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'low' },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'storagePosition'
        }
      },
      {
        id: `unload-resources-${Date.now()}`,
        type: 'unload-resources',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 4,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'closestStorageId'
        }
      }
    ]
  },

  // Група для збору руди у радіусі
  {
    id: 'gather-ore-radius',
    name: 'Gather Ore',
    description: 'Gather ore resources in radius',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true, // Повторюємо поки є ресурси
    requirements: [
      {
        scope: 'resource',
        id: 'ore',
        level: 1  // Команда збору руди доступна після відкриття руди
      }
    ],
    ui: {
      scope: 'gather',
      category: 'ore',
      name: 'Gather Ore',
      description: 'Gather ore resources in radius'
    },
    resolveParametersPipeline: [
      {
        id: 'resourcesInRadius',
        getterType: 'getResourcesInRadius',
        args: [
          {type: 'lit', value: 'ore'},
          {type: 'var', value: 'targets.center'},
          {type: 'lit', value: 5}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'dronePosition',
        getterType: 'getCurrentObjectPosition',
        args: [],
        resolveWhen: 'before-command'
      },
      {
        id: 'sortedResourcesByDistance',
        getterType: 'sortObjectsByDistanceToDrone',
        args: [
          {type: 'var', value: 'resolved.resourcesInRadius'},
          {type: 'var', value: 'resolved.dronePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.sortedResourcesByDistance'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.sortedResourcesByDistance'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.firstResourceId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateFirstResourcePosition',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'objectExists'},
          {type: 'var', value: 'resolved.firstResourcePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `move-to-resource-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'firstResourcePosition'
        }
      },
      {
        id: `collect-resource-${Date.now()}`,
        type: 'collect-resource',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { amount: 100 },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'firstResourceId'
        },
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND, CommandFailureCode.TARGET_INACCESSIBLE]
      },
      {
        id: `return-to-storage-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'low' },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'storagePosition'
        }
      },
      {
        id: `unload-resources-${Date.now()}`,
        type: 'unload-resources',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 4,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'closestStorageId'
        }
      }
    ]
  },

  // Універсальна група для збору ресурсів у радіусі (залишаємо для загального використання)
  {
    id: 'gather-resource-radius',
    name: 'Gather Resource',
    description: 'Gather resources of specified type in radius',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true, // Повторюємо поки є ресурси
    resolveParametersPipeline: [
      {
        id: 'resourcesInRadius',
        getterType: 'getResourcesInRadius',
        args: [
          {type: 'var', value: 'parameters.resourceType'},
          {type: 'var', value: 'targets.center'},
          {type: 'lit', value: 5}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'dronePosition',
        getterType: 'getCurrentObjectPosition',
        args: [],
        resolveWhen: 'before-command'
      },
      {
        id: 'sortedResourcesByDistance',
        getterType: 'sortObjectsByDistanceToDrone',
        args: [
          {type: 'var', value: 'resolved.resourcesInRadius'},
          {type: 'var', value: 'resolved.dronePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.sortedResourcesByDistance'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.firstResourceId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateFirstResourcePosition',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'objectExists'},
          {type: 'var', value: 'resolved.firstResourcePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `move-to-resource-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'firstResourcePosition'
        }
      },
      {
        id: `collect-resource-${Date.now()}`,
        type: 'collect-resource',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { amount: 100 },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'firstResourceId'
        },
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND]
      },
      {
        id: `return-to-storage-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'low' },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'storagePosition'
        }
      },
      {
        id: `unload-resources-${Date.now()}`,
        type: 'unload-resources',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 4,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'closestStorageId'
        }
      }
    ]
  },

  // Група для збору біомаси у радіусі
  {
    id: 'gather-biomass-radius',
    name: 'Gather Biomass',
    description: 'Gather biomass resources in radius',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true, // Повторюємо поки є ресурси
    requirements: [
      {
        scope: 'resource',
        id: 'biomass',
        level: 1
      }
    ],
    ui: {
      scope: 'gather',
      category: 'biomass',
      name: 'Gather Biomass',
      description: 'Gather biomass resources in radius'
    },
    resolveParametersPipeline: [
      {
        id: 'resourcesInRadius',
        getterType: 'getResourcesInRadius',
        args: [
          {type: 'lit', value: 'biomass'},
          {type: 'var', value: 'targets.center'},
          {type: 'lit', value: 5}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'dronePosition',
        getterType: 'getCurrentObjectPosition',
        args: [],
        resolveWhen: 'before-command'
      },
      {
        id: 'sortedResourcesByDistance',
        getterType: 'sortObjectsByDistanceToDrone',
        args: [
          {type: 'var', value: 'resolved.resourcesInRadius'},
          {type: 'var', value: 'resolved.dronePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.sortedResourcesByDistance'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.sortedResourcesByDistance'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.firstResourceId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateFirstResourcePosition',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'objectExists'},
          {type: 'var', value: 'resolved.firstResourcePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `move-to-resource-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'firstResourcePosition'
        }
      },
      {
        id: `collect-resource-${Date.now()}`,
        type: 'collect-resource',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { amount: 100 },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'firstResourceId'
        },
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND]
      },
      {
        id: `return-to-storage-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'low' },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'storagePosition'
        }
      },
      {
        id: `unload-resources-${Date.now()}`,
        type: 'unload-resources',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 4,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'closestStorageId'
        }
      }
    ]
  },

  {
    id: 'gather-all-radius',
    name: 'Gather All',
    description: 'Gather all resources in radius',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true, // Повторюємо поки є ресурси
    ui: {
      scope: 'gather',
      category: 'all',
      name: 'Gather All',
      description: 'Gather all resources in radius'
    },
    resolveParametersPipeline: [
      {
        id: 'allResources',
        getterType: 'getResourcesInRadius',
        args: [
          {type: 'lit', value: 'resource'},
          {type: 'var', value: 'targets.center'},
          {type: 'lit', value: 5}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'dronePosition',
        getterType: 'getCurrentObjectPosition',
        args: [],
        resolveWhen: 'before-command'
      },
      {
        id: 'sortedResourcesByDistance',
        getterType: 'sortObjectsByDistanceToDrone',
        args: [
          {type: 'var', value: 'resolved.allResources'},
          {type: 'var', value: 'resolved.dronePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.sortedResourcesByDistance'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.sortedResourcesByDistance'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.firstResourceId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'validateFirstResourcePosition',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'objectExists'},
          {type: 'var', value: 'resolved.firstResourcePosition'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (_context): Command[] => [
      {
        id: `move-to-resource-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'firstResourcePosition'
        }
      },
      {
        id: `collect-resource-${Date.now()}`,
        type: 'collect-resource',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { amount: 100 },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'firstResourceId'
        },
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND]
      },
      {
        id: `return-to-storage-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'low' },
        status: 'pending',
        priority: 3,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'storagePosition'
        }
      },
      {
        id: `unload-resources-${Date.now()}`,
        type: 'unload-resources',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {},
        status: 'pending',
        priority: 4,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          targetId: 'closestStorageId'
        }
      }
    ]
  },

  // Група для будівництва
  {
    id: 'construction',
    name: 'Construction',
    description: 'Build a structure by gathering resources and constructing',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: false, // Не повторюємо - виконуємо один раз
    ui: {
      scope: 'build',
      category: 'construction',
      name: 'Build Structure',
      description: 'Gather resources and build a structure'
    },
    resolveParametersPipeline: [
      // ID будівлі
      {
        id: 'buildingId',
        getterType: 'literal',
        args: [{type: 'var', value: 'targets.buildingId'}],
        resolveWhen: 'before-command'
      },
      // Базові дані про будівлю
      {
        id: 'buildingInstance',
        getterType: 'getBuildingInstance',
        args: [{type: 'var', value: 'targets.buildingId'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'requiredResources',
        getterType: 'getBuildingRequiredResources',
        args: [{type: 'var', value: 'targets.buildingId'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'missingResources',
        getterType: 'getMissingResources',
        args: [{type: 'var', value: 'targets.buildingId'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'missingSum',
        getterType: 'getValuesSum',
        args: [{type: 'var', value: 'resolved.missingResources'}],
        resolveWhen: 'before-command'
      },
      // Ресурси які потрібно вивантажити (непотрібні для будівництва)
      {
        id: 'resourcesToUnload',
        getterType: 'getUnnecessaryResources',
        args: [
          {type: 'var', value: 'objectId'},
          {type: 'var', value: 'resolved.requiredResources'}
        ],
        resolveWhen: 'before-command'
      },
      // Найближчий склад
      {
        id: 'closestStorageId',
        getterType: 'getClosestStorage',
        args: [{type: 'lit', value: {maxDistance: 200}}],
        resolveWhen: 'before-command'
      },
      {
        id: 'storagePosition',
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'resolved.closestStorageId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      },
      // Позиція будівлі
      {
        id: 'buildingPosition',      
        getterType: 'getObjectAccessPoint',
        args: [
          {type: 'var', value: 'targets.buildingId'},
          {type: 'var', value: 'objectId'}
        ],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
      // 1. Цикл збору ресурсів (conditional-loop)
      {
        id: `construction-resource-loop-${Date.now()}`,
        type: 'conditional-loop',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {
          // Універсальні параметри умови
          condition: '>',
          value2: 1.e-10,
          // Команди циклу для збору ресурсів
          loopCommands: [
            // A) Рухаємося до складу
            {
              id: `move-to-storage-${Date.now()}`,
              type: 'move-to',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: { priority: 'high' },
              status: 'pending',
              priority: 1,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                position: 'storagePosition'
              }
            },
            // B) Вивантажуємо непотрібні ресурси
            {
              id: `unload-unnecessary-${Date.now()}`,
              type: 'unload-resources',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: {},
              status: 'pending',
              priority: 2,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                targetId: 'closestStorageId',
                resourcesToUnload: 'resourcesToUnload'
              }
            },
            // C) Завантажуємо потрібні ресурси
            {
              id: `load-needed-resources-${Date.now()}`,
              type: 'load-resources',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: {},
              status: 'pending',
              priority: 3,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                targetId: 'closestStorageId',
                resources: 'missingResources'  // Завантажуємо потрібні ресурси
              }
            },
            // D) Рухаємося до будівлі
            {
              id: `move-to-construction-${Date.now()}`,
              type: 'move-to',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: { priority: 'high' },
              status: 'pending',
              priority: 4,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                position: 'buildingPosition'
              }
            },
            // E) Вивантажуємо ресурси на будівлю
            {
              id: `unload-to-construction-${Date.now()}`,
              type: 'unload-resources',
              targetId: undefined,
              position: { x: 0, y: 0, z: 0 },
              parameters: {
                buildingId: context.targets?.buildingId
              },
              status: 'pending',
              priority: 5,
              createdAt: Date.now(),
              resolvedParamsMapping: {
                targetId: 'buildingId',  // Встановлюємо ціль - будівлю
                resourcesToUnload: 'missingResources'  // Вивантажуємо тільки потрібні ресурси
              }
            }
          ]
        },
        status: 'pending',
        priority: 1,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          value1: 'missingSum',
          missingResources: 'missingResources',
          requiredResources: 'requiredResources',
          closestStorageId: 'closestStorageId',
          buildingInstance: 'buildingInstance'
        }
      },
      // 2. Рух до будівлі для будівництва
      {
        id: `final-move-to-construction-${Date.now()}`,
        type: 'move-to',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: { priority: 'high' },
        status: 'pending',
        priority: 2,
        createdAt: Date.now(),
        resolvedParamsMapping: {
          position: 'buildingPosition'
        }
      },
      // 3. Власне будівництво
      {
        id: `build-structure-${Date.now()}`,
        type: 'build',
        targetId: undefined,
        position: { x: 0, y: 0, z: 0 },
        parameters: {
          buildingId: context.targets?.buildingId
        },
        status: 'pending',
        priority: 3,
        createdAt: Date.now()
      }
    ]
  }
];

/**
 * Отримати всі групи команд (без фільтрації по реквайрментах)
 * Для UI використовуйте getAvailableCommandGroups() з CommandGroupSystem
 */
export function getAllCommandGroups(): CommandGroup[] {
  return [...COMMAND_GROUPS];
}

/**
 * Отримати групу команд по ID
 */
export function getCommandGroup(id: string): CommandGroup | undefined {
  return COMMAND_GROUPS.find(group => group.id === id);
}

/**
 * Отримати автоматичні групи команд
 */
export function getAutoExecuteGroups(): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => group.autoExecute);
}

/**
 * Отримати групи команд з UI метаданими (без фільтрації по реквайрментах)
 * Для UI використовуйте getAvailableCommandGroups() з CommandGroupSystem та фільтруйте по ui
 */
export function getUIGroups(): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => group.ui);
}

/**
 * Отримати групи команд по scope (без фільтрації по реквайрментах)
 * Для UI використовуйте getAvailableCommandGroups() з CommandGroupSystem та фільтруйте по scope
 */
export function getGroupsByScope(scope: 'gather' | 'build' | 'none'): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => group.ui?.scope === scope);
}

/**
 * Отримати групи команд по scope та категорії (без фільтрації по реквайрментах)
 * Для UI використовуйте getAvailableCommandGroups() з CommandGroupSystem та фільтруйте по scope та category
 */
export function getGroupsByScopeAndCategory(scope: 'gather' | 'build' | 'none', category: string): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => 
    group.ui?.scope === scope && group.ui?.category === category
  );
}

// ==================== НОВІ UI ФУНКЦІЇ З РЕКВАЙРМЕНТАМИ ====================
// УВАГА: Ці функції потребують CommandGroupSystem для перевірки реквайрментів
// Використовуйте їх тільки якщо у вас є доступ до CommandGroupSystem

/**
 * Отримати доступні групи команд з UI метаданими (з урахуванням реквайрментів)
 * @param commandGroupSystem - екземпляр CommandGroupSystem для перевірки реквайрментів
 */
export function getAvailableUIGroups(commandGroupSystem: any): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => 
    group.ui && commandGroupSystem.isUnlocked(group.id)
  );
}

/**
 * Отримати доступні групи команд по scope (з урахуванням реквайрментів)
 * @param scope - scope групи команд
 * @param commandGroupSystem - екземпляр CommandGroupSystem для перевірки реквайрментів
 */
export function getAvailableGroupsByScope(scope: 'gather' | 'build' | 'none', commandGroupSystem: any): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => 
    group.ui?.scope === scope && commandGroupSystem.isUnlocked(group.id)
  );
}

/**
 * Отримати доступні групи команд по scope та категорії (з урахуванням реквайрментів)
 * @param scope - scope групи команд
 * @param category - категорія групи команд
 * @param commandGroupSystem - екземпляр CommandGroupSystem для перевірки реквайрментів
 */
export function getAvailableGroupsByScopeAndCategory(
  scope: 'gather' | 'build' | 'none', 
  category: string, 
  commandGroupSystem: any
): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => 
    group.ui?.scope === scope && 
    group.ui?.category === category && 
    commandGroupSystem.isUnlocked(group.id)
  );
}
