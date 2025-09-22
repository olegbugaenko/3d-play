import { CommandGroup } from '../command-group.types';
import { CommandFailureCode } from '../command.types';
import { sequence, loop, action, condition } from '../plans/PlanBuilder';
import { buildCommand } from '../plans/PlanCommandFactory';

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
    plan: sequence('collect-resource-plan', [
      action('move-to-resource', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 1,
          parameters: { priority: 'high' },
          targetId: ctx.context.targets.resource,
          resolvedParamsMapping: {
            position: 'resourcePosition'
          }
        })
      ),
      action('collect-resource', ctx =>
        buildCommand(ctx, 'collect-resource', {
          priority: 2,
          targetId: ctx.context.targets.resource,
          parameters: {
            amount: ctx.context.parameters?.amount || 100
          },
          groupRestartCodes: [
            CommandFailureCode.RESOURCE_FINISHED,
            CommandFailureCode.RESOURCE_NOT_FOUND,
            CommandFailureCode.TARGET_INACCESSIBLE
          ]
        })
      ),
      action('return-to-base', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 3,
          parameters: { priority: 'low' },
          resolvedParamsMapping: {
            position: 'storagePosition'
          }
        })
      ),
      action('unload-resources', ctx =>
        buildCommand(ctx, 'unload-resources', {
          priority: 4,
          resolvedParamsMapping: {
            targetId: 'closestStorageId'
          }
        })
      )
    ])
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
    plan: sequence('road-construction-plan', [
      loop(
        'road-construction-loop',
        ctx => {
          const nextSegment = ctx.getResolvedValue<unknown>('nextSegment');
          return nextSegment != null;
        },
        [
          loop(
            'road-resource-loop',
            ctx => {
              const missingSum = ctx.getResolvedValue<number>('missingSum') || 0;
              return missingSum > 1e-10;
            },
            [
              action('move-to-storage', ctx =>
                buildCommand(ctx, 'move-to', {
                  priority: 1,
                  parameters: { priority: 'high' },
                  resolvedParamsMapping: {
                    position: 'storagePosition'
                  }
                })
              ),
              action('unload-unnecessary', ctx =>
                buildCommand(ctx, 'unload-resources', {
                  priority: 2,
                  resolvedParamsMapping: {
                    targetId: 'closestStorageId',
                    resourcesToUnload: 'resourcesToUnload'
                  }
                })
              ),
              action('load-needed-resources', ctx =>
                buildCommand(ctx, 'load-resources', {
                  priority: 3,
                  resolvedParamsMapping: {
                    targetId: 'closestStorageId',
                    resources: 'missingResources'
                  }
                })
              ),
              action('move-to-road-segment', ctx =>
                buildCommand(ctx, 'move-to', {
                  priority: 4,
                  parameters: { priority: 'high' },
                  resolvedParamsMapping: {
                    position: 'segmentPosition'
                  }
                })
              ),
              action('unload-to-road-segment', ctx =>
                buildCommand(ctx, 'unload-resources', {
                  priority: 5,
                  parameters: {
                    roadId: ctx.context.targets?.roadId,
                    segmentIndex: ctx.context.resolved?.nextSegment?.index
                  },
                  resolvedParamsMapping: {
                    targetId: 'roadId',
                    resourcesToUnload: 'missingResources'
                  }
                })
              )
            ]
          ),
          action('final-move-to-road-segment', ctx =>
            buildCommand(ctx, 'move-to', {
              priority: 2,
              parameters: { priority: 'high' },
              resolvedParamsMapping: {
                position: 'segmentPosition'
              }
            })
          ),
          action('build-road-segment', ctx =>
            buildCommand(ctx, 'build-road', {
              priority: 3,
              parameters: {
                roadId: ctx.context.targets?.roadId,
                segmentIndex: ctx.context.resolved?.nextSegment?.index
              },
              resolvedParamsMapping: {
                roadId: 'roadId',
                segmentIndex: 'nextSegment.index',
                position: 'segmentPosition'
              }
            })
          )
        ]
      )
    ])
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
    plan:  loop(
      'building-refill-plan',
      ctx => {
        const validation = ctx.getResolvedValue<{ success: boolean }>('validateAmount');
        return !validation || validation.success;
      }, [
      action('move-to-storage', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 1,
          parameters: { priority: 'high' },
          resolvedParamsMapping: { position: 'storagePosition' }
        })
      ),
      action('load-from-storage', ctx =>
        buildCommand(ctx, 'load-resources', {
          priority: 2,
          parameters: { resources: ctx.context.resolved?.plan?.resources || {} },
          resolvedParamsMapping: { targetId: 'closestStorageId' }
        })
      ),
      action('move-to-building', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 3,
          parameters: { priority: 'high' },
          resolvedParamsMapping: { position: 'buildingPosition' }
        })
      ),
      action('unload-to-building', ctx =>
        buildCommand(ctx, 'unload-resources', {
          priority: 4,
          resolvedParamsMapping: {
            targetId: 'buildingId',
            resourcesToUnload: 'planResourcesToUnload'
          }
        })
      )
    ])
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
      { id: 'planAmount', getterType: 'literal', args: [ { type:'var', value:'resolved.plan.amount' } ], resolveWhen: 'before-command' },
      { id: 'validateAmount', getterType: 'validate', args: [ { type:'lit', value:'resourceAmount' }, { type:'var', value:'resolved.planAmount' } ], resolveWhen: 'before-command' },
      { id: 'validateStorage', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.closestStorageId' } ], resolveWhen: 'before-command' },
      { id: 'validatePositions1', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.storagePosition' } ], resolveWhen: 'before-command' },
      { id: 'validatePositions2', getterType: 'validate', args: [ { type:'lit', value:'objectExists' }, { type:'var', value:'resolved.buildingPosition' } ], resolveWhen: 'before-command' },
      { id: 'planResourcesToUnload', getterType: 'literal', args: [ { type:'var', value:'resolved.plan.resourcesToUnload' } ], resolveWhen: 'before-command' },
      { id: 'planHasStorageCapacity', getterType: 'literal', args: [ { type:'var', value:'resolved.plan.hasStorageCapacity' } ], resolveWhen: 'before-command' },
    ],
    plan: loop('building-collect-plan', ctx => {
      const validation = ctx.getResolvedValue<{ success: boolean }>('validateAmount');
      const resourcesToUnload = ctx.getResolvedValue<Record<string, number> | undefined>('planResourcesToUnload') || {};
      const hasResourcesToUnload = Object.values(resourcesToUnload).some(value => Number(value) > 1.e-10);
      const hasStorageCapacity = ctx.getResolvedValue<boolean>('planHasStorageCapacity');
      
      if (hasResourcesToUnload) {
        if (hasStorageCapacity === false) {
          return false;
        }
        return true;
      }
      return !validation || validation.success;
    }, [
      condition('building-collect-should-load', ctx => {
        const amount = ctx.getResolvedValue<number>('planAmount');
        return typeof amount === 'number' && amount > 0;
      }, [
        action('move-to-building', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 1,
            parameters: { priority: 'high' },
            resolvedParamsMapping: { position: 'buildingPosition' }
          })
        ),
        action('load-from-building', ctx =>
          buildCommand(ctx, 'load-resources', {
            priority: 2,
            parameters: { resources: ctx.context.resolved?.plan?.resources || {} },
            resolvedParamsMapping: { targetId: 'buildingId' }
          })
        )
      ]),
      action('move-to-storage', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 3,
          parameters: { priority: 'low' },
          resolvedParamsMapping: { position: 'storagePosition' }
        })
      ),
      action('unload-to-storage', ctx =>
        buildCommand(ctx, 'unload-resources', {
          priority: 4,
          parameters: { resourcesToUnload: ctx.context.resolved?.plan?.resourcesToUnload || {} },
          resolvedParamsMapping: { targetId: 'closestStorageId', resourcesToUnload: 'planResourcesToUnload' }
        })
      )
    ])
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
    plan: sequence('charge-plan', [
      action('move-to-charging', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 1,
          parameters: { priority: 'high' },
          resolvedParamsMapping: { position: 'chargingStationPosition' }
        })
      ),
      action('charge', ctx =>
        buildCommand(ctx, 'charge', {
          priority: 2,
          resolvedParamsMapping: { targetId: 'chargingStationId' }
        })
      )
    ])
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
    plan: sequence('auto-charge-plan', [
      action('auto-move-to-charging', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 1,
          parameters: { priority: 'critical' },
          resolvedParamsMapping: { position: 'chargingStationPosition' }
        })
      ),
      action('auto-charge', ctx =>
        buildCommand(ctx, 'charge', {
          priority: 2,
          resolvedParamsMapping: { targetId: 'chargingStationId' }
        })
      )
    ])
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
    plan: loop(
      'gather-stone-loop',
      ctx => {
        const validation = ctx.getResolvedValue<{ success: boolean }>('validateResourcesExist');
        return !validation || validation.success;
      },
      [
        action('move-to-resource', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 1,
            parameters: { priority: 'high' },
            resolvedParamsMapping: { position: 'firstResourcePosition' }
          })
        ),
        action('collect-resource', ctx =>
          buildCommand(ctx, 'collect-resource', {
            priority: 2,
            parameters: { amount: 100 },
            resolvedParamsMapping: { targetId: 'firstResourceId' },
            groupRestartCodes: [
              CommandFailureCode.RESOURCE_FINISHED,
              CommandFailureCode.RESOURCE_NOT_FOUND,
              CommandFailureCode.TARGET_INACCESSIBLE
            ]
          })
        ),
        action('return-to-storage', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 3,
            parameters: { priority: 'low' },
            resolvedParamsMapping: { position: 'storagePosition' }
          })
        ),
        action('unload-resources', ctx =>
          buildCommand(ctx, 'unload-resources', {
            priority: 4,
            resolvedParamsMapping: { targetId: 'closestStorageId' }
          })
        )
      ]
    )
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
    plan: loop(
      'gather-ore-loop',
      ctx => {
        const validation = ctx.getResolvedValue<{ success: boolean }>('validateResourcesExist');
        return !validation || validation.success;
      },
      [
        action('move-to-resource', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 1,
            parameters: { priority: 'high' },
            resolvedParamsMapping: { position: 'firstResourcePosition' }
          })
        ),
        action('collect-resource', ctx =>
          buildCommand(ctx, 'collect-resource', {
            priority: 2,
            parameters: { amount: 100 },
            resolvedParamsMapping: { targetId: 'firstResourceId' },
            groupRestartCodes: [
              CommandFailureCode.RESOURCE_FINISHED,
              CommandFailureCode.RESOURCE_NOT_FOUND,
              CommandFailureCode.TARGET_INACCESSIBLE
            ]
          })
        ),
        action('return-to-storage', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 3,
            parameters: { priority: 'low' },
            resolvedParamsMapping: { position: 'storagePosition' }
          })
        ),
        action('unload-resources', ctx =>
          buildCommand(ctx, 'unload-resources', {
            priority: 4,
            resolvedParamsMapping: { targetId: 'closestStorageId' }
          })
        )
      ]
    )
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
    plan: loop(
      'gather-resource-loop',
      ctx => {
        const validation = ctx.getResolvedValue<{ success: boolean }>('validateResourcesExist');
        return !validation || validation.success;
      },
      [
        action('move-to-resource', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 1,
            parameters: { priority: 'high' },
            resolvedParamsMapping: { position: 'firstResourcePosition' }
          })
        ),
        action('collect-resource', ctx =>
          buildCommand(ctx, 'collect-resource', {
            priority: 2,
            parameters: { amount: 100 },
            resolvedParamsMapping: { targetId: 'firstResourceId' },
            groupRestartCodes: [
              CommandFailureCode.RESOURCE_FINISHED,
              CommandFailureCode.RESOURCE_NOT_FOUND
            ]
          })
        ),
        action('return-to-storage', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 3,
            parameters: { priority: 'low' },
            resolvedParamsMapping: { position: 'storagePosition' }
          })
        ),
        action('unload-resources', ctx =>
          buildCommand(ctx, 'unload-resources', {
            priority: 4,
            resolvedParamsMapping: { targetId: 'closestStorageId' }
          })
        )
      ]
    )
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
    plan: loop(
      'gather-biomass-loop',
      ctx => {
        const validation = ctx.getResolvedValue<{ success: boolean }>('validateResourcesExist');
        return !validation || validation.success;
      },
      [
        action('move-to-resource', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 1,
            parameters: { priority: 'high' },
            resolvedParamsMapping: { position: 'firstResourcePosition' }
          })
        ),
        action('collect-resource', ctx =>
          buildCommand(ctx, 'collect-resource', {
            priority: 2,
            parameters: { amount: 100 },
            resolvedParamsMapping: { targetId: 'firstResourceId' },
            groupRestartCodes: [
              CommandFailureCode.RESOURCE_FINISHED,
              CommandFailureCode.RESOURCE_NOT_FOUND
            ]
          })
        ),
        action('return-to-storage', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 3,
            parameters: { priority: 'low' },
            resolvedParamsMapping: { position: 'storagePosition' }
          })
        ),
        action('unload-resources', ctx =>
          buildCommand(ctx, 'unload-resources', {
            priority: 4,
            resolvedParamsMapping: { targetId: 'closestStorageId' }
          })
        )
      ]
    )
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
    plan: loop(
      'gather-all-loop',
      ctx => {
        const validation = ctx.getResolvedValue<{ success: boolean }>('validateResourcesExist');
        return !validation || validation.success;
      },
      [
        action('move-to-resource', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 1,
            parameters: { priority: 'high' },
            resolvedParamsMapping: { position: 'firstResourcePosition' }
          })
        ),
        action('collect-resource', ctx =>
          buildCommand(ctx, 'collect-resource', {
            priority: 2,
            parameters: { amount: 100 },
            resolvedParamsMapping: { targetId: 'firstResourceId' },
            groupRestartCodes: [
              CommandFailureCode.RESOURCE_FINISHED,
              CommandFailureCode.RESOURCE_NOT_FOUND
            ]
          })
        ),
        action('return-to-storage', ctx =>
          buildCommand(ctx, 'move-to', {
            priority: 3,
            parameters: { priority: 'low' },
            resolvedParamsMapping: { position: 'storagePosition' }
          })
        ),
        action('unload-resources', ctx =>
          buildCommand(ctx, 'unload-resources', {
            priority: 4,
            resolvedParamsMapping: { targetId: 'closestStorageId' }
          })
        )
      ]
    )
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
    plan: sequence('construction-plan', [
      loop(
        'construction-resource-loop',
        ctx => {
          const missingSum = ctx.getResolvedValue<number>('missingSum') || 0;
          return missingSum > 1e-10;
        },
        [
          action('move-to-storage', ctx =>
            buildCommand(ctx, 'move-to', {
              priority: 1,
              parameters: { priority: 'high' },
              resolvedParamsMapping: { position: 'storagePosition' }
            })
          ),
          action('unload-unnecessary', ctx =>
            buildCommand(ctx, 'unload-resources', {
              priority: 2,
              resolvedParamsMapping: {
                targetId: 'closestStorageId',
                resourcesToUnload: 'resourcesToUnload'
              }
            })
          ),
          action('load-needed-resources', ctx =>
            buildCommand(ctx, 'load-resources', {
              priority: 3,
              resolvedParamsMapping: {
                targetId: 'closestStorageId',
                resources: 'missingResources'
              }
            })
          ),
          action('move-to-construction', ctx =>
            buildCommand(ctx, 'move-to', {
              priority: 4,
              parameters: { priority: 'high' },
              resolvedParamsMapping: { position: 'buildingPosition' }
            })
          ),
          action('unload-to-construction', ctx =>
            buildCommand(ctx, 'unload-resources', {
              priority: 5,
              parameters: { buildingId: ctx.context.targets?.buildingId },
              resolvedParamsMapping: {
                targetId: 'buildingId',
                resourcesToUnload: 'missingResources'
              }
            })
          )
        ]
      ),
      action('final-move-to-construction', ctx =>
        buildCommand(ctx, 'move-to', {
          priority: 2,
          parameters: { priority: 'high' },
          resolvedParamsMapping: { position: 'buildingPosition' }
        })
      ),
      action('build-structure', ctx =>
        buildCommand(ctx, 'build', {
          priority: 3,
          parameters: { buildingId: ctx.context.targets?.buildingId }
        })
      )
    ])
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
