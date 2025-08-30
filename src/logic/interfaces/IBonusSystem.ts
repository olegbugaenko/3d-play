export interface IBonusSystem {
  // Основні методи
  getResourceValue(resourceId: string): any;
  buildDependencyGraph(): void;
  
  // Реєстрація джерел
  registerSource(id: string, data: any): void;
  setSourceState(id: string, level: number, efficiency?: number): void;
  updateBonusSourceLevel(sourceId: string, level: number): void;
  
  // Отримання ефектів
  getEffectValue(effectId: string): number;
  
  // Отримання деталей бонусів
  getBonusDetails(bonusSourceId: string): any[];
  
  // Системні методи
  reset(): void;
}
