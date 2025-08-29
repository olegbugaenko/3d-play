import { CostFormula } from '@shared/types';
import { BonusSourceModifier } from '@systems/modifiers-system';

// Тип даних для апгрейду
export interface UpgradeTypeData {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  modifier: BonusSourceModifier;
  ui: {
    defaultScale: { x: number; y: number; z: number };
    rotationOffset: { x: number; y: number; z: number };
    iconName: string;
    color: string;
  };
  cost: CostFormula;
}

// Стан апгрейду (рівень та чи розблокований)
export interface UpgradeState {
  level: number;
  unlocked: boolean;
}

// Запит на ресурси для апгрейду
export interface UpgradeResourceRequest {
  upgradeId: string;
  resources: {
    energy?: number;
    stone?: number;
    ore?: number;
  };
}
