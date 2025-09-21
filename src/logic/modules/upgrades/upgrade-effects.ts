import { UpgradeTypeId, UPGRADE_TYPE_IDS } from './upgrades.types';

export interface DroneManagerLike {
  updateMaxDroneCount(): void;
  createAdditionalDrone(): boolean;
}

export interface UpgradeEffectContainer {
  droneManager?: DroneManagerLike;
}

export interface UpgradeEffectContext {
  typeId: UpgradeTypeId;
  level: number;
  container: UpgradeEffectContainer | null;
}

type UpgradeEffectHandler = (context: UpgradeEffectContext) => void;

const handleRepairKitUpgrade: UpgradeEffectHandler = ({ container }) => {
  const droneManager = container?.droneManager;
  if (!droneManager) {
    console.warn('[UpgradesManager] DroneManager not available, cannot create additional drone');
    return;
  }

  droneManager.updateMaxDroneCount();

  if (!droneManager.createAdditionalDrone()) {
    console.warn('[UpgradesManager] Failed to create additional drone from Repair Kit upgrade');
  }
};

const UPGRADE_EFFECT_HANDLERS: Partial<Record<UpgradeTypeId, UpgradeEffectHandler>> = {
  [UPGRADE_TYPE_IDS.REPAIR_KIT]: handleRepairKitUpgrade,
};

export function applyUpgradeEffect(typeId: UpgradeTypeId, context: UpgradeEffectContext): void {
  const handler = UPGRADE_EFFECT_HANDLERS[typeId];
  if (handler) {
    handler(context);
  }
}
