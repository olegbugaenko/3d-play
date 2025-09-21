import { BuildingTypeData, BuildingTypeId, RoadTypeData, RoadTypeId } from './buildings.types';
import { CostFormula } from '@shared/types/common.types';

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

// НОВІ формули вартості для біо-будівель
const bioGeneratorCostFormula: CostFormula = (level: number) => ({
  stone: 60 + (level - 1) * 30,
  ore: 30 + (level - 1) * 15,
  biomass: 15 + (level - 1) * 10
});

const bioIncubatorCostFormula: CostFormula = (level: number) => ({
  stone: 50 + (level - 1) * 25,
  ore: 25 + (level - 1) * 12,
  energy: 20 + (level - 1) * 8
});

// База даних типів будівель
export const BUILDINGS_DB: Map<BuildingTypeId, BuildingTypeData> = new Map([
  ['spaceship', {
    id: 'spaceship',
    name: 'Spaceship',
    tags: ['decor'],
    description: 'Зберігає ресурси та збільшує ємність складу',
    maxLevel: 1,
    data: {
      obstacleSize: 2.0,
    },
    modifier: {},
    ui: {
      defaultScale: { x: 2.0, y: 2.0, z: 2.0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      modelName: 'models/buildings/spaceship_v0.glb',
      hudOffsetY: 1,
    },
    cost: storageCostFormula
  }],

  
  ['charging_station_small', {
    id: 'charging_station_small',
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
                  B: 0
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
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 }, // Поворот на 45 градусів
      modelName: 'models/buildings/charging_station_small.glb',
      bottomAnchor: -0.15,
      hudOffsetY: 1,
    },
    data: {
        chargeRate: 0.5,
        obstacleSize: 1.5,
    },
    cost: chargingStationCostFormula
  }],

  ['minimal_storage', {
    id: 'minimal_storage',
    name: 'Small Storage',
    tags: ['storage'],
    description: 'Зберігає ресурси та збільшує ємність складу',
    maxLevel: 1,
    data: {
      obstacleSize: 1.0,
      chargeRate: 0.25,
    },
    modifier: {
        
          resource: {
            cap: {
              stone: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 0,
                  B: 20
                }),
                deps: []
              },
              ore: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 0,
                  B: 20
                }),
                deps: []
              },
              biomass: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 0,
                  B: 20
                }),
                deps: []
              },
            },
          }
    },
    ui: {
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: Math.PI, z: 0 },
      modelName: 'models/buildings/minimal_storage.glb',
      hudOffsetY: 1,
    },
    cost: storageCostFormula
  }],
  

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
                  B: 0
                }),
                deps: []
              },
              ore: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 20,
                  B: 0
                }),
                deps: []
              },
              biomass: {
                formula: (_data: any) => ({
                  type: 'linear',
                  A: 20,
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
      modelName: 'models/buildings/simple_storage.glb',
      hudOffsetY: 1,
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
                  B: 0
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
      defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
      rotationOffset: { x: 0, y: 0, z: 0 }, // Поворот на 45 градусів
      modelName: 'models/buildings/simple_charging_station.glb',
      bottomAnchor: -0.15,
      hudOffsetY: 1,
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
      color: '#4169E1', // Синій для зарядки
      hudOffsetY: 1,
    },
    data: {
        obstacleSize: 1.5,
    },
    cost: (level: number) => ({
      stone: 20 + (level - 1) * 50,
      ore: 10 + (level - 1) * 30,
      energy: 10 + (level - 1) * 10
    })
  }],

  // НОВІ БІО-БУДІВЛІ
  ['bioGenerator', {
    id: 'bioGenerator',
    name: 'Bio Generator',
    description: 'Спалює біомасу для виробництва енергії',
    maxLevel: 3,
    tags: ['generator', 'bio', 'building'],
    requirements: [
      {
        scope: 'upgrade',
        id: 'bioModule',
        level: 1
      }
    ],
    modifier: {
      resource: {
        income: {
          energy: {
            formula: (data: any) => ({
              type: 'linear',
              A: 0.5 * (data.level || 1), // 0.5 енергії за секунду на рівень
              B: 0
            }),
            deps: []
          }
        }
      }
    },
    ui: {
      defaultScale: { x: 1.2, y: 1.2, z: 1.2 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      modelName: 'models/buildings/bio_generator.glb',
      color: '#4ECDC4' // Тірквойзовий для біо-генератора
    },
    data: {
      obstacleSize: 1.5,
      // НОВЕ: Конфігурація внутрішнього складу
      internalStorageConfig: {
        biomass: {
          capacity: 20,
          defaultCurrent: 0,
          acceptsInput: true,
          providesOutput: false
        }
      },
      // НОВЕ: Споживання ресурсів (формула залежно від рівня)
      consumption: {
        biomass: (level: number) => 0.1 * level // Більше споживання на вищих рівнях
      }
    },
    isConstuctuble: true,
    cost: bioGeneratorCostFormula
  }],

  ['bioIncubator', {
    id: 'bioIncubator',
    name: 'Bio Incubator',
    description: 'Виробляє біомасу з органічних відходів',
    maxLevel: 3,
    tags: ['producer', 'bio', 'building'],
    requirements: [
      {
        scope: 'upgrade',
        id: 'bioModule',
        level: 1
      }
    ],
    modifier: {
      resource: {
        // ВАЖЛИВО: виробництво біомаси відбувається у ВНУТРІШНІЙ склад (internalProduction),
        // тому global income для біомаси тут не задаємо
        consumption: {
          energy: {
            formula: (data: any) => ({
              type: 'linear', 
              A: 0.2 * (data.level || 1), // 0.2 енергії за секунду на рівень
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
      modelName: 'models/buildings/bio_incubator.glb',
      color: '#90EE90' // Світло-зелений для біо-інкубатора
    },
    data: {
      obstacleSize: 1.2,
      // НОВЕ: Внутрішній склад для зберігання виробленої біомаси
      internalStorageConfig: {
        biomass: {
          capacity: 80, // Менший склад ніж у генератора
          defaultCurrent: 0,
          acceptsInput: false,
          providesOutput: true
        }
      },
      // НОВЕ: Виробництво у внутрішній склад
      internalProduction: {
        biomass: (level: number) => 0.3 * level // Базова швидкість виробництва біомаси
      }
    },
    isConstuctuble: true,
    cost: bioIncubatorCostFormula
  }]
]);

// Метод для отримання типу будівлі за ID
export function getBuildingType(id: BuildingTypeId): BuildingTypeData | undefined {
  return BUILDINGS_DB.get(id);
}

// Метод для отримання всіх типів будівель
export function getAllBuildingTypes(): Map<BuildingTypeId, BuildingTypeData> {
  return new Map(BUILDINGS_DB);
}

// Метод для перевірки чи існує тип будівлі
export function isBuildingTypeExists(id: BuildingTypeId): boolean {
  return BUILDINGS_DB.has(id);
}

// Метод для отримання кількості типів будівель
export function getBuildingTypesCount(): number {
  return BUILDINGS_DB.size;
}

// Формули вартості доріг (за метр)
const basicRoadCostFormula: CostFormula = (_level: number) => ({
  stone: 2,    // за метр
  ore: 0.5     // за метр
});

const reinforcedRoadCostFormula: CostFormula = (_level: number) => ({
  stone: 4,
  ore: 2,
  energy: 1
});

// База даних типів доріг
export const ROADS_DB: Map<RoadTypeId, RoadTypeData> = new Map([
  ['basic_road', {
    id: 'basic_road',
    name: 'Основна дорога',
    description: 'Базова дорога що пришвидшує рух дронів на 50%',
    width: 1.0,
    speedBonus: 1.5,
    cost: basicRoadCostFormula,
    isSegmented: true, // будується сегментами
    ui: {
      color: '#8B4513', // коричневий
      pattern: 'basic'
    },
    tags: ['road', 'infrastructure'],
    isConstuctuble: true, // можна будувати через UI
    requirements: [] // немає вимог для базової дороги
  }],
  
  ['reinforced_road', {
    id: 'reinforced_road',
    name: 'Посилена дорога',
    description: 'Покращена дорога що пришвидшує рух дронів на 100%',
    width: 1.5,
    speedBonus: 2.0,
    cost: reinforcedRoadCostFormula,
    isSegmented: true, // будується сегментами
    ui: {
      color: '#696969', // темно-сірий
      pattern: 'reinforced'
    },
    tags: ['road', 'infrastructure', 'advanced'],
    isConstuctuble: true, // можна будувати через UI
    requirements: [] // поки що немає вимог для посиленої дороги
  }]
]);

export function getRoadTypesCount(): number {
  return ROADS_DB.size;
}
