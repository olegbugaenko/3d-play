import { Vector3 } from '@utils/vector-math';
import { CostFormula } from '@shared/types';
import { BonusSourceModifier } from '@systems/modifiers-system';
import { Requirement } from '@systems/requirements';

// UI налаштування будівлі
export interface BuildingUI {
  defaultScale: Vector3;
  rotationOffset: Vector3;
  modelName?: string; // Назва моделі для імпорту
  color?: string; // Колір куба, якщо нема моделі
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
}

// Стан конкретної будівлі на карті
export interface BuildingInstance {
  id: string; // Унікальний ідентифікатор об'єкта на карті
  typeId: string; // Посилання на тип будівлі
  level: number;
  built: boolean;
  position?: Vector3;
}

// Дані для збереження/завантаження
export interface BuildingsManagerSaveData {
  buildingInstances: BuildingInstance[];
}
