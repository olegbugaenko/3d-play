import { SaveLoadManager } from '@save-load/save-load.types';
import {
  UpgradeTypeData,
  UpgradeState,
  UpgradeDataUI,
  UpgradeTypeId,
} from '@modules/upgrades/upgrades.types';
import { ResourceRequest } from '@resources/resource-types';

export interface IUpgradesManager extends SaveLoadManager {
  // Основні методи
  purchaseUpgrade(typeId: UpgradeTypeId): boolean;
  upgradeLevel(typeId: UpgradeTypeId): boolean;
  unlockUpgrade(typeId: UpgradeTypeId): boolean;

  // Отримання даних
  getUpgrade(typeId: UpgradeTypeId): UpgradeDataUI | null;
  getAllUpgrades(): Map<UpgradeTypeId, UpgradeState>;
  getUpgradeCost(typeId: UpgradeTypeId, level: number): ResourceRequest | undefined;
  getUpgradeState(typeId: UpgradeTypeId): UpgradeState | undefined;

  // Методи для реквайрментів
  isUnlocked(upgradeId: UpgradeTypeId): boolean;
  getAvailableUpgrades(): UpgradeTypeData[];

  // Додаткові методи
  registerUpgradeType(id: UpgradeTypeId, data: UpgradeTypeData): void;
  setInitialState(typeId: UpgradeTypeId, level?: number, unlocked?: boolean): void;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
