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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'targets.resource'}],
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.closestStorageId'}],
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
        groupRestartCodes: [CommandFailureCode.RESOURCE_FINISHED, CommandFailureCode.RESOURCE_NOT_FOUND]
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.chargingStationId'}],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.chargingStationId'}],
        resolveWhen: 'group-start'
      }
    ],
    tasksPipeline: (context): Command[] => [
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
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.resourcesInRadius'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.resourcesInRadius'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.firstResourceId'}],
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.closestStorageId'}],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
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

  // Група для збору руди у радіусі
  {
    id: 'gather-ore-radius',
    name: 'Gather Ore',
    description: 'Gather ore resources in radius',
    startCondition: null,
    endCondition: null,
    loopCondition: null,
    isLoop: true, // Повторюємо поки є ресурси
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
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.resourcesInRadius'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.resourcesInRadius'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.firstResourceId'}],
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.closestStorageId'}],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
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
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.resourcesInRadius'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.firstResourceId'}],
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.closestStorageId'}],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
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
        id: 'validateResourcesExist',
        getterType: 'validate',
        args: [
          {type: 'lit', value: 'arrayNotEmpty'},
          {type: 'var', value: 'resolved.allResources'}
        ],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourceId',
        getterType: 'getFirstOfList',
        args: [{type: 'var', value: 'resolved.allResources'}],
        resolveWhen: 'before-command'
      },
      {
        id: 'firstResourcePosition',
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.firstResourceId'}],
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
        getterType: 'getObjectPosition',
        args: [{type: 'var', value: 'resolved.closestStorageId'}],
        resolveWhen: 'before-command'
      }
    ],
    tasksPipeline: (context): Command[] => [
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
  }
];

/**
 * Отримати всі групи команд
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
 * Отримати групи команд з UI метаданими
 */
export function getUIGroups(): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => group.ui);
}

/**
 * Отримати групи команд по scope
 */
export function getGroupsByScope(scope: 'gather' | 'build' | 'none'): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => group.ui?.scope === scope);
}

/**
 * Отримати групи команд по scope та категорії
 */
export function getGroupsByScopeAndCategory(scope: 'gather' | 'build' | 'none', category: string): CommandGroup[] {
  return COMMAND_GROUPS.filter(group => 
    group.ui?.scope === scope && group.ui?.category === category
  );
}
