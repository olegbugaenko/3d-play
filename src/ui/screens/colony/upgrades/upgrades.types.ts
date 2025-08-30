import { ResourceCheckResult } from '@logic/modules/resources/resource-types';
import { BonusDetail } from '@logic/systems/modifiers-system/bonus-system.types';

export interface UpgradeItem {
  typeId: string;
  name: string;
  description: string;
  currentLevel: number;
  maxLevel: number;
  unlocked: boolean;
  canUpgrade: boolean;
  nextLevelCost: Record<string, number>;
  canAfford: boolean;
  costCheck: ResourceCheckResult;
  bonusDetails: BonusDetail[];
}

export interface UpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  upgrades: UpgradeItem[];
  onPurchaseUpgrade: (typeId: string) => void;
}
