import { UpgradeTypeData } from './upgrades.types';


// База даних типів апгрейдів
export const UPGRADES_DB: Map<string, UpgradeTypeData> = new Map([
  
  ['miningEfficiency1', {
    id: 'miningEfficiency1',
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

  ['batteryCapacity', {
    id: 'batteryCapacity1',
    name: 'Repair Battery',
    description: 'Збільшує ємність батареї дрона',
    maxLevel: 5,
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
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

  ['building_constructions', {
    id: 'building_constructions',
    name: 'Building',
    description: 'Unlocks buildings',
    maxLevel: 1,
    modifier: {},
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
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

  ['repairGenerator', {
    id: 'repairGenerator',
    name: 'Repair Generator',
    description: 'Збільшує генерацію енергії',
    maxLevel: 5,
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
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

  ['repairBattery', {
    id: 'repairBattery',
    name: 'Repair Battery',
    description: 'Збільшує ємність батареї головної батареї на 10 на рівень',
    maxLevel: 10,
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
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
  
  ['storageCapacity', {
    id: 'storageCapacity',
    name: 'Storage Capacity',
    description: 'Збільшує ємність складу ресурсів',
    maxLevel: 8,
    requirements: [
      {
        scope: 'upgrade',
        id: 'miningEfficiency1',
        level: 3,
      },
      {
        scope: 'upgrade',
        id: 'repairBattery',
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
  }]
]);

// Метод для отримання типу апгрейду за ID
export function getUpgradeType(id: string): UpgradeTypeData | undefined {
  return UPGRADES_DB.get(id);
}

// Метод для отримання всіх типів апгрейдів
export function getAllUpgradeTypes(): Map<string, UpgradeTypeData> {
  return new Map(UPGRADES_DB);
}

// Метод для перевірки чи існує тип апгрейду
export function isUpgradeTypeExists(id: string): boolean {
  return UPGRADES_DB.has(id);
}

// Метод для отримання кількості типів апгрейдів
export function getUpgradeTypesCount(): number {
  return UPGRADES_DB.size;
}
