import { SaveLoadManager } from '@save-load/save-load.types';
import {
  BuildingTypeData,
  BuildingInstance,
  BuildingsManagerSaveData,
} from './buildings.types';
import { BUILDINGS_DB } from './buildings-db';
import { IBuildingsManager, IBonusSystem, ISceneLogic, IRequirementsSystem, IResourceManager } from '@interfaces/index';
import { ResourceRequest } from '@resources/resource-types';

export class BuildingsManager implements SaveLoadManager, IBuildingsManager {
  private buildingsDB: Map<string, BuildingTypeData> = new Map();
  private buildingInstances: Map<string, BuildingInstance> = new Map();
  private readonly bonusSystem: IBonusSystem;
  private readonly sceneLogic: ISceneLogic;
  private readonly requirementsSystem: IRequirementsSystem;
  private readonly resourceManager: IResourceManager;

  constructor(
    bonusSystem: IBonusSystem,
    sceneLogic: ISceneLogic,
    requirementsSystem: IRequirementsSystem,
    resourceManager: IResourceManager
  ) {
    this.bonusSystem = bonusSystem;
    this.sceneLogic = sceneLogic;
    this.requirementsSystem = requirementsSystem;
    this.resourceManager = resourceManager;
  }

  // ---------- Initialization ----------

  public beforeInit(): void {
    // Copy DB
    this.buildingsDB = new Map(BUILDINGS_DB);

    // Register each building as a bonus source (same logic, less noise)
    this.buildingsDB.forEach((buildingType, typeId) => {
      if (!buildingType.modifier) return;

      this.bonusSystem.registerSource(this.getBonusSourceId(typeId), {
        name: buildingType.name,
        description: buildingType.description,
        modifiers: buildingType.modifier,
      });

      // Keep existing behavior: default enabled, level 0 -> 1.0 state
      this.bonusSystem.setSourceState(this.getBonusSourceId(typeId), 0, 1.0);
    });
  }

  public registerBuildingType(id: string, data: BuildingTypeData): void {
    this.buildingsDB.set(id, data);
  }

  // ---------- Query helpers ----------

  private ensureType(typeId: string): BuildingTypeData {
    const t = this.buildingsDB.get(typeId);
    if (!t) throw new Error(`Building type ${typeId} not registered`);
    return t;
  }

  private getInstance(instanceId: string): BuildingInstance | undefined {
    return this.buildingInstances.get(instanceId);
  }

  private isBuiltComputed(inst: BuildingInstance): boolean {
    return inst.built !== false && inst.level > 0;
  }

  private getBonusSourceId(typeId: string): string {
    return `building_source_${typeId}`;
  }

  private setBonusLevel(typeId: string, level: number): void {
    this.bonusSystem.updateBonusSourceLevel(this.getBonusSourceId(typeId), level);
  }

  /**
   * Перераховує та оновлює рівень бонусу для типу будівлі на основі сумарного рівня всіх побудованих інстансів
   */
  public updateBonusLevelForBuildingType(buildingTypeId: string): void {
    const totalLevel = this.getTotalLevelForBuildingType(buildingTypeId);
    this.setBonusLevel(buildingTypeId, totalLevel);
    console.log(`[BuildingsManager] Updated bonus level for ${buildingTypeId}: ${totalLevel}`);
  }

  private syncSceneFromInstance(instance: BuildingInstance): void {
    const obj = this.sceneLogic.getObjectById(instance.id);
    if (!obj) {
      console.warn(`[BuildingsManager] Scene object ${instance.id} not found for sync`);
      return;
    }
    // Single projection point -> scene/UI always mirrors the instance
    const computedBuilt = this.isBuiltComputed(instance);
    obj.data.isBuilt = computedBuilt;
    obj.data.built = computedBuilt; // Додаємо також built для сумісності з BuildingRenderer
    obj.data.level = instance.level;
    obj.data.constructionProgress = instance.constructionProgress ?? 0;
    obj.data.resourcesCollected = instance.resourcesCollected ?? {};
    
    console.log(`[BuildingsManager] Synced ${instance.id}: obj.data.built=${obj.data.built}, obj.data.isBuilt=${obj.data.isBuilt}, obj.data.level=${obj.data.level}`);
    
    // Встановлюємо dirty flag для оновлення рендерера
    if (obj._dirtyFlags) {
      obj._dirtyFlags.data = true;
      obj._lastUpdate = Date.now();
    }
    this.sceneLogic.markObjectDirty(obj.id);
    console.log('Invalidating');
  }

  private upsertNewInstance(
    instanceId: string,
    typeId: string,
    level: number,
    built: boolean,
    position?: { x: number; y: number; z: number }
  ): BuildingInstance {
    const inst: BuildingInstance = {
      id: instanceId,
      typeId,
      level,
      built,
      position,
      constructionProgress: 0,
      resourcesCollected: {},
    };
    this.buildingInstances.set(instanceId, inst);
    return inst;
  }

  // ---------- Public API ----------

  public setInitialState(
    instanceId: string,
    typeId: string,
    level: number = 0,
    built: boolean = false,
    position?: { x: number; y: number; z: number }
  ): void {
    this.ensureType(typeId);
    const inst = this.upsertNewInstance(instanceId, typeId, level, built, position);

    if (built) this.updateBonusLevelForBuildingType(typeId);
  }

  public planBuilding(
    instanceId: string,
    typeId: string,
    position: { x: number; y: number; z: number }
  ): boolean {
    const buildingType = this.buildingsDB.get(typeId);
    if (!buildingType) {
      console.error(`[BuildingsManager] Building type ${typeId} not found`);
      return false;
    }
    if (this.buildingInstances.has(instanceId)) {
      console.error(`[BuildingsManager] Building instance ${instanceId} already exists`);
      return false;
    }

    this.buildingInstances.set(instanceId, {
      id: instanceId,
      typeId,
      level: 0,
      built: false,
      position,
      constructionProgress: 0,
      resourcesCollected: {},
    });

    console.log(`[BuildingsManager] Planned building ${typeId} at (${position.x}, ${position.y}, ${position.z})`);
    return true;
  }

  public buildOrUpgrade(
    instanceId: string,
    typeId: string,
    position?: { x: number; y: number; z: number }
  ): boolean {
    const buildingType = this.buildingsDB.get(typeId);
    if (!buildingType) {
      console.error(`[BuildingsManager] Building type ${typeId} not found`);
      return false;
    }

    const existing = this.getInstance(instanceId);

    // Create new instance built at level 1
    if (!existing) {
      const inst = this.upsertNewInstance(instanceId, typeId, 1, true, position);
      this.updateBonusLevelForBuildingType(typeId);
      this.syncSceneFromInstance(inst);
      return true;
    }

    // Build an unbuilt planned instance
    if (!existing.built) {
      existing.built = true;
      existing.level = 1;
      if (position) existing.position = position;
      this.updateBonusLevelForBuildingType(typeId);
      this.syncSceneFromInstance(existing);
      return true;
    }

    // Upgrade
    if (existing.level >= buildingType.maxLevel) {
      console.error(`[BuildingsManager] Building ${instanceId} already at max level`);
      return false;
    }

    existing.level += 1;
    this.updateBonusLevelForBuildingType(typeId);
    this.syncSceneFromInstance(existing);
    return true;
  }

  public destroyBuilding(instanceId: string): boolean {
    const inst = this.getInstance(instanceId);
    if (!inst || !inst.built) {
      console.error(`[BuildingsManager] Building ${instanceId} not built`);
      return false;
    }

    inst.built = false;
    inst.level = 0;

    this.updateBonusLevelForBuildingType(inst.typeId);
    this.syncSceneFromInstance(inst);
    return true;
  }

  public moveBuilding(
    instanceId: string,
    newPosition: { x: number; y: number; z: number }
  ): boolean {
    const inst = this.getInstance(instanceId);
    if (!inst || !inst.built) {
      console.error(`[BuildingsManager] Building ${instanceId} not built`);
      return false;
    }
    inst.position = newPosition;
    return true;
  }

  public getBuildingCost(typeId: string, level: number): ResourceRequest | undefined {
    const buildingType = this.buildingsDB.get(typeId);
    return buildingType?.cost(level);
  }

  public getBuildingInstance(instanceId: string): BuildingInstance | undefined {
    return this.getInstance(instanceId);
  }

  public getBuildingType(typeId: string): BuildingTypeData | undefined {
    return this.buildingsDB.get(typeId);
  }

  public getAllBuildingTypes(): Map<string, BuildingTypeData> {
    return new Map(this.buildingsDB);
  }

  public getAllBuildingInstances(): Map<string, BuildingInstance> {
    return new Map(this.buildingInstances);
  }

  public isBuildingTypeRegistered(typeId: string): boolean {
    return this.buildingsDB.has(typeId);
  }

  public getBuildingTypesCount(): number {
    return this.buildingsDB.size;
  }

  public getBuiltBuildingsCount(): number {
    let count = 0;
    this.buildingInstances.forEach(i => { if (i.built) count++; });
    return count;
  }

  public generateBuilding(
    typeId: string,
    position: { x: number; y: number; z: number },
    level: number = 1,
    instanceId?: string
  ): void {
    const buildingData = this.buildingsDB.get(typeId);
    if (!buildingData) {
      console.warn(`[BuildingsManager] Unknown building type: ${typeId}`);
      return;
    }

    // Create instance if absent (keeps prior logic)
    if (!instanceId) {
      instanceId = `${typeId}_${Date.now()}_${Math.random().toString(36)}`;
      const inst = this.upsertNewInstance(instanceId, typeId, level, true, position);
      this.updateBonusLevelForBuildingType(typeId);
    }

    const inst = this.getInstance(instanceId);
    const rotationOffset = buildingData.ui?.rotationOffset || { x: 0, y: 0, z: 0 };
    const buildingObject = {
      id: instanceId,
      type: 'building',
      coordinates: position,
      scale: buildingData.ui?.defaultScale || { x: 1, y: 1, z: 1 },
      rotation: rotationOffset,
      rotation2D: rotationOffset.y,
      obstacleSize: buildingData.data?.obstacleSize || 1,
      data: {
        buildingType: typeId,
        level: inst?.level ?? level,
        typeId,
        built: inst?.built ?? true,
        constructionProgress: inst?.constructionProgress || 0,
        resourcesCollected: inst?.resourcesCollected || {},
        ...(buildingData.data || {}),
      },
      tags: ['on-ground', 'static', 'building', ...(buildingData.tags || [])],
      bottomAnchor: buildingData.ui?.bottomAnchor || 0,
      terrainAlign: true,
      targetType: ['unload-resource', 'repair', 'upgrade', 'build'],
    };

    const success = this.sceneLogic.pushObjectWithTerrainConstraint(buildingObject);
    if (!success) {
      console.warn(`[BuildingsManager] Failed to add building ${typeId} to scene`);
    } else if (inst) {
      // After it's on scene, project the canonical instance values
      this.syncSceneFromInstance(inst);
    }
  }

  public startConstruction(typeId: string, position: { x: number; y: number; z: number }): void {
    console.log(`Start construct: ${typeId}`, position);
  }

  public newGameBuildings(): void {
    this.generateBuilding('spaceship', { x: 2, y: 30, z: 2 }, 1);
    for(let i = 0; i < 2; i++) {
      const smoke = {
      id: `smoke_source_start_${i}`,
      type: 'smoke',
      coordinates: { x: 1.2 + 1.8*i, y: 0, z: 1.5 }, // Y буде встановлено terrain системою
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      data: { 
          intensity: 0.5 + Math.random() * 1.5, // 0.5-2.0 інтенсивність
          color: 0x84B4543, // темно сірий дим
          particleCount: 150 + Math.floor(Math.random() * 100), // 150-250 частинок
          riseSpeed: 3.3*(0.5 + Math.random() * 0.5), // 1.0-2.5 швидкість підйому
          spreadRadius: 0.015*(1.0 + Math.random() * 1.0), // 2.0-4.0 радіус розсіювання
          lifetime: 5.0 + Math.random() * 3.0, // 5.0-8.0 час життя
          baseSize: 24,
          flow: 0.2,
          noiseScale: 0.5,
          spreadGrow: 0.05,
          riseHeight: 5,
          emitRate: 16,
          alphaMult: 0.25,
          alphaDiminish: 0.9,
      },
      tags: ['on-ground', 'static', 'smoke'],
      bottomAnchor: 0,
      terrainAlign: false
    };
    // Додаємо джерело диму
    this.sceneLogic.pushObjectWithTerrainConstraint(smoke);
    }
    this.generateBuilding('charging_station_small', { x: -2, y: 30, z: -2 }, 1);
    this.generateBuilding('minimal_storage', { x: -2, y: 30, z: 2 }, 1);
  }

  // ---------- Save/Load ----------

  public save(): BuildingsManagerSaveData {
    return { buildingInstances: Array.from(this.buildingInstances.values()) };
  }

  public load(data: BuildingsManagerSaveData): void {
    this.buildingInstances.clear();

    // Rehydrate instances and their scene projections
    data.buildingInstances.forEach(inst => {
      this.buildingInstances.set(inst.id, { ...inst });
      if (inst.position) {
        this.generateBuilding(inst.typeId, inst.position, inst.level, inst.id);
      }
    });

    // Після завантаження всіх будівель - перераховуємо бонуси для кожного типу
    const buildingTypes = new Set(this.buildingInstances.values()).forEach(inst => inst.typeId);
    for (const typeId of new Set([...this.buildingInstances.values()].map(inst => inst.typeId))) {
      this.updateBonusLevelForBuildingType(typeId);
    }

    this.syncAllBuildingsIsBuiltStatus();

    console.log('this.buildingInstances', this.buildingInstances);
  }

  public reset(): void {
    const typesToUpdate = new Set<string>();
    
    this.buildingInstances.forEach(inst => {
      inst.level = 0;
      inst.built = false;
      inst.position = undefined;
      inst.constructionProgress = 0;
      inst.resourcesCollected = {};
      typesToUpdate.add(inst.typeId);
    });

    // Оновлюємо бонуси для всіх типів що були змінені (всі будуть 0)
    for (const typeId of typesToUpdate) {
      this.updateBonusLevelForBuildingType(typeId);
    }
  }

  // ---------- Stats & availability ----------

  public getBuildingTypeCount(buildingTypeId: string): number {
    let count = 0;
    for (const inst of this.buildingInstances.values()) {
      if (inst.typeId === buildingTypeId && inst.built) count++;
    }
    return count;
  }

  public canBuild(buildingTypeId: string): boolean {
    const buildingData = this.buildingsDB.get(buildingTypeId);
    if (!buildingData) return false;

    if (buildingData.maxQuantity) {
      if (this.getBuildingTypeCount(buildingTypeId) >= buildingData.maxQuantity) return false;
    }

    if (!buildingData.requirements || buildingData.requirements.length === 0) return true;

    return this.requirementsSystem.checkRequirements(buildingData.requirements).satisfied;
  }

  public getAvailableBuildingTypes(): BuildingTypeData[] {
    return Array.from(this.buildingsDB.values()).filter(b => this.canBuild(b.id));
  }

  public getTotalLevelForBuildingType(buildingTypeId: string): number {
    let total = 0;
    for (const inst of this.buildingInstances.values()) {
      if (inst.typeId === buildingTypeId && inst.built) total += inst.level;
    }
    return total;
  }

  /**
   * Перевіряє чи можна розмістити будівлю в заданій позиції
   */
  public canPlaceBuildingAt(
    position: { x: number; y: number; z: number }, 
    buildingTypeId: string
  ): boolean {
    const buildingType = this.buildingsDB.get(buildingTypeId);
    if (!buildingType) {
      console.warn(`[BuildingsManager] Building type ${buildingTypeId} not found`);
      return false;
    }
    
    const obstacleSize = buildingType.data?.obstacleSize || 1.0;
    
    // Створюємо тимчасовий об'єкт для перевірки колізій
    const tempObject = {
      id: 'temp_placement_check',
      type: 'building',
      coordinates: position,
      obstacleSize: obstacleSize,
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      data: {},
      tags: ['static', 'building'],
      bottomAnchor: 0,
      terrainAlign: false,
      targetType: []
    };
    
    // Використовуємо існуючу систему перешкод для перевірки
    return this.sceneLogic.pathfinder.canStandAtWorld(
      position.x, 
      position.z, 
      tempObject, 
      0.1 // safety margin
    );
  }

  public getMaxLevelForBuildingType(buildingTypeId: string): number {
    let max = 0;
    for (const inst of this.buildingInstances.values()) {
      if (inst.typeId === buildingTypeId && inst.built) max = Math.max(max, inst.level);
    }
    return max;
  }

  public listBuildingsForUI(): Array<{
    typeId: string;
    name: string;
    description: string;
    currentCount: number;
    maxQuantity?: number;
    canBuild: boolean;
    costCheck: any;
    bonusDetails: any[];
  }> {
    const out: Array<any> = [];

    for (const [typeId, buildingType] of this.buildingsDB) {
      const currentCount = this.getBuildingTypeCount(typeId);
      const canBuild = this.canBuild(typeId);

      const buildingCost = buildingType.cost(1);
      const nextReq = this.convertBuildingCostToResourceRequest(buildingCost);
      const costCheck = this.resourceManager.checkResources(nextReq);

      const bonusDetails = this.bonusSystem.getBonusDetails(this.getBonusSourceId(typeId));

      out.push({
        typeId,
        name: buildingType.name,
        description: buildingType.description,
        currentCount,
        maxQuantity: buildingType.maxQuantity,
        canBuild,
        costCheck,
        bonusDetails,
      });
    }

    return out;
  }

  private convertBuildingCostToResourceRequest(buildingCost: any): ResourceRequest {
    const req: ResourceRequest = {};
    if (buildingCost.energy) req.energy = buildingCost.energy;
    if (buildingCost.stone) req.stone = buildingCost.stone;
    if (buildingCost.ore) req.ore = buildingCost.ore;
    return req;
  }

  // ---------- Scene sync (single projection) ----------

  public syncBuildingIsBuiltStatus(instanceId: string): void {
    const inst = this.getInstance(instanceId);
    if (!inst) {
      console.warn(`[BuildingsManager] Building instance ${instanceId} not found for sync`);
      return;
    }
    this.syncSceneFromInstance(inst);
    console.log(`[BuildingsManager] Synced isBuilt=${this.isBuiltComputed(inst)} for ${instanceId} (built=${inst.built}, level=${inst.level})`);
  }

  public syncAllBuildingsIsBuiltStatus(): void {
    console.log(`[BuildingsManager] Syncing isBuilt status for ${this.buildingInstances.size} buildings`);
    for (const inst of this.buildingInstances.values()) this.syncSceneFromInstance(inst);
  }

  // ---------- Mutations that also project ----------

  /**
   * Завершує будівництво - встановлює built=true, level=1, очищає флаги будівництва, оновлює бонуси
   */
  public completeBuildingConstruction(instanceId: string): void {
    const inst = this.getInstance(instanceId);
    if (!inst) {
      console.warn(`[BuildingsManager] Building instance ${instanceId} not found for completion`);
      return;
    }

    // Встановлюємо як побудовану з рівнем 1
    inst.built = true;
    inst.level = 1;
    
    // Очищаємо флаги будівництва
    inst.constructionProgress = 1.0;
    inst.resourcesCollected = {};

    // Оновлюємо бонуси для цього типу будівлі
    this.updateBonusLevelForBuildingType(inst.typeId);

    // Синхронізуємо з 3D сценою (це встановить dirty flag)
    this.syncSceneFromInstance(inst);
    
    console.log(`[BuildingsManager] Building ${instanceId} (${inst.typeId}) construction completed!`);
    console.log(`[BuildingsManager] Instance state: built=${inst.built}, level=${inst.level}, isBuiltComputed=${this.isBuiltComputed(inst)}`);
  }

  public updateBuildingStatus(instanceId: string, built: boolean, level: number): void {
    const inst = this.getInstance(instanceId);
    if (!inst) {
      console.warn(`[BuildingsManager] Building instance ${instanceId} not found for status update`);
      return;
    }
    inst.built = built;
    inst.level = level;

    // Оновлюємо бонуси правильно - сумарний рівень всіх побудованих будівель цього типу
    this.updateBonusLevelForBuildingType(inst.typeId);

    this.syncSceneFromInstance(inst);
    console.log(`[BuildingsManager] Updated building ${instanceId}: built=${built}, level=${level}`);
  }

  public updateConstructionProgress(
    instanceId: string,
    progress: number,
    resourcesCollected?: Record<string, number>
  ): void {
    const inst = this.getInstance(instanceId);
    if (!inst) {
      console.warn(`[BuildingsManager] Building instance ${instanceId} not found for progress update`);
      return;
    }

    inst.constructionProgress = progress;
    
    // Тільки якщо передано - оновлюємо ресурси
    if (resourcesCollected !== undefined) {
      inst.resourcesCollected = resourcesCollected;
    }

    console.log('updateConstructionProgress');

    this.syncSceneFromInstance(inst);
    console.log(`[BuildingsManager] Updated construction progress for ${instanceId}: progress=${progress}`);
  }
}
