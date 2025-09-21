import { ResourceRequest } from '@resources/resource-types';
import { CostFormula } from '@shared/types/common.types';
import { BonusSourceModifier } from '@systems/modifiers-system';
import { Requirement } from '@systems/requirements';

// -----------------------------------------------------------------------------
//  Upgrade identifiers
// -----------------------------------------------------------------------------

export const UPGRADE_TYPE_IDS = {
  MINING_EFFICIENCY: 'miningEfficiency1',
  BATTERY_CAPACITY: 'batteryCapacity',
  BUILDING_CONSTRUCTIONS: 'building_constructions',
  REPAIR_GENERATOR: 'repairGenerator',
  REPAIR_BATTERY: 'repairBattery',
  STORAGE_CAPACITY: 'storageCapacity',
  REPAIR_KIT: 'repairKit',
  BIO_MODULE: 'bioModule',
} as const;

export type UpgradeTypeId = typeof UPGRADE_TYPE_IDS[keyof typeof UPGRADE_TYPE_IDS];

// Тип даних для апгрейду
export interface UpgradeTypeData {
  id: UpgradeTypeId;
  name: string;
  description: string;
  maxLevel: number;
  modifier: BonusSourceModifier;
  requirements?: Requirement[]; // Реквайрменти для розблокування апгрейду
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
  upgradeId: UpgradeTypeId;
  resources: {
    energy?: number;
    stone?: number;
    ore?: number;
  };
}

// UI дані для відображення апгрейду
export interface UpgradeDataUI {
  id: UpgradeTypeId;
  name: string;
  description: string;
  maxLevel: number;
  currentLevel: number;
  cost: ResourceRequest;
  effects: UpgradeEffectUI[];
}

// UI дані для ефектів апгрейду
export interface UpgradeEffectUI {
  type: string;
  value: number;
  formula?: string;
}
