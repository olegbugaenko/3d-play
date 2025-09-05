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

  private syncSceneFromInstance(instance: BuildingInstance): void {
    const obj = this.sceneLogic.getObjectById(instance.id);
    if (!obj) {
      console.warn(`[BuildingsManager] Scene object ${instance.id} not found for sync`);
      return;
    }
    // Single projection point -> scene/UI always mirrors the instance
    obj.data.isBuilt = this.isBuiltComputed(instance);
    obj.data.level = instance.level;
    obj.data.constructionProgress = instance.constructionProgress ?? 0;
    obj.data.resourcesCollected = instance.resourcesCollected ?? {};
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

    if (built) this.setBonusLevel(typeId, level);
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
      this.setBonusLevel(typeId, 1);
      this.syncSceneFromInstance(inst);
      return true;
    }

    // Build an unbuilt planned instance
    if (!existing.built) {
      existing.built = true;
      existing.level = 1;
      if (position) existing.position = position;
      this.setBonusLevel(typeId, 1);
      this.syncSceneFromInstance(existing);
      return true;
    }

    // Upgrade
    if (existing.level >= buildingType.maxLevel) {
      console.error(`[BuildingsManager] Building ${instanceId} already at max level`);
      return false;
    }

    existing.level += 1;
    this.setBonusLevel(typeId, existing.level);
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

    this.setBonusLevel(inst.typeId, 0);
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
      this.setBonusLevel(typeId, level);
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
      targetType: ['unload-resource', 'repair', 'upgrade'],
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
    this.generateBuilding('storage', { x: 3, y: 30, z: 3 }, 1);
    this.generateBuilding('chargingStation', { x: -3, y: 30, z: -3 }, 1);
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
      if (inst.built) this.setBonusLevel(inst.typeId, inst.level);
    });

    this.syncAllBuildingsIsBuiltStatus();
  }

  public reset(): void {
    this.buildingInstances.forEach(inst => {
      inst.level = 0;
      inst.built = false;
      inst.position = undefined;
      inst.constructionProgress = 0;
      inst.resourcesCollected = {};
      this.setBonusLevel(inst.typeId, 0);
    });
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

  public updateBuildingStatus(instanceId: string, built: boolean, level: number): void {
    const inst = this.getInstance(instanceId);
    if (!inst) {
      console.warn(`[BuildingsManager] Building instance ${instanceId} not found for status update`);
      return;
    }
    inst.built = built;
    inst.level = level;

    // Preserve original behavior: only built affects bonus level directly
    this.setBonusLevel(inst.typeId, built ? level : 0);

    this.syncSceneFromInstance(inst);
    console.log(`[BuildingsManager] Updated building ${instanceId}: built=${built}, level=${level}`);
  }

  public updateConstructionProgress(
    instanceId: string,
    progress: number,
    resourcesCollected: Record<string, number>
  ): void {
    const inst = this.getInstance(instanceId);
    if (!inst) {
      console.warn(`[BuildingsManager] Building instance ${instanceId} not found for progress update`);
      return;
    }

    inst.constructionProgress = progress;
    inst.resourcesCollected = resourcesCollected;

    this.syncSceneFromInstance(inst);
    console.log(`[BuildingsManager] Updated construction progress for ${instanceId}: progress=${progress}`);
  }
}
