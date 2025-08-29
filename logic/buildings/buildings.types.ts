import { Vector3 } from '../utils/vector-math';

// Запит на ресурси для будівництва
export interface ResourceRequest {
  energy?: number;
  stone?: number;
  ore?: number;
}

// Формула вартості будівлі
export interface CostFormula {
  (level: number): ResourceRequest;
}

// Модифікатор бонусів для будівлі
export interface BuildingModifier {
  bonusEffects: string[]; // Які ефекти дає ця будівля
  bonusResources: string[]; // Які ресурси дає ця будівля
}

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
  modifier?: BuildingModifier; // Наш бонус сорс для будівлі, опціонально
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
