import { ResourceId, RESOURCES_DB } from './resources-db';
import { 
  ResourceRequest, 
  ResourceCheckResult, 
  ResourceChange, 
  ResourceHistoryEntry 
} from './resource-types';
import { SaveLoadManager, ResourceSaveData } from '../save-load/save-load.types';
import { BonusSystem } from '../modifiers-system/BonusSystem';

// Нова структура ресурсу
export interface ResourceData {
  max: number;        // Максимальна ємність
  balance: number;    // Поточний баланс
  income: number;     // Дохід за тік
  consumption: number; // Витрати за тік
  multiplier: number; // Мультиплікатор
}

// Статус ресурсу для перевірки
export interface ResourceStatus {
  required: number;
  own: number;
  isAffordable: boolean;
  progress: number;
}

export class ResourceManager implements SaveLoadManager {
  private resources: Map<ResourceId, ResourceData> = new Map();
  private history: ResourceHistoryEntry[] = [];
  private maxHistorySize = 1000; // максимальна кількість записів в історії
  private bonusSystem: BonusSystem;

  constructor(bonusSystem: BonusSystem, initialResources?: Partial<Record<ResourceId, number>>) {
    this.bonusSystem = bonusSystem;
    
    // Ініціалізуємо всі ресурси з нуля
    Object.keys(RESOURCES_DB).forEach(id => {
      this.resources.set(id as ResourceId, {
        max: 0,
        balance: 0,
        income: 0,
        consumption: 0,
        multiplier: 1
      });
    });

    // Якщо передали початкові ресурси - встановлюємо їх
    if (initialResources) {
      Object.entries(initialResources).forEach(([id, amount]) => {
        if (this.isValidResourceId(id)) {
          const resourceData = this.resources.get(id as ResourceId)!;
          resourceData.balance = Math.max(0, amount);
        }
      });
    }
  }

  /**
   * Метод тік - оновлює ресурси на основі бонус-системи
   */
  public tick(dT: number): void {
    // 1. Синхронізація з BonusSystem
    this.syncWithBonusSystem();
    
    // 2. Інкремент ресурсів
    this.updateResources(dT);
  }

  /**
   * Синхронізує дані ресурсів з BonusSystem
   */
  private syncWithBonusSystem(): void {
    this.resources.forEach((resourceData, resourceId) => {
      try {
        const bonusData = this.bonusSystem.getResourceValue(resourceId);
        
        resourceData.max = bonusData.cap * bonusData.capMultiplier;
        resourceData.income = bonusData.income * bonusData.multiplier;
        resourceData.consumption = bonusData.consumption;
        resourceData.multiplier = bonusData.multiplier;
        
        // Обмежуємо баланс максимальною ємністю
        if (resourceData.balance > resourceData.max) {
          resourceData.balance = resourceData.max;
        }
        
      } catch (error) {
        console.warn(`ResourceManager: Помилка отримання бонусів для ${resourceId}:`, error);
      }
    });
  }

  /**
   * Оновлює ресурси на основі доходів та витрат
   */
  private updateResources(dT: number): void {
    this.resources.forEach((resourceData, resourceId) => {
      // Додаємо дохід
      if (resourceData.income > 0) {
        resourceData.balance = Math.min(resourceData.max, resourceData.balance + resourceData.income);
      }
      
      // Віднімаємо витрати
      if (resourceData.consumption > 0) {
        resourceData.balance = Math.max(0, resourceData.balance - resourceData.consumption);
      }
    });
  }

  // === ПУБЛІЧНІ МЕТОДИ ===

  /**
   * Додати ресурси
   */
  addResources(changes: ResourceChange[]): boolean {
    const results: boolean[] = [];

    changes.forEach(change => {
      if (!this.isValidResourceId(change.resourceId)) {
        console.warn(`ResourceManager: Невідомий ресурс ${change.resourceId}`);
        results.push(false);
        return;
      }

      const resourceData = this.resources.get(change.resourceId);
      if (!resourceData) {
        console.warn(`ResourceManager: Невідомий ресурс ${change.resourceId} при додаванні`);
        results.push(false);
        return;
      }

      const maxCapacity = resourceData.max;
      
      // Обмежуємо максимальною ємністю
      const newAmount = Math.min(maxCapacity, resourceData.balance + change.amount);
      const actualChange = newAmount - resourceData.balance;

      if (actualChange !== 0) {
        resourceData.balance = newAmount;
        this.addToHistory(change.resourceId, actualChange, change.reason, newAmount);
        results.push(true);
      } else {
        results.push(false);
      }
    });

    return results.some(r => r);
  }

  /**
   * Забрати ресурси (якщо достатньо)
   */
  spendResources(changes: ResourceChange[]): boolean {
    // Спочатку перевіряємо чи можемо забрати
    const request: ResourceRequest = {};
    changes.forEach(change => {
      request[change.resourceId] = (request[change.resourceId] || 0) + Math.abs(change.amount);
    });

    const check = this.checkResources(request);
    if (!check.isAffordable) {
      return false;
    }

    // Забираємо ресурси
    changes.forEach(change => {
      const resourceData = this.resources.get(change.resourceId);
      if (!resourceData) {
        console.warn(`ResourceManager: Невідомий ресурс ${change.resourceId} при витратах`);
        return;
      }
      const newAmount = Math.max(0, resourceData.balance - Math.abs(change.amount));
      resourceData.balance = newAmount;
      this.addToHistory(change.resourceId, -Math.abs(change.amount), change.reason, newAmount);
    });

    return true;
  }

  /**
   * Перевірити чи достатньо ресурсів
   */
  checkResources(request: ResourceRequest): ResourceCheckResult {
    const resources: Record<ResourceId, ResourceStatus> = {} as any;
    let totalRequired = 0;
    let totalOwn = 0;
    let totalProgress = 0;
    let affordableCount = 0;
    let totalCount = 0;

    Object.entries(request).forEach(([resourceId, required]) => {
      if (!this.isValidResourceId(resourceId)) {
        console.warn(`ResourceManager: Невідомий ресурс ${resourceId}`);
        return;
      }

      const id = resourceId as ResourceId;
      const resourceData = this.resources.get(id);
      if (!resourceData) {
        console.warn(`ResourceManager: Невідомий ресурс ${id} при перевірці`);
        return;
      }
      const own = resourceData.balance;
      const isAffordable = own >= required;
      const progress = Math.min(1.0, own / Math.max(1, required));

      resources[id] = {
        required,
        own,
        isAffordable,
        progress
      };

      totalRequired += required;
      totalOwn += own;
      totalProgress += progress;
      totalCount++;

      if (isAffordable) {
        affordableCount++;
      }
    });

    const overallProgress = totalCount > 0 ? totalProgress / totalCount : 0;
    const isAffordable = affordableCount === totalCount && totalCount > 0;

    // Визначаємо яких ресурсів бракує
    const missing: ResourceRequest = {};
    Object.entries(resources).forEach(([id, status]) => {
      if (!status.isAffordable) {
        missing[id] = status.required - status.own;
      }
    });

    return {
      isAffordable,
      progress: overallProgress,
      resources,
      missing,
      totalRequired,
      totalOwn
    };
  }

  /**
   * Отримати поточну кількість ресурсу
   */
  getResourceAmount(resourceId: ResourceId): number {
    const resourceData = this.resources.get(resourceId);
    return resourceData ? resourceData.balance : 0;
  }

  /**
   * Отримати максимальну ємність ресурсу
   */
  getResourceCapacity(resourceId: ResourceId): number {
    const resourceData = this.resources.get(resourceId);
    return resourceData ? resourceData.max : 0;
  }

  /**
   * Отримати прогрес заповнення ресурсу (0..1)
   */
  getResourceProgress(resourceId: ResourceId): number {
    const current = this.getResourceAmount(resourceId);
    const max = this.getResourceCapacity(resourceId);
    return max > 0 ? current / max : 0;
  }

  /**
   * Отримати всі ресурси
   */
  getAllResources(): Record<ResourceId, number> {
    const result: Record<ResourceId, number> = {} as any;
    this.resources.forEach((resourceData, id) => {
      result[id] = resourceData.balance;
    });
    return result;
  }

  /**
   * Отримати детальну інформацію про ресурс
   */
  getResourceData(resourceId: ResourceId): ResourceData | undefined {
    return this.resources.get(resourceId);
  }

  /**
   * Отримати всі детальні дані ресурсів
   */
  getAllResourceData(): Map<ResourceId, ResourceData> {
    return new Map(this.resources);
  }

  /**
   * Отримати дохід ресурсу
   */
  getResourceIncome(resourceId: ResourceId): number {
    const resourceData = this.resources.get(resourceId);
    return resourceData ? resourceData.income : 0;
  }

  /**
   * Отримати витрати ресурсу
   */
  getResourceConsumption(resourceId: ResourceId): number {
    const resourceData = this.resources.get(resourceId);
    return resourceData ? resourceData.consumption : 0;
  }

  /**
   * Отримати мультиплікатор ресурсу
   */
  getResourceMultiplier(resourceId: ResourceId): number {
    const resourceData = this.resources.get(resourceId);
    return resourceData ? resourceData.multiplier : 1;
  }

  /**
   * Отримати історію змін
   */
  getHistory(limit?: number): ResourceHistoryEntry[] {
    const history = [...this.history].reverse(); // новіші спочатку
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Очистити історію
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Встановити кількість ресурсу (без обмежень)
   */
  setResourceAmount(resourceId: ResourceId, amount: number, reason: string = 'manual'): void {
    if (!this.isValidResourceId(resourceId)) {
      console.warn(`ResourceManager: Невідомий ресурс ${resourceId}`);
      return;
    }

    const resourceData = this.resources.get(resourceId);
    if (!resourceData) {
      console.warn(`ResourceManager: Невідомий ресурс ${resourceId} при встановленні`);
      return;
    }

    const clampedAmount = Math.max(0, amount);
    resourceData.balance = clampedAmount;
    this.addToHistory(resourceId, clampedAmount - resourceData.balance, reason, clampedAmount);
  }

  // === ПРИВАТНІ МЕТОДИ ===

  private isValidResourceId(id: string): id is ResourceId {
    return id in RESOURCES_DB;
  }

  private addToHistory(resourceId: ResourceId, amount: number, reason?: string, balance: number): void {
    const entry: ResourceHistoryEntry = {
      timestamp: Date.now(),
      resourceId,
      amount,
      reason: reason || 'manual',
      balance
    };

    this.history.push(entry);

    // Обмежуємо розмір історії
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  // === УТІЛІТИ ===

  /**
   * Отримати статистику ресурсів
   */
  getStats(): {
    totalResources: number;
    totalCapacity: number;
    utilization: number;
    resourceCount: number;
  } {
    let totalResources = 0;
    let totalCapacity = 0;
    let resourceCount = 0;

    this.resources.forEach((resourceData, id) => {
      totalResources += resourceData.balance;
      totalCapacity += resourceData.max;
      resourceCount++;
    });

    return {
      totalResources,
      totalCapacity,
      utilization: totalCapacity > 0 ? totalResources / totalCapacity : 0,
      resourceCount
    };
  }

  /**
   * Експорт стану (для збереження)
   */
  exportState(): Record<ResourceId, number> {
    return this.getAllResources();
  }

  /**
   * Імпорт стану (для завантаження)
   */
  importState(state: Record<ResourceId, number>): void {
    Object.entries(state).forEach(([id, amount]) => {
      if (this.isValidResourceId(id)) {
        this.setResourceAmount(id as ResourceId, amount, 'import');
      }
    });
  }

  // ==================== SaveLoadManager Implementation ====================
  
  save(): ResourceSaveData {
    return {
      collectedResources: [], // Поки що пустий масив
      resourceCounts: this.exportState()
    };
  }
  
  load(data: ResourceSaveData): void {
    if (data.resourceCounts) {
      this.importState(data.resourceCounts);
    }
  }
  
  reset(): void {
    // Скидаємо всі ресурси до 0
    Object.keys(RESOURCES_DB).forEach(id => {
      this.resources.set(id as ResourceId, {
        max: 0,
        balance: 0,
        income: 0,
        consumption: 0,
        multiplier: 1
      });
    });
    this.clearHistory();
    
    // Додаємо початкові ресурси для нової гри
    this.addResources([
      { resourceId: 'stone', amount: 30, reason: 'Starting resources' },
      { resourceId: 'ore', amount: 50, reason: 'Starting resources' },
      { resourceId: 'energy', amount: 200, reason: 'Starting resources' }
    ]);
  }
}
