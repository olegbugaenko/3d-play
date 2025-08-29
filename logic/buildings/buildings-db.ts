import { BuildingTypeData, CostFormula } from './buildings.types';

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
    modifier: {
        
          resource: {
            cap: {
              stone: {
                formula: (data: any) => ({
                  type: 'linear',
                  A: 20,
                  B: 50
                }),
                deps: []
              },
              ore: {
                formula: (data: any) => ({
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
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
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
                formula: (data: any) => ({
                  type: 'linear',
                  A: 25,
                  B: 75
                }),
                deps: []
              },
            },
            income: {
              energy: {
                formula: (data: any) => ({
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
        chargeRate: 2.5,
    },
    cost: chargingStationCostFormula
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
