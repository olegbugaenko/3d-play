import { UpgradeTypeData, UpgradeTypeId, UPGRADE_TYPE_IDS } from './upgrades.types';

const UPGRADE_ENTRIES: Array<[UpgradeTypeId, UpgradeTypeData]> = [
  [UPGRADE_TYPE_IDS.MINING_EFFICIENCY, {
    id: UPGRADE_TYPE_IDS.MINING_EFFICIENCY,
    name: 'Repair Drone Manipulator',
    description: 'Збільшує швидкість збору ресурсів',
    maxLevel: 5,
    modifier: {
      effect: {
        multiplier: {
          drone_collection_speed: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 0.5, // +50% на рівень
              B: 1
            }),
            deps: [] as string[]
          },
        }
      }
    },
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'mining-upgrade.png',
      color: '#FFD700' // Золотий для ефективності
    },
    cost: (level: number) => ({
      stone: 4 * (1.25 ** (level - 1)),
      energy: 4 * (1.25 ** (level - 1)),
    })
  }],

  [UPGRADE_TYPE_IDS.BATTERY_CAPACITY, {
    id: UPGRADE_TYPE_IDS.BATTERY_CAPACITY,
    name: 'Repair Battery',
    description: 'Збільшує ємність батареї дрона',
    maxLevel: 5,
    requirements: [
      {
        scope: 'upgrade',
        id: UPGRADE_TYPE_IDS.MINING_EFFICIENCY,
        level: 2,
      }
    ],
    modifier: {
      effect: {
        multiplier: {
          drone_max_battery: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 0.2, // +20% на рівень
              B: 1
            }),
            deps: [] as string[]
          },
        }
      }
    },
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'mining-upgrade.png',
      color: '#FFD700' // Золотий для ефективності
    },
    cost: (level: number) => ({
      stone: 5 * (1.2 ** (level - 1)),
      energy: 8 * (1.2 ** (level - 1)),
    })
  }],

  [UPGRADE_TYPE_IDS.BUILDING_CONSTRUCTIONS, {
    id: UPGRADE_TYPE_IDS.BUILDING_CONSTRUCTIONS,
    name: 'Building',
    description: 'Unlocks buildings',
    maxLevel: 1,
    modifier: {}, // Створення дрона обробляється окремим хендлером
    requirements: [
      {
        scope: 'upgrade',
        id: UPGRADE_TYPE_IDS.MINING_EFFICIENCY,
        level: 5,
      }
    ],
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'mining-upgrade.png',
      color: '#FFD700' // Золотий для ефективності
    },
    cost: (level: number) => ({
      stone: 5 * (1.2 ** (level - 1)),
      energy: 8 * (1.2 ** (level - 1)),
    })
  }],

  [UPGRADE_TYPE_IDS.REPAIR_GENERATOR, {
    id: UPGRADE_TYPE_IDS.REPAIR_GENERATOR,
    name: 'Repair Generator',
    description: 'Збільшує генерацію енергії',
    maxLevel: 5,
    requirements: [
      {
        scope: 'upgrade',
        id: UPGRADE_TYPE_IDS.MINING_EFFICIENCY,
        level: 2,
      }
    ],
    modifier: {
      resource: {
        income: {
          energy: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 0.05,
              B: 0
            }),
            deps: [] as string[]
          }
        }
      }
    },
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'battery-upgrade.png',
      color: '#32CD32' // Зелений для батареї
    },
    cost: (level: number) => ({
      energy: 5 * (1.2 ** (level - 1)),
      ore: 5 * (1.2 ** (level - 1)),
    })
  }],

  [UPGRADE_TYPE_IDS.REPAIR_BATTERY, {
    id: UPGRADE_TYPE_IDS.REPAIR_BATTERY,
    name: 'Repair Battery',
    description: 'Збільшує ємність батареї головної батареї на 10 на рівень',
    maxLevel: 10,
    requirements: [
      {
        scope: 'upgrade',
        id: UPGRADE_TYPE_IDS.MINING_EFFICIENCY,
        level: 3,
      }
    ],
    modifier: {
      resource: {
        cap: {
          energy: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 10, // +25 на рівень
              B: 0
            }),
            deps: [] as string[]
          }
        }
      }
    },
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'battery-upgrade.png',
      color: '#32CD32' // Зелений для батареї
    },
    cost: (level: number) => ({
      stone: 5 * (1.2 ** (level - 1)),
      ore: 5 * (1.2 ** (level - 1)),
    })
  }],

  [UPGRADE_TYPE_IDS.STORAGE_CAPACITY, {
    id: UPGRADE_TYPE_IDS.STORAGE_CAPACITY,
    name: 'Storage Capacity',
    description: 'Збільшує ємність складу ресурсів',
    maxLevel: 8,
    requirements: [
      {
        scope: 'upgrade',
        id: UPGRADE_TYPE_IDS.MINING_EFFICIENCY,
        level: 3,
      },
      {
        scope: 'upgrade',
        id: UPGRADE_TYPE_IDS.REPAIR_BATTERY,
        level: 1,
      }
    ],
    modifier: {
      resource: {
        cap: {
          stone: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 10, // +50 на рівень
              B: 0
            }),
            deps: [] as string[]
          },
          ore: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 10, // +50 на рівень
              B: 0
            }),
            deps: [] as string[]
          },
          biomass: {
            formula: (_data: any) => ({
              type: 'linear',
              A: 10, // +50 на рівень
              B: 0
            }),
            deps: [] as string[]
          }
        }
      }
    },
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'storage-upgrade.png',
      color: '#8B4513' // Коричневий для складу
    },
    cost: (level: number) => ({
      stone: 5 * (1.2 ** (level - 1)),
      ore: 5 * (1.2 ** (level - 1)),
    })
  }],

  // НОВІ АПГРЕЙДИ ПІСЛЯ КОНСТРУКШИНУ
  [UPGRADE_TYPE_IDS.REPAIR_KIT, {
    id: UPGRADE_TYPE_IDS.REPAIR_KIT,
    name: 'Repair Kit',
    description: 'Додає ще один дрон до колонії',
    maxLevel: 1,
    requirements: [
      {
        scope: 'building-instance',
        id: 'spaceship',
        level: 1
      }
    ],
    modifier: {},
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'repair-kit.png',
      color: '#FF6B6B' // Червоний для ремонту
    },
    cost: (_level: number) => ({
      stone: 30,
      ore: 20,
      energy: 15
    })
  }],

  [UPGRADE_TYPE_IDS.BIO_MODULE, {
    id: UPGRADE_TYPE_IDS.BIO_MODULE,
    name: 'Bio Module',
    description: 'Розблоковує біо-технології та нові будівлі',
    maxLevel: 1,
    requirements: [
      {
        scope: 'building-instance',
        id: 'spaceship',
        level: 1
      }
    ],
    modifier: {}, // Тільки розблоковує будівлі
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      iconName: 'bio-module.png',
      color: '#4ECDC4' // Тірквойзовий для біо-технологій
    },
    cost: (_level: number) => ({
      stone: 40,
      ore: 25,
      biomass: 20
    })
  }]
];

// База даних типів апгрейдів
export const UPGRADES_DB: Map<UpgradeTypeId, UpgradeTypeData> = new Map(UPGRADE_ENTRIES);

// Метод для отримання типу апгрейду за ID
export function getUpgradeType(id: UpgradeTypeId): UpgradeTypeData | undefined {
  return UPGRADES_DB.get(id);
}

// Метод для отримання всіх типів апгрейдів
export function getAllUpgradeTypes(): Map<UpgradeTypeId, UpgradeTypeData> {
  return new Map(UPGRADES_DB);
}

// Метод для перевірки чи існує тип апгрейду
export function isUpgradeTypeExists(id: UpgradeTypeId): boolean {
  return UPGRADES_DB.has(id);
}

// Метод для отримання кількості типів апгрейдів
export function getUpgradeTypesCount(): number {
  return UPGRADES_DB.size;
}
