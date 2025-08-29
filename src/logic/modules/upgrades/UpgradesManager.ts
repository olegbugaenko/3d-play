import { SaveLoadManager, UpgradesManagerSaveData } from '@save-load/save-load.types';
import { UpgradeTypeData, UpgradeState } from './upgrades.types';
import { UPGRADES_DB } from './upgrades-db';
import { IUpgradesManager, IBonusSystem, IResourceManager } from '@interfaces/index';
import { ResourceRequest } from '../resources/resource-types';

export class UpgradesManager implements SaveLoadManager, IUpgradesManager {
  private upgradesDB: Map<string, UpgradeTypeData> = new Map();
  private upgradeStates: Map<string, UpgradeState> = new Map();
  private bonusSystem: IBonusSystem;
  private resourceManager: IResourceManager;

  constructor(bonusSystem: IBonusSystem, resourceManager: IResourceManager) {
    this.bonusSystem = bonusSystem;
    this.resourceManager = resourceManager;
    console.log('[UpgradesManager] Initialized');
  }

  /**
   * Ініціалізація перед початком гри
   * Читає об'єкти з БД апгрейдів, створює бонус-сорти
   */
  public beforeInit(): void {
    console.log('[UpgradesManager] Starting beforeInit...');
    
    // Копіюємо БД апгрейдів
    this.upgradesDB = new Map(UPGRADES_DB);
    console.log(`[UpgradesManager] Loaded ${this.upgradesDB.size} upgrade types from DB:`, Array.from(this.upgradesDB.keys()));
    
    // Реєструємо кожен апгрейд як бонус-сорт в BonusSystem
    this.upgradesDB.forEach((upgradeType, typeId) => {
      console.log(`[UpgradesManager] Processing upgrade type: ${typeId}`);
      console.log(`[UpgradesManager] Upgrade data:`, upgradeType);
      
      if (upgradeType.modifier) {
        console.log(`[UpgradesManager] Upgrade ${typeId} has modifier:`, upgradeType.modifier);
        
        // Створюємо унікальний ID для бонус-сорта
        const bonusSourceId = this.getBonusSourceId(typeId);
        
        // Реєструємо апгрейд як джерело бонусів з формулами з БД
        this.bonusSystem.registerSource(bonusSourceId, {
          name: upgradeType.name,
          description: upgradeType.description,
          modifiers: upgradeType.modifier
        });
        this.bonusSystem.setSourceState(bonusSourceId, 0, 1.0);
        console.log(`[UpgradesManager] Successfully registered upgrade type as bonus source: ${bonusSourceId}`, {
            name: upgradeType.name,
            description: upgradeType.description,
            modifiers: upgradeType.modifier
          });
      } else {
        console.log(`[UpgradesManager] Upgrade ${typeId} has no modifier, skipping bonus registration`);
      }
    });
    
    console.log(`[UpgradesManager] beforeInit completed. Registered ${this.upgradesDB.size} upgrade types`);
  }

  /**
   * Реєструє новий тип апгрейду
   */
  public registerUpgradeType(id: string, data: UpgradeTypeData): void {
    this.upgradesDB.set(id, data);
    console.log(`[UpgradesManager] Registered upgrade type: ${id}`);
  }

  /**
   * Встановлює початковий стан апгрейду
   */
  public setInitialState(typeId: string, level: number = 0, unlocked: boolean = false): void {
    if (!this.upgradesDB.has(typeId)) {
      throw new Error(`Upgrade type ${typeId} not registered`);
    }

    const upgradeState: UpgradeState = {
      level,
      unlocked
    };

    this.upgradeStates.set(typeId, upgradeState);
    
    // Синхронізуємо з BonusSystem
    if (unlocked) {
      const bonusSourceId = this.getBonusSourceId(typeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, level);
    }
    
    console.log(`[UpgradesManager] Set initial state for ${typeId}: level=${level}, unlocked=${unlocked}`);
  }

  /**
   * Підвищує рівень апгрейду
   */
  public upgradeLevel(typeId: string): boolean {
    const state = this.upgradeStates.get(typeId);
    if (!state) {
      console.error(`[UpgradesManager] Upgrade ${typeId} not found`);
      return false;
    }

    if (!state.unlocked) {
      console.error(`[UpgradesManager] Upgrade ${typeId} is not unlocked`);
      return false;
    }

    const upgradeType = this.upgradesDB.get(typeId);
    if (!upgradeType) {
      console.error(`[UpgradesManager] Upgrade type ${typeId} not found in DB`);
      return false;
    }

    if (state.level >= upgradeType.maxLevel) {
      console.error(`[UpgradesManager] Upgrade ${typeId} already at max level ${upgradeType.maxLevel}`);
      return false;
    }

    // Підвищуємо рівень
    state.level++;
    
    // Синхронізуємо з BonusSystem
    const bonusSourceId = this.getBonusSourceId(typeId);
    this.bonusSystem.updateBonusSourceLevel(bonusSourceId, state.level);
    
    console.log(`[UpgradesManager] Upgraded ${typeId} to level ${state.level}`);
    return true;
  }

  /**
   * Розблоковує апгрейд
   */
  public unlockUpgrade(typeId: string): boolean {
    const state = this.upgradeStates.get(typeId);
    if (!state) {
      console.error(`[UpgradesManager] Upgrade ${typeId} not found`);
      return false;
    }

    if (state.unlocked) {
      console.error(`[UpgradesManager] Upgrade ${typeId} is already unlocked`);
      return false;
    }

    state.unlocked = true;
    
    // Синхронізуємо з BonusSystem
    const bonusSourceId = this.getBonusSourceId(typeId);
    this.bonusSystem.updateBonusSourceLevel(bonusSourceId, state.level);
    
    console.log(`[UpgradesManager] Unlocked upgrade ${typeId}`);
    return true;
  }

  /**
   * Купує апгрейд (розблоковує або підвищує рівень)
   */
  public purchaseUpgrade(typeId: string): boolean {
    const state = this.upgradeStates.get(typeId);
    if (!state) {
      console.error(`[UpgradesManager] Upgrade ${typeId} not found`);
      return false;
    }

    const upgradeType = this.upgradesDB.get(typeId);
    if (!upgradeType) {
      console.error(`[UpgradesManager] Upgrade type ${typeId} not found in DB`);
      return false;
    }

    if (!state.unlocked) {
      // Спочатку розблоковуємо
      return this.unlockUpgrade(typeId);
    } else {
      // Перевіряємо чи можна підвищити рівень
      if (state.level >= upgradeType.maxLevel) {
        console.error(`[UpgradesManager] Upgrade ${typeId} already at max level ${upgradeType.maxLevel}`);
        return false;
      }

      // Розраховуємо вартість наступного рівня
      const nextLevel = state.level + 1;
      const buildingCost = upgradeType.cost(nextLevel);
      const cost = this.convertBuildingCostToResourceRequest(buildingCost);

      // Перевіряємо чи достатньо ресурсів
      const checkResult = this.resourceManager.checkResources(cost);
      if (!checkResult.isAffordable) {
        console.log(`[UpgradesManager] Not enough resources for upgrade ${typeId} to level ${nextLevel}`);
        return false;
      }

      // Списуємо ресурси
      const changes = Object.entries(cost).map(([resourceId, amount]) => ({
        resourceId: resourceId as any,
        amount: -(amount as number), // від'ємне значення = списування
        reason: `Upgrade ${typeId} to level ${nextLevel}`
      }));

      const resourcesSpent = this.resourceManager.spendResources(changes);
      if (!resourcesSpent) {
        console.error(`[UpgradesManager] Failed to spend resources for upgrade ${typeId}`);
        return false;
      }

      // Підвищуємо рівень
      state.level = nextLevel;
      
      // Синхронізуємо з BonusSystem
      const bonusSourceId = this.getBonusSourceId(typeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, state.level);
      
      console.log(`[UpgradesManager] Successfully purchased upgrade ${typeId} to level ${state.level}`);
      return true;
    }
  }

  /**
   * Отримує поточний стан апгрейду
   */
  public getUpgradeState(typeId: string): UpgradeState | undefined {
    return this.upgradeStates.get(typeId);
  }

  /**
   * Отримує апгрейд (реалізація інтерфейсу)
   */
  public getUpgrade(typeId: string): any | null {
    return this.getUpgradeState(typeId) || null;
  }

  /**
   * Отримує всі апгрейди (реалізація інтерфейсу)
   */
  public getAllUpgrades(): Map<string, any> {
    return this.upgradeStates;
  }

  /**
   * Отримує вартість апгрейду (реалізація інтерфейсу)
   */
  public getUpgradeCost(typeId: string, level: number): any | undefined {
    const upgradeType = this.upgradesDB.get(typeId);
    return upgradeType ? upgradeType.cost(level) : undefined;
  }

  /**
   * Отримує всі доступні апгрейди для UI
   */
  public listUpgradesForUI(): Array<{
    typeId: string;
    name: string;
    description: string;
    currentLevel: number;
    maxLevel: number;
    unlocked: boolean;
    canUpgrade: boolean;
    nextLevelCost: any;
    canAfford: boolean;
    costCheck: any;
  }> {
    const result = [];
    
    for (const [typeId, upgradeType] of this.upgradesDB) {
      const state = this.upgradeStates.get(typeId) || { level: 0, unlocked: false };
      
      // Розраховуємо вартість наступного рівня
      const nextLevel = state.level + 1;
      const buildingCost = upgradeType.cost(nextLevel);
      const nextLevelCost = this.convertBuildingCostToResourceRequest(buildingCost);
      const costCheck = this.resourceManager.checkResources(nextLevelCost);
      
      result.push({
        typeId,
        name: upgradeType.name,
        description: upgradeType.description,
        currentLevel: state.level,
        maxLevel: upgradeType.maxLevel,
        unlocked: state.unlocked,
        canUpgrade: state.unlocked && state.level < upgradeType.maxLevel,
        nextLevelCost,
        canAfford: costCheck.isAffordable,
        costCheck
      });
    }
    
    return result;
  }

  /**
   * Отримує кількість апгрейдів
   */
  public getUpgradesCount(): number {
    return this.upgradeStates.size;
  }

  /**
   * Отримує кількість розблокованих апгрейдів
   */
  public getUnlockedUpgradesCount(): number {
    let count = 0;
    for (const state of this.upgradeStates.values()) {
      if (state.unlocked) count++;
    }
    return count;
  }

  /**
   * Скидає всі апгрейди до початкового стану
   */
  public reset(): void {
    this.upgradeStates.clear();
    
    // Створюємо початкові апгрейди для всіх типів з БД
    for (const [typeId] of this.upgradesDB) {
      this.setInitialState(typeId, 0, true);
    }
    
    console.log(`[UpgradesManager] Reset completed. Created ${this.upgradesDB.size} initial upgrades`);
  }

  /**
   * Зберігає стан апгрейдів
   */
  public save(): UpgradesManagerSaveData {
    const upgradeStates: Record<string, { level: number; unlocked: boolean }> = {};
    
    for (const [typeId, state] of this.upgradeStates) {
      upgradeStates[typeId] = {
        level: state.level,
        unlocked: state.unlocked
      };
    }
    
    return {
      upgradeStates
    };
  }

  /**
   * Завантажує стан апгрейдів
   */
  public load(data: UpgradesManagerSaveData): void {
    this.upgradeStates.clear();
    
    for (const [typeId, stateData] of Object.entries(data.upgradeStates)) {
      this.upgradeStates.set(typeId, {
        level: stateData.level,
        unlocked: stateData.unlocked
      });
      
      // Синхронізуємо з BonusSystem
      if (stateData.unlocked) {
        const bonusSourceId = this.getBonusSourceId(typeId);
        this.bonusSystem.updateBonusSourceLevel(bonusSourceId, stateData.level);
      }
    }
    
    console.log(`[UpgradesManager] Loaded ${this.upgradeStates.size} upgrade states`);
  }

  /**
   * Генерує унікальний ID для бонус-сорта
   */
  private getBonusSourceId(typeId: string): string {
    return `upgrade_${typeId}`;
  }

  /**
   * Конвертує вартість будівлі в запит ресурсів
   */
  private convertBuildingCostToResourceRequest(buildingCost: any): ResourceRequest {
    const result: ResourceRequest = {};
    if (buildingCost.energy) result.energy = buildingCost.energy;
    if (buildingCost.stone) result.stone = buildingCost.stone;
    if (buildingCost.ore) result.ore = buildingCost.ore;
    return result;
  }
}
