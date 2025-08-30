import { SaveLoadManager } from '@save-load/save-load.types';

export interface IUpgradesManager extends SaveLoadManager {
  // Основні методи
  purchaseUpgrade(instanceId: string): boolean;
  upgradeLevel(typeId: string): boolean;
  unlockUpgrade(typeId: string): boolean;
  
  // Отримання даних
  getUpgrade(typeId: string): any | null;
  getAllUpgrades(): Map<string, any>;
  getUpgradeCost(typeId: string, level: number): any | undefined;
  getUpgradeState(typeId: string): any | undefined;
  
  // Методи для реквайрментів
  isUnlocked(upgradeId: string): boolean;
  getAvailableUpgrades(): any[];
  
  // Додаткові методи
  registerUpgradeType(id: string, data: any): void;
  setInitialState(typeId: string, level?: number, unlocked?: boolean): void;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
