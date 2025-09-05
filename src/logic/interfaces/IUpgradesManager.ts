import { SaveLoadManager } from '@save-load/save-load.types';
import { UpgradeTypeData, UpgradeState, UpgradeDataUI } from '@modules/upgrades/upgrades.types';
import { ResourceRequest } from '@resources/resource-types';

export interface IUpgradesManager extends SaveLoadManager {
  // Основні методи
  purchaseUpgrade(instanceId: string): boolean;
  upgradeLevel(typeId: string): boolean;
  unlockUpgrade(typeId: string): boolean;
  
  // Отримання даних
  getUpgrade(typeId: string): UpgradeDataUI | null;
  getAllUpgrades(): Map<string, UpgradeState>;
  getUpgradeCost(typeId: string, level: number): ResourceRequest | undefined;
  getUpgradeState(typeId: string): UpgradeState | undefined;
  
  // Методи для реквайрментів
  isUnlocked(upgradeId: string): boolean;
  getAvailableUpgrades(): UpgradeTypeData[];
  
  // Додаткові методи
  registerUpgradeType(id: string, data: UpgradeTypeData): void;
  setInitialState(typeId: string, level?: number, unlocked?: boolean): void;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
