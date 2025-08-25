import { CommandGroup } from '../command-group.types';
import { Command } from '../command.types';

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
