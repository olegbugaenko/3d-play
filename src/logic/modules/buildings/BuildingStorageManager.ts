import { IBonusSystem } from '../../interfaces/IBonusSystem';
import { ISceneLogic } from '../../interfaces/ISceneLogic';
import { BuildingsManager } from './BuildingsManager';
import { BuildingTypeId } from './buildings.types';

/**
 * Manages internal storage for buildings with dynamic capacity and production rates
 * based on bonus system effects.
 */
export class BuildingStorageManager {
  private bonusSystem: IBonusSystem;
  private sceneLogic: ISceneLogic;
  private buildingsManager: BuildingsManager;

  constructor(
    bonusSystem: IBonusSystem,
    sceneLogic: ISceneLogic,
    buildingsManager: BuildingsManager
  ) {
    this.bonusSystem = bonusSystem;
    this.sceneLogic = sceneLogic;
    this.buildingsManager = buildingsManager;
  }

  /**
   * Updates internal storage for all buildings with internal storage.
   * Called every game tick.
   */
  public tick(deltaTime: number): void {
    const buildingsWithStorage = Array.from(this.buildingsManager.getBuildingInstances().values())
      .filter(building => building.built && building.internalStorage);

    buildingsWithStorage.forEach(building => {
      this.updateBuildingInternalStorage(building.id, deltaTime);
    });
  }

  /**
   * Updates internal storage for a specific building including:
   * - Dynamic capacity calculation based on bonuses
   * - Resource consumption from internal storage
   * - Resource production into internal storage
   * - Functional state management
   */
  private updateBuildingInternalStorage(buildingId: string, deltaTime: number): void {
    const building = this.buildingsManager.getInstance(buildingId);
    if (!building || !building.built || !building.internalStorage) return;

    const buildingData = this.buildingsManager.getBuildingsDB().get(building.typeId);
    if (!buildingData) return;

    let isFunctional = true;
    let storageChanged = false;

    // Update storage capacities based on bonuses
    this.updateStorageCapacities(building);

    // 1. CONSUMPTION from internal storage
    if (buildingData.data?.consumption) {
      Object.entries(buildingData.data.consumption).forEach(([resourceId, consumptionFormula]) => {
        const storage = building.internalStorage![resourceId];
        if (storage) {
          const consumptionRate = typeof consumptionFormula === 'function' 
            ? consumptionFormula(building.level) 
            : consumptionFormula as number;
          
          const consumed = consumptionRate * deltaTime;
          const newCurrent = Math.max(0, storage.current - consumed);
          if (Math.abs(newCurrent - storage.current) > 1e-6) storageChanged = true;
          storage.current = newCurrent;
          
          if (newCurrent <= 0) {
            isFunctional = false; // Stop if consumed resource is empty
          }
        }
      });
    }

    // 2. PRODUCTION into internal storage (with bonus modifications)
    if (buildingData.data?.internalProduction && isFunctional) {
      Object.entries(buildingData.data.internalProduction).forEach(([resourceId, productionFormula]) => {
        const storage = building.internalStorage![resourceId];
        if (storage) {
          const baseProductionRate = typeof productionFormula === 'function'
            ? productionFormula(building.level)
            : productionFormula as number;
          
          // Apply production rate bonuses
          const modifiedProductionRate = this.getModifiedProductionRate(
            buildingId, resourceId, baseProductionRate
          );
          
          const produced = modifiedProductionRate * deltaTime;
          const newCurrent = Math.min(storage.capacity, storage.current + produced);
          if (Math.abs(newCurrent - storage.current) > 1e-6) storageChanged = true;
          storage.current = newCurrent;
          
          if (newCurrent >= storage.capacity) {
            isFunctional = false; // Stop if produced storage is full
          }
        }
      });
    }
    
    // Update functional state and mark dirty if changed
    const prevFunctional = building.isFunctional;
    building.isFunctional = isFunctional;
    if (prevFunctional !== isFunctional || storageChanged) {
      this.sceneLogic.markObjectDirty(buildingId);
      if (prevFunctional !== isFunctional) {
        try {
          (this.buildingsManager as any).updateBonusLevelForBuildingType(building.typeId);
        } catch {}
      }
    }
    
    building.lastUpdateTime = Date.now();
  }

  /**
   * Updates storage capacities for a building based on current bonuses
   */
  private updateStorageCapacities(building: any): void {
    if (!building.internalStorage) return;

    const buildingData = this.buildingsManager.getBuildingsDB().get(building.typeId);
    if (!buildingData?.data?.internalStorageConfig) return;

    const storageMap = building.internalStorage as any as Record<string, { current: number; capacity: number }>;
    Object.keys(storageMap).forEach((resourceId) => {
      const storage = storageMap[resourceId];
      const baseCapacity = buildingData.data!.internalStorageConfig![resourceId]?.capacity || 0;
      const newCapacity = this.getModifiedStorageCapacity(building.id, resourceId, baseCapacity);
      
      if (storage.capacity !== newCapacity) {
        const oldCapacity = storage.capacity;
        storage.capacity = newCapacity;
        
        // Handle overflow if capacity decreased
        if (storage.current > newCapacity) {
          const overflow = storage.current - newCapacity;
          storage.current = newCapacity;
          console.warn(`[BuildingStorage] ${building.id} ${resourceId} overflow: ${overflow} lost (${oldCapacity} → ${newCapacity})`);
        }
        
        console.log(`[BuildingStorage] ${building.id} ${resourceId} capacity: ${oldCapacity} → ${newCapacity}`);
        this.sceneLogic.markObjectDirty(building.id);
      }
    });
  }

  /**
   * Calculates modified storage capacity based on bonuses
   */
  private getModifiedStorageCapacity(buildingId: string, resourceType: string, baseCapacity: number): number {
    const building = this.buildingsManager.getInstance(buildingId);
    if (!building) return baseCapacity;

    // For now, just return base capacity - building-specific bonuses will be implemented later
    // TODO: Implement building-specific bonus system
    const bonusKey = `${building.typeId}_${resourceType}_storage_capacity`;
    const storageBonus = this.bonusSystem.getEffectValue(bonusKey) || 0;
    
    return Math.floor(baseCapacity * (1 + storageBonus));
  }

  /**
   * Calculates modified production rate based on bonuses
   */
  private getModifiedProductionRate(buildingId: string, resourceType: string, baseRate: number): number {
    const building = this.buildingsManager.getInstance(buildingId);
    if (!building) return baseRate;

    // For now, just return base rate - building-specific bonuses will be implemented later
    // TODO: Implement building-specific bonus system
    const bonusKey = `${building.typeId}_${resourceType}_production_rate`;
    const productionBonus = this.bonusSystem.getEffectValue(bonusKey) || 0;
    
    return baseRate * (1 + productionBonus);
  }

  /**
   * Gets current storage info for debugging/UI
   */
  public getBuildingStorageInfo(buildingId: string): Record<string, {current: number, capacity: number, percentage: number}> | null {
    const building = this.buildingsManager.getInstance(buildingId);
    if (!building?.internalStorage) return null;

    const buildingData = this.buildingsManager.getBuildingsDB().get(building.typeId);
    const info: Record<string, {current: number, capacity: number, percentage: number}> = {};

    const map = building.internalStorage as any as Record<string, { current: number; capacity: number }>;
    Object.keys(map).forEach((resourceId) => {
      const storage: { current: number; capacity: number } = map[resourceId] as any;
      const baseCapacity = buildingData?.data?.internalStorageConfig?.[resourceId]?.capacity ?? storage.capacity;
      const effectiveCapacity = this.getModifiedStorageCapacity(buildingId, resourceId, baseCapacity);
      const safeCapacity = Math.max(1e-6, effectiveCapacity);

      info[resourceId] = {
        current: Math.round(storage.current * 10) / 10,
        capacity: safeCapacity,
        percentage: Math.round((storage.current / safeCapacity) * 100)
      };
    });

    return info;
  }

  /**
   * Checks if building needs refill (any internal storage below threshold)
   */
  public doesBuildingNeedRefill(buildingId: string, threshold: number = 0.2): boolean {
    const building = this.buildingsManager.getInstance(buildingId);
    if (!building?.internalStorage) return false;

    return Object.values(building.internalStorage).some(storage => {
      return (storage.current / storage.capacity) < threshold;
    });
  }

  /**
   * Gets missing resources for a building's internal storage
   */
  public getBuildingMissingResources(buildingId: string): Record<string, number> {
    const building = this.buildingsManager.getInstance(buildingId);
    if (!building?.internalStorage) return {};

    const missing: Record<string, number> = {};
    
    Object.entries(building.internalStorage).forEach(([resourceId, storage]) => {
      const needed = storage.capacity - storage.current;
      if (needed > 0) {
        missing[resourceId] = Math.ceil(needed);
      }
    });

    return missing;
  }

  // ===== Planner helpers for interaction/commands =====
  public getIOFlags(buildingTypeId: BuildingTypeId): Record<string, { acceptsInput?: boolean; providesOutput?: boolean }> {
    const t = this.buildingsManager.getBuildingsDB().get(buildingTypeId);
    const cfg = (t?.data?.internalStorageConfig || {}) as Record<string, any>;
    const out: Record<string, { acceptsInput?: boolean; providesOutput?: boolean }> = {};
    Object.keys(cfg).forEach(r => {
      out[r] = { acceptsInput: !!cfg[r]?.acceptsInput, providesOutput: !!cfg[r]?.providesOutput };
    });
    return out;
  }

  public pickBuildingTransferAction(
    buildingId: string,
    thresholds: { full: number; empty: number; lowOut: number; highIn: number; hysteresis?: number } = { full: 0.8, empty: 0.2, lowOut: 0.2, highIn: 0.8 }
  ): { direction: 'from-building' | 'to-building'; resourceId: string } | null {
    const info = this.getBuildingStorageInfo(buildingId);
    const inst = this.buildingsManager.getInstance(buildingId);
    if (!info || !inst) return null;
    const flags = this.getIOFlags(inst.typeId);

    const entries = Object.entries(info);
    const outputs = entries.filter(([rid]) => flags[rid]?.providesOutput);
    const inputs  = entries.filter(([rid]) => flags[rid]?.acceptsInput);

    const byFillDesc = (a: any, b: any) => (b[1].percentage - a[1].percentage);
    const byFillAsc  = (a: any, b: any) => (a[1].percentage - b[1].percentage);

    const fullOut = outputs.filter(([,v]) => v.percentage >= thresholds.full*100).sort(byFillDesc)[0];
    if (fullOut) return { direction: 'from-building', resourceId: fullOut[0] };

    const emptyIn = inputs.filter(([,v]) => v.percentage <= thresholds.empty*100).sort(byFillAsc)[0];
    if (emptyIn) return { direction: 'to-building', resourceId: emptyIn[0] };

    const lowOut = outputs.filter(([,v]) => v.percentage >= thresholds.lowOut*100).sort(byFillDesc)[0];
    if (lowOut) return { direction: 'from-building', resourceId: lowOut[0] };

    const needIn = inputs.filter(([,v]) => v.percentage <= thresholds.highIn*100).sort(byFillAsc)[0];
    if (needIn) return { direction: 'to-building', resourceId: needIn[0] };

    return null;
  }
}
