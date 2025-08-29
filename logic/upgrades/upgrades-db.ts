import { UpgradeTypeData, CostFormula } from './upgrades.types';

// Формули вартості для різних типів апгрейдів
const repairBatteryCostFormula: CostFormula = (level: number) => ({
  stone: 2 + (level  ) * 2,
  ore: 2 + (level ) * 2,
  energy: 2 + (level ) * 2
});

const miningEfficiencyCostFormula: CostFormula = (level: number) => ({
  stone: 2 + (level ) * 2,
  ore: 2 + (level ) * 2
});

const storageCapacityCostFormula: CostFormula = (level: number) => ({
  stone: 5 + (level ) * 20,
  ore: 5 + (level ) * 15
});

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
            formula: (data: any) => ({
              type: 'linear',
              A: 0.5, // +50% на рівень
              B: 1
            }),
            deps: []
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
      stone: 3 * (1.2 ** (level - 1)),
      energy: 10 * (1.2 ** (level - 1)),
    })
  }],

  ['batteryCapacity', {
    id: 'batteryCapacity1',
    name: 'Repair Battery',
    description: 'Збільшує ємність батареї дрона',
    maxLevel: 5,
    modifier: {
      effect: {
        multiplier: {
          drone_max_battery: {
            formula: (data: any) => ({
              type: 'linear',
              A: 0.2, // +20% на рівень
              B: 1
            }),
            deps: []
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
      ore: 5 * (1.2 ** (level - 1)),
      energy: 10 * (1.2 ** (level - 1)),
    })
  }],

  ['repairBattery', {
    id: 'repairBattery',
    name: 'Repair Battery',
    description: 'Збільшує ємність батареї головної батареї на 25 на рівень',
    maxLevel: 10,
    modifier: {
      resource: {
        cap: {
          energy: {
            formula: (data: any) => ({
              type: 'linear',
              A: 25, // +25 на рівень
              B: 0
            }),
            deps: []
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
    modifier: {
      resource: {
        cap: {
          stone: {
            formula: (data: any) => ({
              type: 'linear',
              A: 50, // +50 на рівень
              B: 100
            }),
            deps: []
          },
          ore: {
            formula: (data: any) => ({
              type: 'linear',
              A: 50, // +50 на рівень
              B: 100
            }),
            deps: []
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
    cost: storageCapacityCostFormula
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
