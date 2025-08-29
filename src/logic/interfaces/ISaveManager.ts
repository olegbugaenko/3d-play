import { SaveLoadManager } from '@save-load/save-load.types';

export interface ISaveManager extends SaveLoadManager {
  // Основні методи збереження/завантаження
  saveGame(slotId: number): void;
  loadGame(slotId: number): void;
  deleteSlot(slotId: number): boolean;
  
  // Отримання даних
  getSaveSlots(): Array<{ slot: number; timestamp: number; hasData: boolean }>;
  
  // Реєстрація менеджерів
  registerManager(name: string, manager: SaveLoadManager): void;
  
  // Додаткові властивості для Scene3D
  managers: Map<string, SaveLoadManager>;
  SAVE_KEY_PREFIX: string;
  VERSION: string;
  mapLogic: any;
  newGame(): void;
  getLoadOrder(): string[];
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
