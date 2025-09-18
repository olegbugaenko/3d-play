import { SaveLoadManager } from '@save-load/save-load.types';
import {
  BuildingTypeData,
  BuildingInstance,
  BuildingsManagerSaveData,
  RoadTypeData,
  RoadInstance,
} from './buildings.types';
import { BUILDINGS_DB, ROADS_DB } from './buildings-db';
import { IBuildingsManager, IBonusSystem, ISceneLogic, IRequirementsSystem, IResourceManager } from '@interfaces/index';
import { ResourceRequest } from '@resources/resource-types';
import { BuildingStorageManager } from './BuildingStorageManager';
import { TSceneObject } from '@scene/scene.types';

export class BuildingsManager implements SaveLoadManager, IBuildingsManager {
  private buildingsDB: Map<string, BuildingTypeData> = new Map();
  private buildingInstances: Map<string, BuildingInstance> = new Map();
  
  // Підтримка доріг
  private roadsDB: Map<string, RoadTypeData> = new Map();
  private roadInstances: Map<string, RoadInstance> = new Map();
  
  private readonly bonusSystem: IBonusSystem;
  private readonly sceneLogic: ISceneLogic;
  private readonly requirementsSystem: IRequirementsSystem;
  private readonly resourceManager: IResourceManager;
  private storageManager: BuildingStorageManager | null = null;

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
    this.roadsDB = new Map(ROADS_DB);

    // Initialize storage manager
    this.storageManager = new BuildingStorageManager(
      this.bonusSystem,
      this.sceneLogic,
      this
    );

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

  public getInstance(instanceId: string): BuildingInstance | undefined {
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

    // НОВЕ: Ініціалізуємо внутрішні склади якщо вони є
    if (buildingData.data?.internalStorageConfig) {
      let internalStorage: Record<string, {capacity: number; current: number}> = {};
      
      // Якщо інстанс вже існує і має внутрішній склад – зберігаємо його значення
      if (inst?.internalStorage) {
        internalStorage = { ...inst.internalStorage };
        // Оновлюємо capacity з конфігу, current залишаємо як є
        Object.entries(buildingData.data.internalStorageConfig).forEach(([resourceId, config]: [string, any]) => {
          const prev = internalStorage[resourceId] || { capacity: config.capacity, current: config.defaultCurrent || 0 };
          internalStorage[resourceId] = { capacity: config.capacity, current: prev.current };
        });
      } else {
        Object.entries(buildingData.data.internalStorageConfig).forEach(([resourceId, config]: [string, any]) => {
          internalStorage[resourceId] = {
            capacity: config.capacity,
            current: config.defaultCurrent || 0
          };
        });
      }
      
      (buildingObject.data as any).internalStorage = internalStorage;
      (buildingObject.data as any).isFunctional = inst?.isFunctional ?? true;
      
      if (inst) {
        inst.internalStorage = internalStorage;
        if (inst.isFunctional === undefined) inst.isFunctional = true;
      }
    }

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
    
    // 🚀 TEST: Додаємо тестові біо-будівлі для швидкого тесту storage індикації
    console.log('[TEST] Adding test bio buildings for storage testing...');
    
    // Біо-інкубатор (виробляє біомасу у внутрішній склад)
    const bioIncubatorPos = { x: 3 + Math.random() * 4, y: 30, z: -1 + Math.random() * 2 }; // x: 3-7, z: -1 to 1
    this.generateBuilding('bioIncubator', bioIncubatorPos, 1);
    console.log(`[TEST] Generated bioIncubator at (${bioIncubatorPos.x.toFixed(1)}, ${bioIncubatorPos.z.toFixed(1)})`);
    
    // Біо-генератор (споживає біомасу з внутрішнього складу)
    const bioGeneratorPos = { x: -5 + Math.random() * 4, y: 30, z: -1 + Math.random() * 2 }; // x: -5 to -1, z: -1 to 1
    this.generateBuilding('bioGenerator', bioGeneratorPos, 1);
    console.log(`[TEST] Generated bioGenerator at (${bioGeneratorPos.x.toFixed(1)}, ${bioGeneratorPos.z.toFixed(1)})`);
    
    const roadId = this.generateRoads('basic_road', [
      {x: -5, z: 5},
      {x: -5, z: -5}, 
      {x: 5, z: -5}
    ]);

    const roadId2 = this.generateRoads('basic_road', [
      {x: -5, z: -5},
      {x: -10, z: -10}
    ]);
    // Додаємо трохи біомаси в генератор для початкового тесту
    setTimeout(() => {
      const generatorInstances = Array.from(this.buildingInstances.values())
        .filter(b => b.typeId === 'bioGenerator' && b.built);
      
      if (generatorInstances.length > 0) {
        const generator = generatorInstances[0];
        if (generator.internalStorage && generator.internalStorage['biomass']) {
          generator.internalStorage['biomass'].current = 10; // Додаємо 10 біомаси для початку
          console.log(`[TEST] Added 10 biomass to generator ${generator.id} for initial testing`);
        }
      }
    }, 1000); // Чекаємо секунду після генерації
  }

  // ---------- Save/Load ----------

  public save(): BuildingsManagerSaveData {
    return { 
      buildingInstances: Array.from(this.buildingInstances.values()),
      roadInstances: Array.from(this.roadInstances.values())
    };
  }

  public load(data: BuildingsManagerSaveData): void {
    this.buildingInstances.clear();
    this.roadInstances.clear();

    // Rehydrate instances and their scene projections
    data.buildingInstances.forEach(inst => {
      this.buildingInstances.set(inst.id, { ...inst });
      if (inst.position) {
        this.generateBuilding(inst.typeId, inst.position, inst.level, inst.id);
      }
    });

    // Rehydrate roads if present
    if (data.roadInstances) {
      data.roadInstances.forEach(road => {
        this.roadInstances.set(road.id, { ...road });
        if (road.built) {
          this.addRoadToPathfinding(road);
        }
      });
    }

    // Після завантаження всіх будівель - перераховуємо бонуси для кожного типу
    const buildingTypes = new Set(this.buildingInstances.values()).forEach(inst => inst.typeId);
    for (const typeId of new Set([...this.buildingInstances.values()].map(inst => inst.typeId))) {
      this.updateBonusLevelForBuildingType(typeId);
    }

    this.syncAllBuildingsIsBuiltStatus();

    console.log('this.buildingInstances', this.buildingInstances);
    console.log('this.roadInstances', this.roadInstances);
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

    // Очищаємо всі дороги
    this.clearAllRoads();

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
      if (inst.typeId === buildingTypeId && inst.built && inst.isFunctional !== false) {
        total += inst.level;
      }
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
    
    // Перевіряємо чи немає дороги в цій позиції
    const pathfindingSystem = this.sceneLogic.pathfinder;
    if (pathfindingSystem && pathfindingSystem.isRoadAtWorld(position.x, position.z)) {
      console.warn(`[BuildingsManager] Cannot place building on road at (${position.x.toFixed(2)}, ${position.z.toFixed(2)})`);
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

  // ==================== Game Loop Integration ====================
  
  /**
   * Основний тік для оновлення всіх будівель з внутрішніми складами
   */
  public tick(deltaTime: number): void {
    // Delegate internal storage management to BuildingStorageManager
    if (this.storageManager) {
      this.storageManager.tick(deltaTime);
    }
  }

  // ==================== Internal Storage Management ====================
  
  /**
   * Оновлює внутрішні склади будівлі (споживання і виробництво ресурсів)
   */
  public updateBuildingInternalStorage(buildingId: string, deltaTime: number): void {
    const building = this.getInstance(buildingId);
    if (!building || !building.built || !building.internalStorage) return;
    
    const buildingData = this.buildingsDB.get(building.typeId);
    if (!buildingData) return;
    
    let isFunctional = true;
    
    // 1. СПОЖИВАННЯ ресурсів з внутрішніх складів
    if (buildingData.data?.consumption) {
      Object.entries(buildingData.data.consumption).forEach(([resourceId, consumptionFormula]) => {
        const storage = building.internalStorage![resourceId];
        if (storage) {
          // Розраховуємо споживання за формулою залежно від рівня будівлі
          const consumptionRate = typeof consumptionFormula === 'function' 
            ? consumptionFormula(building.level)
            : consumptionFormula as number;
            
          const consumed = consumptionRate * deltaTime;
          const newCurrent = Math.max(0, storage.current - consumed);
          
          storage.current = newCurrent;
          
          // Якщо ресурс вичерпався - будівля не функціонує
          if (newCurrent <= 0) {
            isFunctional = false;
          }
        }
      });
    }
    
    // 2. ВИРОБНИЦТВО ресурсів у внутрішні склади (для bioIncubator)
    if (building.typeId === 'bioIncubator' && building.isFunctional) {
      const biomassStorage = building.internalStorage['biomass'];
      if (biomassStorage) {
        // Розраховуємо виробництво біомаси (з modifier)
        const productionRate = this.getBuildingResourceIncome(building, 'biomass');
        const produced = productionRate * deltaTime;
        const newCurrent = Math.min(biomassStorage.capacity, biomassStorage.current + produced);
        
        biomassStorage.current = newCurrent;
      }
    }
    
    // Оновлюємо стан функціонування
    const prevFunctional = building.isFunctional;
    building.isFunctional = isFunctional;
    
    // Якщо стан змінився - оновлюємо сцену
    if (prevFunctional !== isFunctional) {
      this.sceneLogic.markObjectDirty(buildingId);
      console.log(`[BuildingsManager] Building ${buildingId} functional state changed: ${isFunctional}`);
    }
    
    building.lastUpdateTime = Date.now();
  }

  /**
   * Отримує швидкість виробництва ресурсу будівлею з modifier
   */
  private getBuildingResourceIncome(building: any, resourceId: string): number {
    const buildingData = this.buildingsDB.get(building.typeId);
    if (!buildingData?.modifier?.resource?.income?.[resourceId]) return 0;
    
    const incomeConfig = buildingData.modifier.resource.income[resourceId];
    const formula = incomeConfig.formula({ level: building.level });
    
    // Простий розрахунок лінійної формули: A * level + B
    return formula.A * building.level + formula.B;
  }

  /**
   * Отримує внутрішні склади будівлі
   */
  public getBuildingInternalStorage(buildingId: string): Record<string, {capacity: number; current: number}> | null {
    const building = this.getInstance(buildingId);
    return building?.internalStorage || null;
  }

  /**
   * Заповнює внутрішній склад будівлі ресурсом
   */
  public refillBuildingStorage(buildingId: string, resourceId: string, amount: number): boolean {
    const building = this.getInstance(buildingId);
    if (!building?.internalStorage?.[resourceId]) {
      console.warn(`[BuildingsManager] Building ${buildingId} has no internal storage for ${resourceId}`);
      return false;
    }
    
    const storage = building.internalStorage[resourceId];
    const canAdd = Math.min(amount, storage.capacity - storage.current);
    
    if (canAdd > 0) {
      storage.current += canAdd;
      
      // Перевіряємо чи будівля знову може функціонувати
      const hasAllResources = Object.values(building.internalStorage).every(s => s.current > 0);
      if (hasAllResources && !building.isFunctional) {
        building.isFunctional = true;
        this.sceneLogic.markObjectDirty(buildingId);
        console.log(`[BuildingsManager] Building ${buildingId} restored to functional state`);
      }
      
      // Синхронізуємо з сценою
      this.syncSceneFromInstance(building);
      
      console.log(`[BuildingsManager] Refilled ${canAdd} ${resourceId} to building ${buildingId}`);
      return true;
    }
    
    return false;
  }


  // ==================== Public API for Storage Info ====================

  /**
   * Gets current storage info for debugging/UI (delegated to BuildingStorageManager)
   */
  public getBuildingStorageInfo(buildingId: string): Record<string, {current: number, capacity: number, percentage: number}> | null {
    return this.storageManager?.getBuildingStorageInfo(buildingId) || null;
  }

  /**
   * Checks if building needs refill (delegated to BuildingStorageManager)
   */
  public doesBuildingNeedRefill(buildingId: string, threshold: number = 0.2): boolean {
    return this.storageManager?.doesBuildingNeedRefill(buildingId, threshold) || false;
  }

  /**
   * Gets missing resources for building's internal storage (delegated to BuildingStorageManager)
   */
  public getBuildingMissingResourcesFromStorage(buildingId: string): Record<string, number> {
    return this.storageManager?.getBuildingMissingResources(buildingId) || {};
  }

  /**
   * Public access to buildings DB for BuildingStorageManager
   */
  public getBuildingsDB(): Map<string, BuildingTypeData> {
    return this.buildingsDB;
  }

  /**
   * Public access to building instances for BuildingStorageManager
   */
  public getBuildingInstances(): Map<string, BuildingInstance> {
    return this.buildingInstances;
  }

  // ──────────────────────────────
  //         Дорожні методи
  // ──────────────────────────────

  /**
   * Генерує дорогу заданого типу по шляху з точок
   */
  public generateRoads(type: string, path: Array<{x: number, z: number}>): string | null {
    const roadType = this.roadsDB.get(type);
    if (!roadType) {
      console.warn(`[BuildingsManager] Road type ${type} not found`);
      return null;
    }

    if (path.length < 2) {
      console.warn(`[BuildingsManager] Road path must contain at least 2 points`);
      return null;
    }

    // Конвертуємо 2D точки в 3D (додаємо Y = 0)
    const path3D = path.map(p => ({ x: p.x, y: 0, z: p.z }));

    // Обчислюємо загальну довжину
    let totalLength = 0;
    for (let i = 1; i < path3D.length; i++) {
      const prev = path3D[i - 1];
      const curr = path3D[i];
      totalLength += Math.hypot(curr.x - prev.x, curr.z - prev.z);
    }

    // Перевіряємо чи є достатньо ресурсів
    const costPerMeter = roadType.cost(1);
    const totalCost: Record<string, number> = {};
    for (const [resource, costPerM] of Object.entries(costPerMeter)) {
      totalCost[resource] = costPerM * totalLength;
    }

    // Перевіряємо наявність ресурсів
    /* for (const [resource, amount] of Object.entries(totalCost)) {
      if (this.resourceManager.getResourceAmount(resource as any) < amount) {
        console.warn(`[BuildingsManager] Not enough ${resource}: need ${amount}, have ${this.resourceManager.getResourceAmount(resource as any)}`);
        return null;
      }
    }
    */
    // Створюємо унікальний ID для дороги
    const roadId = `road_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Створюємо інстанс дороги
    const roadInstance: RoadInstance = {
      id: roadId,
      typeId: type,
      path: path3D,
      built: false,
      totalLength,
      constructionProgress: 0
    };

    this.roadInstances.set(roadId, roadInstance);
    /*
    // Списуємо ресурси
    const resourceChanges = Object.entries(totalCost).map(([resource, amount]) => ({
      resourceId: resource as any,
      amount: -amount // негативне значення для витрат
    }));
    this.resourceManager.spendResources(resourceChanges);
    */
    // Додаємо сегменти дороги в PathfindingSystem
    this.addRoadToPathfinding(roadInstance);

    // Позначаємо як побудовану
    roadInstance.built = true;
    roadInstance.constructionProgress = 1.0;

    console.log(`[BuildingsManager] Created road ${roadId} with length ${totalLength.toFixed(2)}m`);
    return roadId;
  }

  /**
   * Видаляє дорогу
   */
  public removeRoad(roadId: string): boolean {
    const road = this.roadInstances.get(roadId);
    if (!road) return false;

    // Видаляємо з PathfindingSystem
    this.removeRoadFromPathfinding(road);

    // Видаляємо з нашої мапи
    this.roadInstances.delete(roadId);

    console.log(`[BuildingsManager] Removed road ${roadId}`);
    return true;
  }

  /**
   * Очищає всі дороги
   */
  public clearAllRoads(): void {
    // Видаляємо всі дороги з PathfindingSystem
    this.roadInstances.forEach(road => {
      this.removeRoadFromPathfinding(road);
    });

    this.roadInstances.clear();
    console.log(`[BuildingsManager] Cleared all roads`);
  }

  /**
   * Отримує інформацію про дорогу
   */
  public getRoadInfo(roadId: string): RoadInstance | null {
    return this.roadInstances.get(roadId) || null;
  }

  /**
   * Отримує всі дороги
   */
  public getAllRoads(): RoadInstance[] {
    return Array.from(this.roadInstances.values());
  }

  /**
   * Отримує типи доріг
   */
  public getRoadTypes(): Map<string, RoadTypeData> {
    return this.roadsDB;
  }

  // ──────────────────────────────
  //    Приватні методи для доріг
  // ──────────────────────────────

  private addRoadToPathfinding(road: RoadInstance): void {
    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return;

    const pathfinder = this.sceneLogic.pathfinder;
    
    // Додаємо кожен сегмент дороги в pathfinding
    for (let i = 1; i < road.path.length; i++) {
      const start = road.path[i - 1];
      const end = road.path[i];
      
      const segmentId = `${road.id}_segment_${i}`;
      pathfinder.addRoadSegment(
        segmentId,
        start.x, start.z,
        end.x, end.z,
        roadType.width,
        roadType.speedBonus
      );
    }

    // Додаємо дорогу як 3D об'єкт в сцену
    this.addRoadToScene(road);
  }

  private addRoadToScene(road: RoadInstance): void {
    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return;

    // Адаптуємо дорогу до террейну і дробимо на короткі сегменти
    const adaptedSegments = this.adaptRoadToTerrain(road.path, roadType.width);

    // Створюємо TSceneObject для дороги
    const roadObject: TSceneObject = {
      id: road.id,
      type: 'road',
      coordinates: { x: 0, y: 0, z: 0 }, // буде проігноровано через roadSegments
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      data: { 
        roadSegments: adaptedSegments,
        roadTypeId: road.typeId,
        speedBonus: roadType.speedBonus
      },
      tags: ['road', 'infrastructure'],
      bottomAnchor: 0,
      terrainAlign: false
    };

    // Додаємо в сцену
    const success = this.sceneLogic.pushObjectWithTerrainConstraint(roadObject);
    if (!success) {
      console.warn(`[BuildingsManager] Failed to add road ${road.id} to scene`);
    } else {
      console.log(`[BuildingsManager] Added road ${road.id} to 3D scene`);
    }
  }

  /**
   * Адаптує дорогу до террейну, дробить довгі сегменти і розраховує правильні висоти
   */
  private adaptRoadToTerrain(
    path: Array<{x: number, y: number, z: number}>, 
    width: number
  ): Array<{startLeft: {x: number, y: number, z: number}, startRight: {x: number, y: number, z: number}, endLeft: {x: number, y: number, z: number}, endRight: {x: number, y: number, z: number}, width: number}> {
    if (path.length < 2) return [];

    const terrainManager = this.sceneLogic.getTerrainManager();
    if (!terrainManager) {
      console.warn('[BuildingsManager] No terrain manager available for road adaptation');
      return this.createBasicRoadSegments(path, width);
    }

    // Спочатку створюємо точки з адаптацією до террейну
    const adaptedPoints = path.map(point => this.adaptPointToTerrain(point, terrainManager));
    
    // Дробимо довгі сегменти і створюємо фінальні точки
    const finalPoints = this.subdivideRoadPath(adaptedPoints, 0.5);

    // Створюємо сегменти з 4 точками кожен
    const result = [];
    for (let i = 1; i < finalPoints.length; i++) {
      const start = finalPoints[i - 1];
      const end = finalPoints[i];
      
      // Вектор напрямку сегменту
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      
      if (length === 0) continue; // пропускаємо нульові сегменти
      
      // Нормалізований вектор напрямку
      const dirX = dx / length;
      const dirZ = dz / length;
      
      // Вектор "вправо" (перпендикулярний до напрямку)
      const rightX = -dirZ;
      const rightZ = dirX;
      const halfWidth = width * 0.5;
      
      // Обчислюємо 4 точки сегменту
      const startLeftX = start.x + rightX * halfWidth;
      const startLeftZ = start.z + rightZ * halfWidth;
      const startRightX = start.x - rightX * halfWidth;
      const startRightZ = start.z - rightZ * halfWidth;
      
      const endLeftX = end.x + rightX * halfWidth;
      const endLeftZ = end.z + rightZ * halfWidth;
      const endRightX = end.x - rightX * halfWidth;
      const endRightZ = end.z - rightZ * halfWidth;
      
      // Отримуємо висоти з террейну для кожної точки
      const startLeftY = terrainManager.getHeightAt(startLeftX, startLeftZ) + 0.01;
      const startRightY = terrainManager.getHeightAt(startRightX, startRightZ) + 0.01;
      const endLeftY = terrainManager.getHeightAt(endLeftX, endLeftZ) + 0.01;
      const endRightY = terrainManager.getHeightAt(endRightX, endRightZ) + 0.01;

      result.push({
        startLeft: { x: startLeftX, y: startLeftY, z: startLeftZ },
        startRight: { x: startRightX, y: startRightY, z: startRightZ },
        endLeft: { x: endLeftX, y: endLeftY, z: endLeftZ },
        endRight: { x: endRightX, y: endRightY, z: endRightZ },
        width
      });
    }

    return result;
  }

  /**
   * Дробить шлях на короткі сегменти
   */
  private subdivideRoadPath(
    points: Array<{x: number, y: number, z: number}>, 
    maxLength: number
  ): Array<{x: number, y: number, z: number}> {
    const result = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      
      const distance = Math.hypot(end.x - start.x, end.z - start.z);
      
      if (distance <= maxLength) {
        result.push(end);
      } else {
        const numSegments = Math.ceil(distance / maxLength);
        
        for (let j = 1; j <= numSegments; j++) {
          const t = j / numSegments;
          const point = {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
            z: start.z + (end.z - start.z) * t
          };
          result.push(point);
        }
      }
    }
    
    return result;
  }

  /**
   * Згладжує висоти точок для плавності
   */
  private smoothPointHeights(
    points: Array<{x: number, y: number, z: number}>, 
    terrainManager: any
  ): void {
    if (points.length < 3) return;
    
    // Проходимо кілька ітерацій згладжування
    for (let iteration = 0; iteration < 2; iteration++) {
      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const current = points[i];
        const next = points[i + 1];
        
        // Отримуємо висоту террейну в цій точці
        const terrainHeight = terrainManager.getHeightAt(current.x, current.z);
        const minHeight = terrainHeight + 0.01;
        
        // Згладжуємо висоту з сусідніми точками, але не нижче террейну
        const smoothedY = (prev.y + current.y + next.y) / 3;
        current.y = Math.max(smoothedY, minHeight);
      }
    }
  }


  /**
   * Адаптує точку до висоти террейну
   */
  private adaptPointToTerrain(
    point: {x: number, y: number, z: number}, 
    terrainManager: any
  ): {x: number, y: number, z: number} {
    const terrainHeight = terrainManager.getHeightAt(point.x, point.z);
    return {
      x: point.x,
      y: terrainHeight !== undefined ? terrainHeight + 0.01 : point.y, // трохи піднімаємо над террейном
      z: point.z
    };
  }

  /**
   * Створює базові сегменти без адаптації до террейну (fallback)
   */
  private createBasicRoadSegments(
    path: Array<{x: number, y: number, z: number}>, 
    width: number
  ): Array<{startLeft: {x: number, y: number, z: number}, startRight: {x: number, y: number, z: number}, endLeft: {x: number, y: number, z: number}, endRight: {x: number, y: number, z: number}, width: number}> {
    const result = [];
    const halfWidth = width * 0.5;
    
    for (let i = 1; i < path.length; i++) {
      const start = path[i - 1];
      const end = path[i];
      
      // Вектор напрямку
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      
      if (length === 0) continue;
      
      // Нормалізований вектор напрямку
      const dirX = dx / length;
      const dirZ = dz / length;
      
      // Вектор "вправо"
      const rightX = -dirZ;
      const rightZ = dirX;
      
      // 4 точки сегменту на одній висоті
      result.push({
        startLeft: { x: start.x + rightX * halfWidth, y: start.y, z: start.z + rightZ * halfWidth },
        startRight: { x: start.x - rightX * halfWidth, y: start.y, z: start.z - rightZ * halfWidth },
        endLeft: { x: end.x + rightX * halfWidth, y: end.y, z: end.z + rightZ * halfWidth },
        endRight: { x: end.x - rightX * halfWidth, y: end.y, z: end.z - rightZ * halfWidth },
        width
      });
    }
    return result;
  }

  private removeRoadFromPathfinding(road: RoadInstance): void {
    const pathfinder = this.sceneLogic.pathfinder;
    
    // Видаляємо кожен сегмент дороги з pathfinding
    for (let i = 1; i < road.path.length; i++) {
      const segmentId = `${road.id}_segment_${i}`;
      pathfinder.removeRoadSegment(segmentId);
    }

    // Видаляємо дорогу з 3D сцени
    this.removeRoadFromScene(road);
  }

  private removeRoadFromScene(road: RoadInstance): void {
    // Видаляємо об'єкт з сцени
    const success = this.sceneLogic.removeObject(road.id);
    if (success) {
      console.log(`[BuildingsManager] Removed road ${road.id} from 3D scene`);
    } else {
      console.warn(`[BuildingsManager] Failed to remove road ${road.id} from scene`);
    }
  }
}
