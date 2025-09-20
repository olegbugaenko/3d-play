import { SaveLoadManager, UpgradesManagerSaveData } from '@save-load/save-load.types';
import { UpgradeTypeData, UpgradeState, UpgradeDataUI } from './upgrades.types';
import { UPGRADES_DB } from './upgrades-db';
import { IUpgradesManager, IBonusSystem, IResourceManager, IRequirementsSystem } from '@interfaces/index';
import { ResourceRequest } from '@resources/resource-types';
import { BonusDetail } from '@modifiers/bonus-system.types';
import { TSceneObject } from '@scene/scene.types';

export class UpgradesManager implements SaveLoadManager, IUpgradesManager {
  private upgradesDB: Map<string, UpgradeTypeData> = new Map();
  private upgradeStates: Map<string, UpgradeState> = new Map();
  private bonusSystem: IBonusSystem;
  private resourceManager: IResourceManager;
  private requirementsSystem: IRequirementsSystem;
  private container: any | null = null; // Посилання на GameContainer

  constructor(bonusSystem: IBonusSystem, resourceManager: IResourceManager, requirementsSystem: IRequirementsSystem) {
    this.bonusSystem = bonusSystem;
    this.resourceManager = resourceManager;
    this.requirementsSystem = requirementsSystem;

  }

  /**
   * Встановлює посилання на GameContainer для доступу до інших менеджерів
   */
  public setContainer(container: any): void {
    this.container = container;
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
      const cost = upgradeType.cost(nextLevel);

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
      
      // НОВЕ: Обробляємо спеціальні ефекти апгрейдів
      this.handleSpecialUpgradeEffects(typeId);
  
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
  public getUpgrade(typeId: string): UpgradeDataUI | null {
    const state = this.getUpgradeState(typeId);
    if (!state) {
      return null;
    }

    const upgradeType = this.upgradesDB.get(typeId);
    if (!upgradeType) {
      return null;
    }

    return {
      id: typeId,
      name: upgradeType.name,
      description: upgradeType.description,
      maxLevel: upgradeType.maxLevel,
      currentLevel: state.level,
      cost: upgradeType.cost(state.level + 1),
      effects: []
    };
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
  public getUpgradeCost(typeId: string, level: number): ResourceRequest | undefined {
    const upgradeType = this.upgradesDB.get(typeId);
    if (!upgradeType) return undefined;
    
    return upgradeType.cost(level);
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
    nextLevelCost: ResourceRequest;
    canAfford: boolean;
    costCheck: any; // TODO: Replace with proper type
    bonusDetails: BonusDetail[];
  }> {
    const result = [];
    
    for (const [typeId, upgradeType] of this.upgradesDB) {
      // Перевіряємо чи апгрейд розблокований
      if (!this.isUnlocked(typeId)) {
        continue; // Пропускаємо заблоковані апгрейди
      }
      
      const state = this.upgradeStates.get(typeId) || { level: 0, unlocked: false };
      
      if (!state.unlocked) {
        // Спочатку розблоковуємо
        this.unlockUpgrade(typeId);
      }

      // Розраховуємо вартість наступного рівня
      const nextLevel = state.level + 1;
      const nextLevelCost = upgradeType.cost(nextLevel);
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
      console.log(`Set initial for ${typeId}`);
      this.setInitialState(typeId, 0, true);
    }
    
    // 🚀 TEST: Додаємо тестові апгрейди для швидкого тесту storage індикації
    console.log('[TEST] Adding test upgrades for storage testing...');
    this.forceUnlockUpgrade('building_constructions');
    this.forceUnlockUpgrade('bioModule');
    this.forceUnlockUpgrade('repairKit');
    // TEMP: set miningEfficiency1 to level 5 for testing
    this.forceSetUpgradeLevel('miningEfficiency1', 5);

  }

  /**
   * Force unlock upgrade for testing (bypasses requirements and costs)
   */
  private forceUnlockUpgrade(upgradeId: string): void {
    const state = this.upgradeStates.get(upgradeId);
    if (state) {
      state.level = 1;
      state.unlocked = true;
      
      // Update bonus system
      const bonusSourceId = this.getBonusSourceId(upgradeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, state.level);
      
      // Handle special effects (like repairKit creating drone)
      this.handleSpecialUpgradeEffects(upgradeId);
      
      console.log(`[TEST] Force unlocked upgrade: ${upgradeId}`);
    } else {
      console.warn(`[TEST] Upgrade ${upgradeId} not found in states`);
    }
  }

  private forceSetUpgradeLevel(upgradeId: string, level: number): void {
    const state = this.upgradeStates.get(upgradeId);
    if (state) {
      state.unlocked = true;
      state.level = level;
      const bonusSourceId = this.getBonusSourceId(upgradeId);
      this.bonusSystem.updateBonusSourceLevel(bonusSourceId, state.level);
      console.log(`[TEST] Force set upgrade ${upgradeId} to level ${level}`);
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
    this.reset();
    
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
   * Обробляє спеціальні ефекти апгрейдів
   */
  private handleSpecialUpgradeEffects(upgradeId: string): void {
    switch (upgradeId) {
      case 'repairKit':
        this.handleRepairKitUpgrade();
        break;
      
      // Можна додати інші спеціальні апгрейди в майбутньому
      default:
        // Нічого спеціального не робимо для звичайних апгрейдів
        break;
    }
  }

  /**
   * Обробляє ефект апгрейду "Ремонтний комплект" - створює новий дрон
   */
  private handleRepairKitUpgrade(): void {
    if (!this.container) {
      console.warn('[UpgradesManager] Container not set, cannot create drone');
      return;
    }
    
    console.log('[UpgradesManager] Handling Repair Kit upgrade - creating new drone');
    
    // Оновлюємо максимальну кількість дронів через DroneManager
    const droneManager = this.container.droneManager;
    if (!droneManager) {
      console.warn('[UpgradesManager] DroneManager not found in container');
      return;
    }
    
    droneManager.updateMaxDroneCount();
    
    // СТВОРЮЄМО РЕАЛЬНОГО НОВОГО ДРОНА
    const success = droneManager.createAdditionalDrone();
    
    if (success) {
      console.log('[UpgradesManager] Successfully created additional drone from Repair Kit');
    } else {
      console.warn('[UpgradesManager] Failed to create additional drone from Repair Kit');
    }
  }


}
