import { BuildingTypeData } from './buildings.types';
import { CostFormula } from '@shared/types';

// Формули вартості для різних типів будівель
const storageCostFormula: CostFormula = (level: number) => ({
  stone: 50 + (level - 1) * 25,
  ore: 20 + (level - 1) * 15
});

const chargingStationCostFormula: CostFormula = (level: number) => ({
  stone: 100 + (level - 1) * 50,
  ore: 50 + (level - 1) * 30,
  energy: 25 + (level - 1) * 10
});

// База даних типів будівель
export const BUILDINGS_DB: Map<string, BuildingTypeData> = new Map([
  ['storage', {
    id: 'storage',
    name: 'Склад',
    tags: ['storage'],
    description: 'Зберігає ресурси та збільшує ємність складу',
    maxLevel: 10,
    data: {
      obstacleSize: 1.5,
    },
    modifier: {
        
          resource: {
            cap: {
              stone: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 20,
                  B: 50
                }),
                deps: []
              },
              ore: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 20,
                  B: 50
                }),
                deps: []
              }
            }
          }
    },
    ui: {
      defaultScale: { x: 2.0, y: 1.0, z: 2.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      modelName: 'storage-building.glb',
      color: '#8B4513' // Коричневий для складу
    },
    cost: storageCostFormula
  }],
  
  ['chargingStation', {
    id: 'chargingStation',
    name: 'Зарядна станція',
    description: 'Заряджає дрони та збільшує ємність батареї',
    maxLevel: 5,
    tags: ['charge'],
    modifier: {
        resource: {
            cap: {
              energy: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 25,
                  B: 75
                }),
                deps: []
              },
            },
            income: {
              energy: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 0.1,
                  B: 0
                }),
                deps: []
              }
            }
          }
    },
    ui: {
      defaultScale: { x: 1.2, y: 1.0, z: 1.2 },
      rotationOffset: { x: 0, y: Math.PI / 4, z: 0 }, // Поворот на 45 градусів
      modelName: 'charging-station.glb',
      color: '#4169E1' // Синій для зарядки
    },
    data: {
        chargeRate: 0.5,
        obstacleSize: 1.5,
    },
    cost: chargingStationCostFormula
  }],

  ['solarPanel', {
    id: 'solarPanel',
    name: 'Solar Panel',
    description: 'Generates energy',
    maxLevel: 100,
    tags: ['charge'],
    modifier: {
        resource: {
            income: {
              energy: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 0.2,
                  B: 0
                }),
                deps: []
              }
            }
          }
    },
    ui: {
      defaultScale: { x: 1.2, y: 1.0, z: 1.2 },
      rotationOffset: { x: 0, y: Math.PI / 4, z: 0 }, // Поворот на 45 градусів
      modelName: 'charging-station.glb',
      color: '#4169E1' // Синій для зарядки
    },
    data: {
        obstacleSize: 1.5,
    },
    cost: (level: number) => ({
      stone: 20 + (level - 1) * 50,
      ore: 10 + (level - 1) * 30,
      energy: 10 + (level - 1) * 10
    })
  }]
]);

// Метод для отримання типу будівлі за ID
export function getBuildingType(id: string): BuildingTypeData | undefined {
  return BUILDINGS_DB.get(id);
}

// Метод для отримання всіх типів будівель
export function getAllBuildingTypes(): Map<string, BuildingTypeData> {
  return new Map(BUILDINGS_DB);
}

// Метод для перевірки чи існує тип будівлі
export function isBuildingTypeExists(id: string): boolean {
  return BUILDINGS_DB.has(id);
}

// Метод для отримання кількості типів будівель
export function getBuildingTypesCount(): number {
  return BUILDINGS_DB.size;
}
