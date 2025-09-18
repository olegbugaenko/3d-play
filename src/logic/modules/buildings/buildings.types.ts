import { Vector3 } from '@utils/vector-math';
import { CostFormula } from '@shared/types/common.types';
import { BonusSourceModifier } from '@systems/modifiers-system';
import { Requirement } from '@systems/requirements';

// Типи доріг
export interface RoadTypeData {
  id: string;
  name: string;
  description: string;
  width: number;         // ширина дороги в метрах
  speedBonus: number;    // множник швидкості (1.5 = +50%)
  cost: CostFormula;     // вартість за метр
  ui: {
    color?: string;      // колір для відображення
    pattern?: string;    // патерн текстури
  };
  tags: string[];
}

// Інстанс дороги на карті
export interface RoadInstance {
  id: string;            // унікальний ID дороги
  typeId: string;        // тип дороги
  path: Vector3[];       // масив точок шляху
  built: boolean;        // чи побудована дорога
  totalLength: number;   // загальна довжина в метрах
  constructionProgress?: number; // прогрес будівництва (0-1)
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
  id: string; // ID типу будівлі (НЕ ідентифікатор об'єкта на карті)
  modifier?: BonusSourceModifier; // Наш бонус сорс для будівлі, опціонально
  requirements?: Requirement[]; // Реквайрменти для будівництва
  ui: BuildingUI;
  cost: CostFormula;
  maxLevel: number;
  name: string;
  description: string;
  tags: string[];
  data?: Record<string, any>;
  maxQuantity?: number;
}

// Стан конкретної будівлі на карті
export interface BuildingInstance {
  id: string; // Унікальний ідентифікатор об'єкта на карті
  typeId: string; // Посилання на тип будівлі
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
