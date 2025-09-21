import { SaveLoadManager, UpgradesManagerSaveData } from '@save-load/save-load.types';
import { IUpgradesManager, IBonusSystem, IResourceManager, IRequirementsSystem } from '@interfaces/index';
import { ResourceId } from '@resources/resources-db';
import { ResourceChange, ResourceRequest, ResourceCheckResult } from '@resources/resource-types';
import { BonusDetail } from '@modifiers/bonus-system.types';

import { UPGRADES_DB } from './upgrades-db';
import {
  UpgradeDataUI,
  UpgradeState,
  UpgradeTypeData,
  UpgradeTypeId,
} from './upgrades.types';
import { applyUpgradeEffect, UpgradeEffectContainer } from './upgrade-effects';

interface UpgradeListItem {
  typeId: UpgradeTypeId;
  name: string;
  description: string;
  currentLevel: number;
  maxLevel: number;
  unlocked: boolean;
  requirementsMet: boolean;
  canUpgrade: boolean;
  canAfford: boolean;
  nextLevelCost?: ResourceRequest;
  costCheck?: ResourceCheckResult;
  bonusDetails: BonusDetail[];
}

const DEFAULT_UPGRADE_STATE: UpgradeState = { level: 0, unlocked: false };

export class UpgradesManager implements SaveLoadManager, IUpgradesManager {
  private readonly bonusSystem: IBonusSystem;
  private readonly resourceManager: IResourceManager;
  private readonly requirementsSystem: IRequirementsSystem;

  private readonly upgradeTypes = new Map<UpgradeTypeId, UpgradeTypeData>();
  private readonly upgradeStates = new Map<UpgradeTypeId, UpgradeState>();

  private container: UpgradeEffectContainer | null = null;

  constructor(
    bonusSystem: IBonusSystem,
    resourceManager: IResourceManager,
    requirementsSystem: IRequirementsSystem,
  ) {
    this.bonusSystem = bonusSystem;
    this.resourceManager = resourceManager;
    this.requirementsSystem = requirementsSystem;
  }

  /**
   * Встановлює посилання на GameContainer для доступу до інших менеджерів
   */
  public setContainer(container: UpgradeEffectContainer | null): void {
    this.container = container;
  }

  /**
   * Ініціалізація перед початком гри: підтягуємо БД та реєструємо бонуси
   */
  public beforeInit(): void {
    this.initialiseDatabase(UPGRADES_DB);
    this.reset();
  }

  public registerUpgradeType(id: UpgradeTypeId, data: UpgradeTypeData): void {
    this.upgradeTypes.set(id, data);
    this.ensureStateEntry(id);
    this.registerBonusSource(data);
    this.refreshUnlockedStates();
  }

  public setInitialState(typeId: UpgradeTypeId, level = 0, unlocked = false): void {
    const type = this.getTypeOrThrow(typeId);
    const clampedLevel = Math.min(level, type.maxLevel);
    this.upgradeStates.set(typeId, { level: clampedLevel, unlocked });
    this.updateBonusSourceLevel(typeId, unlocked ? clampedLevel : 0);
    this.refreshUnlockedStates();
  }

  public upgradeLevel(typeId: UpgradeTypeId): boolean {
    const type = this.upgradeTypes.get(typeId);
    const state = this.upgradeStates.get(typeId);

    if (!type || !state) {
      console.error(`[UpgradesManager] Upgrade ${typeId} not found`);
      return false;
    }

    if (!state.unlocked) {
      console.error(`[UpgradesManager] Upgrade ${typeId} is not unlocked`);
      return false;
    }

    if (state.level >= type.maxLevel) {
      console.error(
        `[UpgradesManager] Upgrade ${typeId} already at max level ${type.maxLevel}`,
      );
      return false;
    }

    const nextLevel = state.level + 1;
    const cost = type.cost(nextLevel);
    const costCheck = this.resourceManager.checkResources(cost);

    if (!costCheck.isAffordable) {
      return false;
    }

    const resourceChanges = this.createResourceChanges(cost, typeId, nextLevel);
    const resourcesSpent = this.resourceManager.spendResources(resourceChanges);

    if (!resourcesSpent) {
      console.error(
        `[UpgradesManager] Failed to spend resources for upgrade ${typeId} level ${nextLevel}`,
      );
      return false;
    }

    state.level = nextLevel;
    this.updateBonusSourceLevel(typeId, state.level);
    this.applySpecialEffects(typeId, state.level);
    this.refreshUnlockedStates();

    return true;
  }

  public unlockUpgrade(typeId: UpgradeTypeId): boolean {
    const state = this.upgradeStates.get(typeId);
    const type = this.upgradeTypes.get(typeId);

    if (!type || !state) {
      console.error(`[UpgradesManager] Upgrade ${typeId} not found`);
      return false;
    }

    if (state.unlocked) {
      return true;
    }

    if (!this.isUnlocked(typeId)) {
      return false;
    }

    state.unlocked = true;
    this.updateBonusSourceLevel(typeId, state.level);
    return true;
  }

  public purchaseUpgrade(typeId: UpgradeTypeId): boolean {
    const state = this.upgradeStates.get(typeId);
    if (!state) {
      console.error(`[UpgradesManager] Upgrade ${typeId} not found`);
      return false;
    }

    if (!state.unlocked) {
      return this.unlockUpgrade(typeId);
    }

    return this.upgradeLevel(typeId);
  }

  public getUpgradeState(typeId: UpgradeTypeId): UpgradeState | undefined {
    const state = this.upgradeStates.get(typeId);
    return state ? { ...state } : undefined;
  }

  public getUpgrade(typeId: UpgradeTypeId): UpgradeDataUI | null {
    const type = this.upgradeTypes.get(typeId);
    const state = this.upgradeStates.get(typeId) ?? DEFAULT_UPGRADE_STATE;

    if (!type) {
      return null;
    }

    const canProgress = state.level < type.maxLevel;
    const nextLevel = canProgress ? state.level + 1 : state.level;
    const nextLevelCost = canProgress ? type.cost(nextLevel) : {};

    return {
      id: typeId,
      name: type.name,
      description: type.description,
      maxLevel: type.maxLevel,
      currentLevel: state.level,
      cost: nextLevelCost,
      effects: [],
    };
  }

  public getAllUpgrades(): Map<UpgradeTypeId, UpgradeState> {
    const clonedEntries: Array<[UpgradeTypeId, UpgradeState]> = [];
    for (const [typeId, state] of this.upgradeStates) {
      clonedEntries.push([typeId, { ...state }]);
    }
    return new Map(clonedEntries);
  }

  public getUpgradeCost(typeId: UpgradeTypeId, level: number): ResourceRequest | undefined {
    const type = this.upgradeTypes.get(typeId);
    if (!type) {
      return undefined;
    }

    if (level < 1 || level > type.maxLevel) {
      return undefined;
    }

    return type.cost(level);
  }

  public listUpgradesForUI(): UpgradeListItem[] {
    const result: UpgradeListItem[] = [];

    for (const [typeId, type] of this.upgradeTypes) {
      const state = this.ensureStateEntry(typeId);
      const requirementsMet = this.isUnlocked(typeId);

      if (!requirementsMet) {
        continue;
      }

      const canUpgrade = state.unlocked && state.level < type.maxLevel;

      let nextLevelCost: ResourceRequest | undefined;
      let costCheck: ResourceCheckResult | undefined;
      let canAfford = false;

      if (canUpgrade) {
        const nextLevel = state.level + 1;
        nextLevelCost = type.cost(nextLevel);
        costCheck = this.resourceManager.checkResources(nextLevelCost);
        canAfford = costCheck.isAffordable;
      }

      const bonusDetails = this.bonusSystem.getBonusDetails(
        this.getBonusSourceId(typeId),
        state.level,
      );

      result.push({
        typeId,
        name: type.name,
        description: type.description,
        currentLevel: state.level,
        maxLevel: type.maxLevel,
        unlocked: state.unlocked,
        requirementsMet,
        canUpgrade,
        canAfford,
        nextLevelCost,
        costCheck,
        bonusDetails,
      });
    }

    return result;
  }

  public getUpgradesCount(): number {
    return this.upgradeStates.size;
  }

  public getUnlockedUpgradesCount(): number {
    let count = 0;
    for (const state of this.upgradeStates.values()) {
      if (state.unlocked) {
        count += 1;
      }
    }
    return count;
  }

  public reset(): void {
    this.upgradeStates.clear();

    for (const typeId of this.upgradeTypes.keys()) {
      this.upgradeStates.set(typeId, { ...DEFAULT_UPGRADE_STATE });
      this.updateBonusSourceLevel(typeId, 0);
    }

    this.refreshUnlockedStates();
  }

  public save(): UpgradesManagerSaveData {
    const upgradeStates: Record<string, UpgradeState> = {};

    for (const [typeId, state] of this.upgradeStates) {
      upgradeStates[typeId] = { ...state };
    }

    return { upgradeStates };
  }

  public load(data: UpgradesManagerSaveData): void {
    this.reset();

    for (const [rawTypeId, stateData] of Object.entries(data.upgradeStates)) {
      const typeId = rawTypeId as UpgradeTypeId;
      const type = this.upgradeTypes.get(typeId);
      if (!type) {
        continue;
      }

      const clampedLevel = Math.min(stateData.level, type.maxLevel);
      const unlocked = stateData.unlocked;
      this.upgradeStates.set(typeId, { level: clampedLevel, unlocked });
      this.updateBonusSourceLevel(typeId, unlocked ? clampedLevel : 0);
    }

    this.refreshUnlockedStates();
  }

  public isUnlocked(upgradeId: UpgradeTypeId): boolean {
    const upgradeData = this.upgradeTypes.get(upgradeId);
    if (!upgradeData || !upgradeData.requirements || upgradeData.requirements.length === 0) {
      return true;
    }

    const result = this.requirementsSystem.checkRequirements(upgradeData.requirements);
    return result.satisfied;
  }

  public getAvailableUpgrades(): UpgradeTypeData[] {
    return Array.from(this.upgradeTypes.values()).filter(upgrade =>
      this.isUnlocked(upgrade.id),
    );
  }

  private initialiseDatabase(source: Map<UpgradeTypeId, UpgradeTypeData>): void {
    this.upgradeTypes.clear();
    for (const [typeId, data] of source) {
      this.registerUpgradeType(typeId, data);
    }
  }

  private ensureStateEntry(typeId: UpgradeTypeId): UpgradeState {
    let state = this.upgradeStates.get(typeId);
    if (!state) {
      state = { ...DEFAULT_UPGRADE_STATE };
      this.upgradeStates.set(typeId, state);
    }
    return state;
  }

  private refreshUnlockedStates(): void {
    for (const typeId of this.upgradeTypes.keys()) {
      const state = this.ensureStateEntry(typeId);
      if (!state.unlocked && this.isUnlocked(typeId)) {
        state.unlocked = true;
        this.updateBonusSourceLevel(typeId, state.level);
      }
    }
  }

  private registerBonusSource(type: UpgradeTypeData): void {
    const bonusSourceId = this.getBonusSourceId(type.id);
    this.bonusSystem.registerSource(bonusSourceId, {
      name: type.name,
      description: type.description,
      modifiers: type.modifier,
    });
    this.bonusSystem.setSourceState(bonusSourceId, 0, 1.0);
  }

  private updateBonusSourceLevel(typeId: UpgradeTypeId, level: number): void {
    this.bonusSystem.updateBonusSourceLevel(this.getBonusSourceId(typeId), level);
  }

  private getBonusSourceId(typeId: UpgradeTypeId): string {
    return `upgrade_${typeId}`;
  }

  private getTypeOrThrow(typeId: UpgradeTypeId): UpgradeTypeData {
    const type = this.upgradeTypes.get(typeId);
    if (!type) {
      throw new Error(`Upgrade type ${typeId} not registered`);
    }
    return type;
  }

  private createResourceChanges(cost: ResourceRequest, typeId: UpgradeTypeId, level: number): ResourceChange[] {
    return Object.entries(cost).map(([resourceId, amount]) => ({
      resourceId: resourceId as ResourceId,
      amount: -(amount as number),
      reason: `Upgrade ${typeId} to level ${level}`,
    }));
  }

  private applySpecialEffects(typeId: UpgradeTypeId, level: number): void {
    applyUpgradeEffect(typeId, {
      typeId,
      level,
      container: this.container,
    });
  }
}
