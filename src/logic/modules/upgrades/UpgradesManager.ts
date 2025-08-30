import { SaveLoadManager, UpgradesManagerSaveData } from '@save-load/save-load.types';
import { UpgradeTypeData, UpgradeState } from './upgrades.types';
import { UPGRADES_DB } from './upgrades-db';
import { IUpgradesManager, IBonusSystem, IResourceManager, IRequirementsSystem } from '@interfaces/index';
import { ResourceRequest } from '@resources/resource-types';

export class UpgradesManager implements SaveLoadManager, IUpgradesManager {
  private upgradesDB: Map<string, UpgradeTypeData> = new Map();
  private upgradeStates: Map<string, UpgradeState> = new Map();
  private bonusSystem: IBonusSystem;
  private resourceManager: IResourceManager;
  private requirementsSystem: IRequirementsSystem;

  constructor(bonusSystem: IBonusSystem, resourceManager: IResourceManager, requirementsSystem: IRequirementsSystem) {
    this.bonusSystem = bonusSystem;
    this.resourceManager = resourceManager;
    this.requirementsSystem = requirementsSystem;

  }

  /**
   * Ініціалізація перед початком гри
   * Читає об'єкти з БД апгрейдів, створює бонус-сорти
   */
  public beforeInit(): void {

    
    // Копіюємо БД апгрейдів
    this.upgradesDB = new Map(UPGRADES_DB);

    
    // Реєструємо кожен апгрейд як бонус-сорт в BonusSystem
    this.upgradesDB.forEach((upgradeType, typeId) => {

      
      if (upgradeType.modifier) {

        
        // Створюємо унікальний ID для бонус-сорта
        const bonusSourceId = this.getBonusSourceId(typeId);
        
        // Реєструємо апгрейд як джерело бонусів з формулами з БД
        this.bonusSystem.registerSource(bonusSourceId, {
          name: upgradeType.name,
          description: upgradeType.description,
          modifiers: upgradeType.modifier
        });
        this.bonusSystem.setSourceState(bonusSourceId, 0, 1.0);

      } else {

      }
    });
    

  }

  /**
   * Реєструє новий тип апгрейду
   */
  public registerUpgradeType(id: string, data: UpgradeTypeData): void {
    this.upgradesDB.set(id, data);

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
    bonusDetails: any[];
  }> {
    const result = [];
    
    for (const [typeId, upgradeType] of this.upgradesDB) {
      // Перевіряємо чи апгрейд розблокований
      if (!this.isUnlocked(typeId)) {
        continue; // Пропускаємо заблоковані апгрейди
      }
      
      const state = this.upgradeStates.get(typeId) || { level: 0, unlocked: false };
      
      // Розраховуємо вартість наступного рівня
      const nextLevel = state.level + 1;
      const buildingCost = upgradeType.cost(nextLevel);
      const nextLevelCost = this.convertBuildingCostToResourceRequest(buildingCost);
      const costCheck = this.resourceManager.checkResources(nextLevelCost);
      
      // Отримуємо деталі бонусів для цього апгрейду
      const bonusDetails = this.bonusSystem.getBonusDetails(this.getBonusSourceId(typeId));
      
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
        costCheck,
        bonusDetails
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
    

  }

  /**
   * Генерує унікальний ID для бонус-сорта
   */
  private getBonusSourceId(typeId: string): string {
    return `upgrade_${typeId}`;
  }

  /**
   * Перевіряє чи розблокований апгрейд
   */
  public isUnlocked(upgradeId: string): boolean {
    const upgradeData = this.upgradesDB.get(upgradeId);
    if (!upgradeData) return false;
    
    // Якщо нема реквайрментів - апгрейд автоматично доступний
    if (!upgradeData.requirements || upgradeData.requirements.length === 0) {
      return true;
    }

    // Перевіряємо реквайрменти через RequirementsSystem
    const result = this.requirementsSystem.checkRequirements(upgradeData.requirements);
    return result.satisfied;
  }

  /**
   * Отримує список доступних апгрейдів для UI
   */
  public getAvailableUpgrades(): UpgradeTypeData[] {
    return Array.from(this.upgradesDB.values()).filter(upgrade => 
      this.isUnlocked(upgrade.id)
    );
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
