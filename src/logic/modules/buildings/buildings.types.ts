import { Vector3 } from '@utils/vector-math';
import { CostFormula } from '@shared/types/common.types';
import { BonusSourceModifier } from '@systems/modifiers-system';
import { Requirement } from '@systems/requirements';

// -----------------------------------------------------------------------------
//  Building & road identifiers
// -----------------------------------------------------------------------------

export const BUILDING_TYPE_IDS = {
  SPACESHIP: 'spaceship',
  CHARGING_STATION_SMALL: 'charging_station_small',
  MINIMAL_STORAGE: 'minimal_storage',
  STORAGE: 'storage',
  CHARGING_STATION: 'chargingStation',
  SOLAR_PANEL: 'solarPanel',
  BIO_GENERATOR: 'bioGenerator',
  BIO_INCUBATOR: 'bioIncubator',
} as const;

export type BuildingTypeId = typeof BUILDING_TYPE_IDS[keyof typeof BUILDING_TYPE_IDS];

export const ROAD_TYPE_IDS = {
  BASIC: 'basic_road',
  REINFORCED: 'reinforced_road',
} as const;

export type RoadTypeId = typeof ROAD_TYPE_IDS[keyof typeof ROAD_TYPE_IDS];

// Типи доріг
export interface RoadTypeData {
  id: RoadTypeId;
  name: string;
  description: string;
  width: number;         // ширина дороги в метрах
  speedBonus: number;    // множник швидкості (1.5 = +50%)
  cost: CostFormula;     // вартість за метр
  isSegmented: boolean;  // чи будується сегментами (дороги, ЛЕПи, тощо)
  ui: {
    color?: string;      // колір для відображення
    pattern?: string;    // патерн текстури
  };
  tags: string[];
  maxQuantity?: number;  // максимальна кількість (опціонально)
  requirements?: Requirement[]; // вимоги для будівництва
  isConstuctuble?: boolean; // чи можна будувати через UI
}

// Стан сегмента дороги
export type RoadSegmentState = 'planned' | 'under_construction' | 'completed';

// Сегмент дороги
export interface RoadSegmentInstance {
  id: string;                    // "road_123_segment_5"
  startPoint: Vector3;           // початкова точка сегмента
  endPoint: Vector3;             // кінцева точка сегмента
  buildingState: RoadSegmentState; // стан будівництва
  constructionProgress: number;   // прогрес будівництва (0-1)
  requiredResources: Record<string, number>; // потрібні ресурси
  deliveredResources: Record<string, number>; // доставлені ресурси
  length: number;                // довжина сегмента в метрах
}

// Дані для snap до існуючої дороги
export interface RoadSnapData {
  roadId: string;
  segmentIndex: number;
  edgeIndex: number; // 0=start, 1=end, 2=left, 3=right
  edgeName: string;   // 'start', 'end', 'left', 'right'
  edgePoint: Vector3; // точка на ребрі, де відбувся snap (центр/проекція)
  cursorPoint: Vector3; // реальна точка курсора до snap (для вибору start/end пари)
}

// Інстанс дороги на карті
export interface RoadInstance {
  id: string;            // унікальний ID дороги
  typeId: RoadTypeId;    // тип дороги
  path: Vector3[];       // масив точок шляху (для зворотної сумісності)
  built: boolean;        // чи побудована дорога (true якщо всі сегменти completed)
  totalLength: number;   // загальна довжина в метрах
  constructionProgress?: number; // прогрес будівництва (0-1)
  segments: RoadSegmentInstance[]; // НОВИЙ: деталізація сегментів
  plannedOnly?: boolean; // НОВИЙ: чи це лише план (не почато будівництво)
  snapData?: {           // НОВИЙ: дані для snap до існуючих доріг
    startSnap?: RoadSnapData;
    endSnap?: RoadSnapData;
  };
}

// UI налаштування будівлі
export interface BuildingUI {
  defaultScale: Vector3;
  rotationOffset: Vector3;
  modelName?: string; // Назва моделі для імпорту
  color?: string; // Колір куба, якщо нема моделі
  bottomAnchor?: number;
}

// Дані типу будівлі з БД
export interface BuildingTypeData {
  id: BuildingTypeId; // ID типу будівлі (НЕ ідентифікатор об'єкта на карті)
  modifier?: BonusSourceModifier; // Наш бонус сорс для будівлі, опціонально
  requirements?: Requirement[]; // Реквайрменти для будівництва
  ui: BuildingUI;
  cost: CostFormula;
  maxLevel: number;
  name: string;
  description: string;
  tags: string[];
  data?: Record<string, any>;
  isSegmented?: boolean; // чи будується сегментами (false для звичайних будівель)
  maxQuantity?: number;
  isConstuctuble?: boolean;
}

// Стан конкретної будівлі на карті
export interface BuildingInstance {
  id: string; // Унікальний ідентифікатор об'єкта на карті
  typeId: BuildingTypeId; // Посилання на тип будівлі
  level: number;
  built: boolean;
  position?: Vector3;
  // Нові поля для планування будівництва
  constructionProgress?: number; // Прогрес будівництва (0-1)
  resourcesCollected?: Record<string, number>; // Зібрані ресурси для будівництва
  
  // НОВЕ: Внутрішні склади будівель
  internalStorage?: Record<string, {
    capacity: number;
    current: number;
    acceptsInput?: boolean;
    providesOutput?: boolean;
  }>;
  
  // НОВЕ: Стан функціонування
  isFunctional?: boolean;
  lastUpdateTime?: number;
}

// Дані для збереження/завантаження
export interface BuildingsManagerSaveData {
  buildingInstances: BuildingInstance[];
  roadInstances: RoadInstance[];
}
