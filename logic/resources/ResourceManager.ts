import { ResourceId, RESOURCES_DB } from './resources-db';
import { 
  ResourceRequest, 
  ResourceCheckResult, 
  ResourceChange, 
  ResourceHistoryEntry 
} from './resource-types';
import { SaveLoadManager, ResourceSaveData } from '../save-load/save-load.types';

export class ResourceManager implements SaveLoadManager {
  private resources: Map<ResourceId, number> = new Map();
  private history: ResourceHistoryEntry[] = [];
  private maxHistorySize = 1000; // максимальна кількість записів в історії

  constructor(initialResources?: Partial<Record<ResourceId, number>>) {
    // Ініціалізуємо всі ресурси з нуля
    Object.keys(RESOURCES_DB).forEach(id => {
      this.resources.set(id as ResourceId, 0);
    });

    // Якщо передали початкові ресурси - встановлюємо їх
    if (initialResources) {
      Object.entries(initialResources).forEach(([id, amount]) => {
        if (this.isValidResourceId(id)) {
          this.resources.set(id as ResourceId, Math.max(0, amount));
        }
      });
    }
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

      const current = this.resources.get(change.resourceId) || 0;
      const maxCapacity = RESOURCES_DB[change.resourceId].maxCapacity;
      
      // Обмежуємо максимальною ємністю
      const newAmount = Math.min(maxCapacity, current + change.amount);
      const actualChange = newAmount - current;

      if (actualChange !== 0) {
        this.resources.set(change.resourceId, newAmount);
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
      const current = this.resources.get(change.resourceId) || 0;
      const newAmount = Math.max(0, current - Math.abs(change.amount));
      this.resources.set(change.resourceId, newAmount);
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
      const own = this.resources.get(id) || 0;
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
    return this.resources.get(resourceId) || 0;
  }

  /**
   * Отримати максимальну ємність ресурсу
   */
  getResourceCapacity(resourceId: ResourceId): number {
    return RESOURCES_DB[resourceId]?.maxCapacity || 0;
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
    this.resources.forEach((amount, id) => {
      result[id] = amount;
    });
    return result;
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
  setResourceAmount(resourceId: ResourceId, amount: number, reason?: string): void {
    if (!this.isValidResourceId(resourceId)) {
      console.warn(`ResourceManager: Невідомий ресурс ${resourceId}`);
      return;
    }

    const clampedAmount = Math.max(0, amount);
    this.resources.set(resourceId, clampedAmount);
    this.addToHistory(resourceId, clampedAmount - (this.resources.get(resourceId) || 0), reason, clampedAmount);
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

    this.resources.forEach((amount, id) => {
      totalResources += amount;
      totalCapacity += RESOURCES_DB[id].maxCapacity;
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
        this.setResourceAmount(id, amount, 'import');
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
      this.resources.set(id as ResourceId, 0);
    });
    this.clearHistory();
  }
}
