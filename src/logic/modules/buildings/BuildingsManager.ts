import { SaveLoadManager } from '@save-load/save-load.types';
import {
  BUILDING_TYPE_IDS,
  BuildingTypeData,
  BuildingInstance,
  BuildingTypeId,
  BuildingsManagerSaveData,
  ROAD_TYPE_IDS,
  RoadSegmentInstance,
  RoadTypeData,
  RoadInstance,
  RoadSnapData,
  RoadTypeId,
} from './buildings.types';
import { BUILDINGS_DB, ROADS_DB } from './buildings-db';
import { IBuildingsManager, IBonusSystem, ISceneLogic, IRequirementsSystem, IResourceManager } from '@interfaces/index';
import { ResourceRequest } from '@resources/resource-types';
import { BuildingStorageManager } from './BuildingStorageManager';
import { TSceneObject } from '@scene/scene.types';
import { BuildingSceneBinding, createBuildingSceneBinding } from './building-scene-binding';

/* ──────────────────────────────────────────────────────────────────────────────
   Spatial Grid Index for Road Edges (inline in this file per your request)
   ────────────────────────────────────────────────────────────────────────────── */

type Vec3 = { x: number; y: number; z: number };

type RoadEdgeHit = {
  roadId: string;
  segmentIndex: number;
  edgeIndex: 0 | 1 | 2 | 3; // 0=start,1=end,2=left,3=right
  edgeName: 'start' | 'end' | 'left' | 'right';
  center: Vec3;
};

class RoadEdgeIndex {
  private cellSize: number;
  private grid = new Map<string, RoadEdgeHit[]>();      // key -> hits
  private roadToKeys = new Map<string, Set<string>>();  // roadId -> keys set

  constructor(cellSize = 2.0) {
    this.cellSize = cellSize;
  }

  private key(ix: number, iz: number) { return `${ix}|${iz}`; }
  private ixz(p: Vec3) {
    return {
      ix: Math.floor(p.x / this.cellSize),
      iz: Math.floor(p.z / this.cellSize),
    };
  }

  private put(roadId: string, hit: RoadEdgeHit) {
    const { ix, iz } = this.ixz(hit.center);
    const k = this.key(ix, iz);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k)!.push(hit);

    if (!this.roadToKeys.has(roadId)) this.roadToKeys.set(roadId, new Set());
    this.roadToKeys.get(roadId)!.add(k);
  }

  /** Remove all cached edges for a road (safe to call before re-index) */
  public removeRoad(roadId: string) {
    const keys = this.roadToKeys.get(roadId);
    if (!keys) return;
    for (const k of keys) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const filtered = arr.filter(h => h.roadId !== roadId);
      if (filtered.length === 0) this.grid.delete(k);
      else this.grid.set(k, filtered);
    }
    this.roadToKeys.delete(roadId);
  }

  /** Index all edges for adapted segments of a road */
  public indexRoad(roadId: string, adaptedSegments: Array<{
    startLeft: Vec3; startRight: Vec3; endLeft: Vec3; endRight: Vec3; width: number;
  }>) {
    // clear previous entries for this road (re-index safe)
    this.removeRoad(roadId);

    for (let i = 0; i < adaptedSegments.length; i++) {
      const s = adaptedSegments[i];

      const edges: RoadEdgeHit[] = [
        {
          roadId, segmentIndex: i, edgeIndex: 0, edgeName: 'start',
          center: {
            x: (s.startLeft.x + s.startRight.x) * 0.5,
            y: (s.startLeft.y + s.startRight.y) * 0.5,
            z: (s.startLeft.z + s.startRight.z) * 0.5,
          },
        },
        {
          roadId, segmentIndex: i, edgeIndex: 1, edgeName: 'end',
          center: {
            x: (s.endLeft.x + s.endRight.x) * 0.5,
            y: (s.endLeft.y + s.endRight.y) * 0.5,
            z: (s.endLeft.z + s.endRight.z) * 0.5,
          },
        },
        {
          roadId, segmentIndex: i, edgeIndex: 2, edgeName: 'left',
          center: {
            x: (s.startLeft.x + s.endLeft.x) * 0.5,
            y: (s.startLeft.y + s.endLeft.y) * 0.5,
            z: (s.startLeft.z + s.endLeft.z) * 0.5,
          },
        },
        {
          roadId, segmentIndex: i, edgeIndex: 3, edgeName: 'right',
          center: {
            x: (s.startRight.x + s.endRight.x) * 0.5,
            y: (s.startRight.y + s.endRight.y) * 0.5,
            z: (s.startRight.z + s.endRight.z) * 0.5,
          },
        },
      ];

      for (const e of edges) this.put(roadId, e);
    }
  }

  /** Find nearest edge within maxR (returns null if nothing is inside) */
  public queryNearest(point: Vec3, maxR: number, excludeRoadId?: string, excludeEdges?: Set<string>): RoadEdgeHit | null {
    const { ix, iz } = this.ixz(point);
    const rCells = Math.ceil(maxR / this.cellSize);

    let best: RoadEdgeHit | null = null;
    let bestDist2 = maxR * maxR;

    for (let dz = -rCells; dz <= rCells; dz++) {
      for (let dx = -rCells; dx <= rCells; dx++) {
        const k = this.key(ix + dx, iz + dz);
        const arr = this.grid.get(k);
        if (!arr) continue;

        for (const hit of arr) {
          if (excludeRoadId && hit.roadId === excludeRoadId) continue;
          if (excludeEdges && excludeEdges.has(`${hit.roadId}|${hit.segmentIndex}|${hit.edgeIndex}`)) continue;
          const dxp = point.x - hit.center.x;
          const dzp = point.z - hit.center.z;
          const d2 = dxp * dxp + dzp * dzp;
          if (d2 < bestDist2) {
            bestDist2 = d2;
            best = hit;
          }
        }
      }
    }
    return best;
  }
}
/* ────────────────────────────────────────────────────────────────────────────── */

export class BuildingsManager implements SaveLoadManager, IBuildingsManager {
  private buildingsDB: Map<BuildingTypeId, BuildingTypeData> = new Map();
  private buildingInstances: Map<string, BuildingInstance> = new Map();
  private buildingBindings: Map<string, BuildingSceneBinding> = new Map();

  // Підтримка доріг
  private roadsDB: Map<RoadTypeId, RoadTypeData> = new Map();
  private roadInstances: Map<string, RoadInstance> = new Map();

  // NEW: spatial grid for fast nearest-edge queries
  private roadEdgeIndex = new RoadEdgeIndex(2.0); // cell size 2m (tune if needed)
  // Трекер зайнятих ребер (roadId|segmentIndex|edgeIndex) щоб не снапитись вдруге
  private busyEdges: Set<string> = new Set();
  
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

  /**
   * Aggregated construction info for a road
   */
  /**
   * Універсальний метод для обчислення вартості дороги або сегмента
   * @param roadId ID дороги
   * @param segmentIndex Індекс сегмента (якщо не передано - рахує всю дорогу)
   * @returns Потрібні ресурси
   */
  public calculateRoadCost(roadId: string, segmentIndex?: number): Record<string, number> {
    const road = this.roadInstances.get(roadId);
    if (!road) return {};

    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType || !roadType.cost) return {};

    const perMeter = roadType.cost(1);
    let length: number;

    if (segmentIndex !== undefined) {
      // Рахуємо для конкретного сегмента
      if (!road.segments || !road.segments[segmentIndex]) return {};
      
      const segment = road.segments[segmentIndex];
      // Якщо в сегменті вже є requiredResources - використовуємо їх
      if (segment.requiredResources && Object.keys(segment.requiredResources).length > 0) {
        return segment.requiredResources;
      }
      
      length = segment.length || 1;
    } else {
      // Рахуємо для всієї дороги
      length = this.calculatePathLength(road.path || []);
    }

    const requiredResources: Record<string, number> = {};
    for (const [res, perM] of Object.entries(perMeter)) {
      if (typeof perM === 'number' && perM > 0) {
        requiredResources[res] = Math.max(0, Math.ceil(perM * length));
      }
    }

    return requiredResources;
  }

  public getRoadAggregates(roadId: string): {
    builtSegments: number;
    totalSegments: number;
    totalRequired: Record<string, number>;
    totalDelivered: Record<string, number>;
  } | null {
    const road = this.roadInstances.get(roadId);
    if (!road) return null;

    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return null;

    const totalSegments = Math.max(0, (road.path?.length || 0) - 1);
    let builtSegments = Math.max(0, (road.segments || []).filter((s: any) => s?.buildingState === 'completed' || s?.built === true).length);
    if (road.built) {
      builtSegments = totalSegments;
    }

    // Використовуємо новий універсальний метод
    const totalRequired = this.calculateRoadCost(roadId);

    // Delivered can be optionally pre-aggregated on instance; fallback to zeroes
    const totalDelivered: Record<string, number> = {};
    const delivered = (road as any).resourcesDelivered as Record<string, number> | undefined;
    for (const res of Object.keys(totalRequired)) {
      const val = delivered?.[res] || 0;
      totalDelivered[res] = Math.max(0, Math.round(road.built ? totalRequired[res] : val));
    }

    return { builtSegments, totalSegments, totalRequired, totalDelivered };
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

  public registerBuildingType(id: BuildingTypeId, data: BuildingTypeData): void {
    this.buildingsDB.set(id, data);
  }

  // ---------- Query helpers ----------

  private ensureType(typeId: BuildingTypeId): BuildingTypeData {
    const t = this.buildingsDB.get(typeId);
    if (!t) throw new Error(`Building type ${typeId} not registered`);
    return t;
  }

  private ensureBuildingBinding(instance: BuildingInstance, type: BuildingTypeData): BuildingSceneBinding {
    const existing = this.buildingBindings.get(instance.id);
    if (existing) return existing;

    const binding = createBuildingSceneBinding(instance, type);
    this.buildingBindings.set(instance.id, binding);
    return binding;
  }

  private markBuildingDirty(instanceId: string): void {
    const obj = this.sceneLogic.getObjectById(instanceId);
    if (!obj) {
      return;
    }

    if (!obj._dirtyFlags) {
      obj._dirtyFlags = {
        position: false,
        rotation: false,
        scale: false,
        data: true,
        tags: false,
        visibility: false,
      };
    } else {
      obj._dirtyFlags.data = true;
    }

    obj._lastUpdate = Date.now();
    this.sceneLogic.markObjectDirty(instanceId);
  }

  private ensureInternalStorage(instance: BuildingInstance, buildingType: BuildingTypeData): void {
    const config = buildingType.data?.internalStorageConfig as
      | Record<string, { capacity: number; defaultCurrent?: number; acceptsInput?: boolean; providesOutput?: boolean }>
      | undefined;

    if (!config) {
      return;
    }

    if (!instance.internalStorage) {
      instance.internalStorage = {};
    }

    for (const [resourceId, storageConfig] of Object.entries(config)) {
      const prev = instance.internalStorage[resourceId];
      const capacity = storageConfig.capacity;
      const current = prev?.current ?? storageConfig.defaultCurrent ?? 0;

      instance.internalStorage[resourceId] = {
        capacity,
        current,
        acceptsInput: storageConfig.acceptsInput,
        providesOutput: storageConfig.providesOutput,
      };
    }

    if (instance.isFunctional === undefined) {
      instance.isFunctional = true;
    }
  }

  public getInstance(instanceId: string): BuildingInstance | undefined {
    return this.buildingInstances.get(instanceId);
  }

  private getBonusSourceId(typeId: BuildingTypeId): string {
    return `building_source_${typeId}`;
  }

  private setBonusLevel(typeId: BuildingTypeId, level: number): void {
    this.bonusSystem.updateBonusSourceLevel(this.getBonusSourceId(typeId), level);
  }

  /**
   * Перераховує та оновлює рівень бонусу для типу будівлі на основі сумарного рівня всіх побудованих інстансів
   */
  public updateBonusLevelForBuildingType(buildingTypeId: BuildingTypeId): void {
    const totalLevel = this.getTotalLevelForBuildingType(buildingTypeId);
    this.setBonusLevel(buildingTypeId, totalLevel);
  }

  private syncSceneFromInstance(instance: BuildingInstance): void {
    const type = this.buildingsDB.get(instance.typeId);
    if (!type) {
      console.warn(`[BuildingsManager] Scene sync skipped: unknown type ${instance.typeId}`);
      return;
    }

    this.ensureBuildingBinding(instance, type);
    this.markBuildingDirty(instance.id);
  }

  private upsertNewInstance(
    instanceId: string,
    typeId: BuildingTypeId,
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
    typeId: BuildingTypeId,
    level: number = 0,
    built: boolean = false,
    position?: { x: number; y: number; z: number }
  ): void {
    const buildingType = this.ensureType(typeId);
    const inst = this.upsertNewInstance(instanceId, typeId, level, built, position);
    this.ensureInternalStorage(inst, buildingType);

    if (built) {
      this.updateBonusLevelForBuildingType(typeId);
      this.syncSceneFromInstance(inst);
    }
  }

  public planBuilding(
    instanceId: string,
    typeId: BuildingTypeId,
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

    return true;
  }

  public buildOrUpgrade(
    instanceId: string,
    typeId: BuildingTypeId,
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
      this.ensureInternalStorage(inst, buildingType);
      this.updateBonusLevelForBuildingType(typeId);
      this.syncSceneFromInstance(inst);
      return true;
    }

    // Build an unbuilt planned instance
    if (!existing.built) {
      existing.built = true;
      existing.level = 1;
      if (position) existing.position = position;
      this.ensureInternalStorage(existing, buildingType);
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

  public getBuildingCost(typeId: BuildingTypeId, level: number): ResourceRequest | undefined {
    const buildingType = this.buildingsDB.get(typeId);
    return buildingType?.cost(level);
  }

  public getBuildingInstance(instanceId: string): BuildingInstance | undefined {
    return this.getInstance(instanceId);
  }

  public getBuildingType(typeId: BuildingTypeId): BuildingTypeData | undefined {
    return this.buildingsDB.get(typeId);
  }

  /**
   * Універсальний метод для отримання типу будь-якої конструкції (будівлі або дороги)
   */
  public getConstructionType(typeId: BuildingTypeId | RoadTypeId): BuildingTypeData | RoadTypeData | undefined {
    // Спочатку шукаємо в звичайних будівлях
    const buildingType = this.buildingsDB.get(typeId as BuildingTypeId);
    if (buildingType) return buildingType;

    // Якщо не знайшли, шукаємо в дорогах
    const roadType = this.roadsDB.get(typeId as RoadTypeId);
    if (roadType) return roadType;

    return undefined;
  }

  public getAllBuildingTypes(): Map<BuildingTypeId, BuildingTypeData> {
    return new Map(this.buildingsDB);
  }

  public getAllBuildingInstances(): Map<string, BuildingInstance> {
    return new Map(this.buildingInstances);
  }

  public isBuildingTypeRegistered(typeId: BuildingTypeId): boolean {
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
    typeId: BuildingTypeId,
    position: { x: number; y: number; z: number },
    level: number = 1,
    instanceId?: string
  ): void {
    const buildingData = this.buildingsDB.get(typeId);
    if (!buildingData) {
      console.warn(`[BuildingsManager] Unknown building type: ${typeId}`);
      return;
    }

    let instance = instanceId ? this.buildingInstances.get(instanceId) : undefined;
    let created = false;

    if (!instance) {
      const generatedId = instanceId ?? `${typeId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      instance = this.upsertNewInstance(generatedId, typeId, level, true, position);
      created = true;
    }

    if (!instance) {
      console.warn(`[BuildingsManager] Failed to resolve building instance for ${typeId}`);
      return;
    }

    instance.level = level;
    instance.position = position;
    this.ensureInternalStorage(instance, buildingData);

    const binding = this.ensureBuildingBinding(instance, buildingData);
    const rotationOffset = buildingData.ui?.rotationOffset || { x: 0, y: 0, z: 0 };

    const buildingObject: TSceneObject<BuildingSceneBinding> = {
      id: instance.id,
      type: 'building',
      coordinates: position,
      scale: buildingData.ui?.defaultScale || { x: 1, y: 1, z: 1 },
      rotation: rotationOffset,
      rotation2D: rotationOffset.y,
      obstacleSize: buildingData.data?.obstacleSize || 1,
      data: binding,
      tags: ['on-ground', 'static', 'building', ...(buildingData.tags || [])],
      bottomAnchor: buildingData.ui?.bottomAnchor || 0,
      terrainAlign: true,
      targetType: ['unload-resource', 'repair', 'upgrade', 'build'],
    };

    const success = this.sceneLogic.pushObjectWithTerrainConstraint(buildingObject);
    if (!success) {
      console.warn(`[BuildingsManager] Failed to add building ${typeId} to scene`);
      return;
    }

    if (created) {
      this.updateBonusLevelForBuildingType(typeId);
    }

    this.syncSceneFromInstance(instance);
  }

  public startConstruction(_typeId: BuildingTypeId, _position: { x: number; y: number; z: number }): void {
  }

  public newGameBuildings(): void {
    this.generateBuilding(BUILDING_TYPE_IDS.SPACESHIP, { x: 2, y: 30, z: 2 }, 1);
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
    this.generateBuilding(BUILDING_TYPE_IDS.CHARGING_STATION_SMALL, { x: -2, y: 30, z: -2 }, 1);
    this.generateBuilding(BUILDING_TYPE_IDS.MINIMAL_STORAGE, { x: -2, y: 30, z: 2 }, 1);
    
    // 🚀 TEST: Додаємо тестові біо-будівлі для швидкого тесту storage індикації
    
    // Біо-інкубатор (виробляє біомасу у внутрішній склад)
    const bioIncubatorPos = { x: 3 + Math.random() * 4, y: 30, z: -1 + Math.random() * 2 }; // x: 3-7, z: -1 to 1
    this.generateBuilding(BUILDING_TYPE_IDS.BIO_INCUBATOR, bioIncubatorPos, 1);
    
    // Біо-генератор (споживає біомасу з внутрішнього складу)
    const bioGeneratorPos = { x: -5 + Math.random() * 4, y: 30, z: -1 + Math.random() * 2 }; // x: -5 to -1, z: -1 to 1
    this.generateBuilding(BUILDING_TYPE_IDS.BIO_GENERATOR, bioGeneratorPos, 1);
    
    this.generateRoads(ROAD_TYPE_IDS.BASIC, [
      {x: -5, z: 5},
      {x: -5, z: -5}, 
      {x: 5, z: -5}
    ]);

    this.generateRoads(ROAD_TYPE_IDS.BASIC, [
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
    this.buildingBindings.clear();

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
        // Автоматично маркуємо всі сегменти як збудовані якщо дорога вже збудована (фікс для старих збережень)
        if (road.built && road.segments && road.segments.some((s: any) => s.buildingState !== 'completed')) {
          road.segments = road.segments.map((s: any) => ({
            ...s,
            buildingState: 'completed',
            constructionProgress: 1.0
          }));
        }

        // МІГРАЦІЯ: якщо це незбудована/запланована дорога та відсутні сегменти — відновлюємо сегменти як planned
        if (!road.built && (!road.segments || road.segments.length === 0) && Array.isArray(road.path) && road.path.length >= 2) {
          const roadType = this.roadsDB.get(road.typeId);
          const perMeter = roadType?.cost ? roadType.cost(1) : {};
          const segs: any[] = [];
          for (let i = 1; i < road.path.length; i++) {
            const start = road.path[i - 1] as any;
            const end = road.path[i] as any;
            const length = Math.hypot((end.x ?? 0) - (start.x ?? 0), (end.z ?? 0) - (start.z ?? 0));
            const required: Record<string, number> = {};
            Object.entries(perMeter || {}).forEach(([res, perM]) => {
              if (typeof perM === 'number' && perM > 0) required[res] = Math.ceil(perM * length);
            });
            segs.push({
              id: `${road.id}_segment_${i}`,
              startPoint: start,
              endPoint: end,
              buildingState: 'planned',
              constructionProgress: 0.0,
              requiredResources: required,
              deliveredResources: {},
              length
            });
          }
          (road as any).segments = segs;
          (road as any).plannedOnly = true;
          (road as any).resourcesDelivered = (road as any).resourcesDelivered || {};
        }

        this.roadInstances.set(road.id, { ...road });
        if (road.built) {
          this.addRoadToPathfinding(road);
        } else {
          // ВИПРАВЛЕНО: додаємо ВСІ дороги до сцени (включно з запланованими)
          this.addRoadToScene(road);
        }
        // Маркуємо внутрішні ребра як зайняті для всіх доріг
        this.markInternalRoadEdgesAsBusy(road.id);
      });
    }

    // Після завантаження всіх будівель - перераховуємо бонуси для кожного типу
    for (const typeId of new Set([...this.buildingInstances.values()].map(inst => inst.typeId))) {
      this.updateBonusLevelForBuildingType(typeId);
    }

    this.syncAllBuildingsIsBuiltStatus();

  }

  public reset(): void {
    const typesToUpdate = new Set<BuildingTypeId>();

    this.buildingInstances.forEach(inst => {
      inst.level = 0;
      inst.built = false;
      inst.position = undefined;
      inst.constructionProgress = 0;
      inst.resourcesCollected = {};
      typesToUpdate.add(inst.typeId);
      this.syncSceneFromInstance(inst);
    });

    // Очищаємо всі дороги
    this.clearAllRoads();

    // Оновлюємо бонуси для всіх типів що були змінені (всі будуть 0)
    for (const typeId of typesToUpdate) {
      this.updateBonusLevelForBuildingType(typeId);
    }
  }

  // ---------- Stats & availability ----------

  public getBuildingTypeCount(buildingTypeId: BuildingTypeId): number {
    let count = 0;
    for (const inst of this.buildingInstances.values()) {
      if (inst.typeId === buildingTypeId && inst.built) count++;
    }
    return count;
  }

  public canBuild(buildingTypeId: BuildingTypeId): boolean {
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

  public getTotalLevelForBuildingType(buildingTypeId: BuildingTypeId): number {
    let total = 0;
    for (const inst of this.buildingInstances.values()) {
      if (inst.typeId === buildingTypeId && inst.built && inst.isFunctional !== false) {
        total += inst.level;
      }
    }
    return total;
  }

  // ──────────────────────────────
  //        Методи для доріг
  // ──────────────────────────────

  public getRoadTypeCount(roadTypeId: RoadTypeId): number {
    let count = 0;
    for (const inst of this.roadInstances.values()) {
      if (inst.typeId === roadTypeId) {
        // Підраховуємо тільки завершені сегменти
        const completedSegments = inst.segments.filter(s => s.buildingState === 'completed').length;
        count += completedSegments;
      }
    }
    return count;
  }

  public canBuildRoad(roadTypeId: RoadTypeId): boolean {
    const roadData = this.roadsDB.get(roadTypeId);
    if (!roadData) return false;

    // Перевіряємо максимальну кількість (якщо є)
    if (roadData.maxQuantity !== undefined) {
      if (this.getRoadTypeCount(roadTypeId) >= roadData.maxQuantity) return false;
    }

    // Перевіряємо вимоги (якщо є)
    if (!roadData.requirements || roadData.requirements.length === 0) return true;

    return this.requirementsSystem.checkRequirements(roadData.requirements).satisfied;
  }

  /**
   * Знаходить найближче ребро сегменту дороги до заданої точки (O(коло клітинок), без повного перебору)
   */
  public findNearestRoadEdge(
    point: {x: number, y: number, z: number}, 
    excludeRoadId?: string,
    maxDistance: number = 5.0
  ): {
    roadId: string;
    segmentIndex: number;
    edgeIndex: number; // 0=start, 1=end, 2=left, 3=right
    distance: number;
    edgePoint: {x: number, y: number, z: number};
    edgeName: string; // 'start', 'end', 'left', 'right'
  } | null {
    const hit = this.roadEdgeIndex.queryNearest(point, maxDistance, excludeRoadId, this.busyEdges);
    if (!hit) return null;

    const dx = point.x - hit.center.x;
    const dz = point.z - hit.center.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    return {
      roadId: hit.roadId,
      segmentIndex: hit.segmentIndex,
      edgeIndex: hit.edgeIndex,
      distance: dist,
      edgePoint: hit.center,
      edgeName: hit.edgeName,
    };
  }

  /**
   * Отримує координати точок ребра існуючої дороги
   */
  public getRoadEdgePoints(snapData: RoadSnapData): {
    startLeft: {x: number, y: number, z: number},
    startRight: {x: number, y: number, z: number},
    endLeft: {x: number, y: number, z: number},
    endRight: {x: number, y: number, z: number}
  } | null {
    const road = this.roadInstances.get(snapData.roadId);
    if (!road) return null;
    
    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return null;
    
    // Отримуємо адаптовані сегменти (без snap даних - це існуюча дорога)
    const adaptedSegments = this.adaptRoadToTerrain(road.path, roadType.width, undefined, road.id);
    const segment = adaptedSegments[snapData.segmentIndex];
    if (!segment) return null;
    
    return {
      startLeft: segment.startLeft,
      startRight: segment.startRight,
      endLeft: segment.endLeft,
      endRight: segment.endRight
    };
  }

  /**
   * Створює заплановану дорогу (з недобудованими сегментами)
   */
  public createPlannedRoad(
    roadTypeId: RoadTypeId,
    path: Array<{x: number, y: number, z: number}>,
    snapData?: { startSnap?: RoadSnapData, endSnap?: RoadSnapData }
  ): string | null {
    const roadType = this.roadsDB.get(roadTypeId);
    if (!roadType) {
      console.warn(`[BuildingsManager] Road type ${roadTypeId} not found`);
      return null;
    }

    if (path.length < 2) {
      console.warn(`[BuildingsManager] Road path too short`);
      return null;
    }

    // Перевіряємо чи можна побудувати
    if (!this.canBuildRoadAt(path, roadTypeId)) {
      console.warn(`[BuildingsManager] Cannot build road at specified path`);
      return null;
    }

    // Генеруємо ID дороги
    const roadId = `road_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Створюємо RoadInstance з snap даними
    const roadInstance: RoadInstance = {
      id: roadId,
      typeId: roadTypeId,
      path: path.map(p => ({ x: p.x, y: p.y, z: p.z })),
      built: false,
      totalLength: this.calculatePathLength(path),
      segments: [],
      plannedOnly: true,
      snapData // Додаємо snap дані
    };

    // Ініціалізуємо сегменти як planned, щоб вони зберігалися/відновлювалися при сейві
    try {
      const roadType = this.roadsDB.get(roadTypeId);
      const perMeter = roadType?.cost ? roadType.cost(1) : {};
      const segs: any[] = [];
      for (let i = 1; i < path.length; i++) {
        const start = path[i - 1];
        const end = path[i];
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        const required: Record<string, number> = {};
        Object.entries(perMeter || {}).forEach(([res, perM]) => {
          if (typeof perM === 'number' && perM > 0) required[res] = Math.ceil(perM * length);
        });
        segs.push({
          id: `${roadId}_segment_${i}`,
          startPoint: start,
          endPoint: end,
          buildingState: 'planned',
          constructionProgress: 0.0,
          requiredResources: required,
          deliveredResources: {},
          length
        });
      }
      (roadInstance as any).segments = segs;
      (roadInstance as any).resourcesDelivered = {};
    } catch {}

    // Додаємо в Map
    this.roadInstances.set(roadId, roadInstance);

    // Додаємо в сцену (для візуалізації планованої дороги)
    this.addRoadToScene(roadInstance);

    // Маркуємо внутрішні ребра як зайняті
    this.markInternalRoadEdgesAsBusy(roadId);


    return roadId;
  }

  /**
   * Маркує внутрішні ребра дороги як зайняті (end i-1 = start i)
   * Це запобігає снапу до внутрішніх ребер між сегментами
   */
  private markInternalRoadEdgesAsBusy(roadId: string): void {
    const road = this.roadInstances.get(roadId);
    if (!road) return;

    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return;

    // Отримуємо адаптовані сегменти для підрахунку кількості
    const adaptedSegments = this.adaptRoadToTerrain(road.path, roadType.width, road.snapData, roadId);
    
    // Маркуємо внутрішні з'єднання як зайняті
    for (let i = 1; i < adaptedSegments.length; i++) {
      const prevSegmentKey = `${roadId}|${i-1}|1`; // end edge попереднього сегменту
      const currSegmentKey = `${roadId}|${i}|0`;   // start edge поточного сегменту
      this.busyEdges.add(prevSegmentKey);
      this.busyEdges.add(currSegmentKey);
    }
  }

  /**
   * Обчислює довжину шляху
   */
  private calculatePathLength(path: Array<{x: number, y: number, z: number}>): number {
    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const dx = curr.x - prev.x;
      const dz = curr.z - prev.z;
      totalLength += Math.sqrt(dx * dx + dz * dz);
    }
    return totalLength;
  }

  /**
   * Перевіряє чи можна побудувати дорогу по заданому шляху
   */
  public canBuildRoadAt(path: Array<{x: number, y: number, z: number}>, roadTypeId: RoadTypeId): boolean {
    const roadType = this.roadsDB.get(roadTypeId);
    if (!roadType) {
      console.warn(`[BuildingsManager] Road type ${roadTypeId} not found`);
      return false;
    }

    if (path.length < 2) return false;

    const pathfindingSystem = this.sceneLogic.pathfinder;
    if (!pathfindingSystem) return false;

    // Перевіряємо кожен сегмент дороги на колізії
    for (let i = 1; i < path.length; i++) {
      const start = path[i - 1];
      const end = path[i];
      
      // Використовуємо готову pathfinding систему!
      const roadRadius = roadType.width / 2; // радіус дороги
      const canPlace = pathfindingSystem.hasLineOfSightWorld(
        start.x, start.z,
        end.x, end.z,
        roadRadius,
        0.05, // safety margin
        undefined, // excludeId
        true // snapToPassable
      );

      if (!canPlace) {
        return false;
      }
    }

    return true;
  }

  /**
   * Перевіряє чи можна розмістити будівлю в заданій позиції
   */
  public canPlaceBuildingAt(
    position: { x: number; y: number; z: number },
    buildingTypeId: BuildingTypeId
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

  public getMaxLevelForBuildingType(buildingTypeId: BuildingTypeId): number {
    let max = 0;
    for (const inst of this.buildingInstances.values()) {
      if (inst.typeId === buildingTypeId && inst.built) max = Math.max(max, inst.level);
    }
    return max;
  }

  public listBuildingsForUI(): Array<{
    typeId: BuildingTypeId;
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
      if(!buildingType.isConstuctuble) {
        continue;
      }
      const currentCount = this.getBuildingTypeCount(typeId);
      const canBuild = this.canBuild(typeId);

      if(!canBuild) {
        // Don't spoil locked buildings
        continue;
      }

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

    // Додаємо дороги до списку
    for (const [typeId, roadType] of this.roadsDB) {
      if (!roadType.isConstuctuble) {
        continue;
      }
      
      const currentCount = this.getRoadTypeCount(typeId);
      const canBuild = this.canBuildRoad(typeId);

      if (!canBuild) {
        // Don't spoil locked roads
        continue;
      }

      const roadCost = roadType.cost(1); // Вартість за метр дороги
      const nextReq = this.convertBuildingCostToResourceRequest(roadCost);
      const costCheck = this.resourceManager.checkResources(nextReq);

      // Дороги поки що не мають бонусів, але залишаємо порожній масив для сумісності
      const bonusDetails: any[] = [];

      out.push({
        typeId,
        name: roadType.name,
        description: roadType.description,
        currentCount,
        maxQuantity: roadType.maxQuantity,
        canBuild,
        costCheck,
        bonusDetails,
        isSegmented: roadType.isSegmented, // Додаємо флаг сегментованої будівлі
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
  }

  public syncAllBuildingsIsBuiltStatus(): void {
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

    this.syncSceneFromInstance(inst);
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
            ? (consumptionFormula as any)(building.level)
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
      }
      
      // Синхронізуємо з сценою
      this.syncSceneFromInstance(building);
      
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
  public getBuildingsDB(): Map<BuildingTypeId, BuildingTypeData> {
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


  public generateRoads(type: RoadTypeId, path: Array<{x: number, z: number}>): string | null {
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

    // Створюємо унікальний ID для дороги
    const roadId = `road_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Догенеруємо сегментні стани та delivered = required (використовуємо вже отриманий roadType вище)
    const perMeter = roadType.cost(1);
    const segs: RoadSegmentInstance[] = [];
    for (let i = 1; i < path3D.length; i++) {
      const start = path3D[i - 1];
      const end = path3D[i];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const required: Record<string, number> = {};
      const delivered: Record<string, number> = {};
      for (const [res, perM] of Object.entries(perMeter)) {
        const amt = Math.round(perM * length);
        required[res] = amt;
        delivered[res] = amt; // повністю забезпечено
      }
      segs.push({
        id: `${roadId}_segment_${i}`,
        startPoint: start,
        endPoint: end,
        buildingState: 'completed',
        constructionProgress: 1.0,
        requiredResources: required,
        deliveredResources: delivered,
        length
      });
    }

    // Створюємо інстанс дороги одразу як побудований
    const roadInstance: RoadInstance = {
      id: roadId,
      typeId: type,
      path: path3D,
      built: true,
      totalLength,
      constructionProgress: 1.0,
      segments: segs
    };
    (roadInstance as any).resourcesDelivered = Object.entries(perMeter).reduce((acc, [res, perM]) => {
      acc[res] = Math.round(perM * totalLength);
      return acc;
    }, {} as Record<string, number>);

    this.roadInstances.set(roadId, roadInstance);

    // Додаємо сегменти дороги в PathfindingSystem + у сцену (і у Spatial Grid)
    this.addRoadToPathfinding(roadInstance);

    // Маркуємо внутрішні ребра як зайняті
    this.markInternalRoadEdgesAsBusy(roadId);

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

    // Clear spatial index completely
    // (немає явного API на повне очищення — пройдемось по roadIds)
    // Тут простіше створити новий індекс:
    this.roadEdgeIndex = new RoadEdgeIndex(2.0);

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
  //    Публічні методи для доріг
  // ──────────────────────────────

  /**
   * Завершує побудову конкретного сегменту дороги
   */
  public finishSegment(roadId: string, segmentIndex: number): void {
    const road = this.roadInstances.get(roadId);
    if (!road || !road.segments || segmentIndex >= road.segments.length) {
      console.warn(`[BuildingsManager] Cannot finish segment: road ${roadId} or segment ${segmentIndex} not found`);
      return;
    }

    const segment = road.segments[segmentIndex];
    if (segment.buildingState === 'completed') {
      return; // Вже завершено
    }


    // Позначаємо сегмент як завершений
    segment.buildingState = 'completed';
    segment.constructionProgress = 1.0;

    // Додаємо цей сегмент до патфайндингу
    this.addSegmentToPathfinding(road, segmentIndex);

    // Перевіряємо чи всі сегменти завершені
    const allCompleted = !road.segments.some(s => s.buildingState !== 'completed');
    if (allCompleted && !road.built) {
      road.built = true;
    }

    // Оновлюємо об'єкт на сцені для перерендерингу (один раз в кінці)
    const sceneObject = this.sceneLogic.getObjectById(roadId);
    if (sceneObject) {
      sceneObject.data.segmentStates = road.segments;
      sceneObject.data.built = road.built;
      sceneObject.targetType = road.built ? [] : ['build'];
      this.sceneLogic.markObjectDirty(roadId);
    }
  }

  // ──────────────────────────────
  //    Приватні методи для доріг
  // ──────────────────────────────

  /**
   * Додає конкретний сегмент дороги до патфайндингу
   */
  private addSegmentToPathfinding(road: RoadInstance, segmentIndex: number): void {
    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return;

    const pathfinder = this.sceneLogic.pathfinder;
    
    if (segmentIndex >= 0 && segmentIndex < road.path.length - 1) {
      const start = road.path[segmentIndex];
      const end = road.path[segmentIndex + 1];
      
      const segmentId = `${road.id}_segment_${segmentIndex + 1}`;
      pathfinder.addRoadSegment(
        segmentId,
        start.x, start.z,
        end.x, end.z,
        roadType.width,
        roadType.speedBonus
      );
      
    }
  }

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

    // Додаємо дорогу як 3D об'єкт в сцену (всередині — індексація ребер)
    this.addRoadToScene(road);
  }

  private addRoadToScene(road: RoadInstance): void {
    const roadType = this.roadsDB.get(road.typeId);
    if (!roadType) return;

    // Адаптуємо дорогу до террейну і дробимо на короткі сегменти
    const adaptedSegments = this.adaptRoadToTerrain(road.path, roadType.width, road.snapData, road.id);

    // Автоматично маркуємо всі сегменти як збудовані якщо дорога вже збудована
    let segmentStates = road.segments || [];
    if (road.built && segmentStates.some((s: any) => s.buildingState !== 'completed')) {
      segmentStates = segmentStates.map((s: any) => ({
        ...s,
        buildingState: 'completed',
        constructionProgress: 1.0
      }));
      road.segments = segmentStates; // Оновлюємо в самому road instance
    }

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
        speedBonus: roadType.speedBonus,
        built: road.built, // ВАЖЛИВО: передаємо флаг збудованості
        plannedOnly: (road as any).plannedOnly || false,
        segmentStates: segmentStates // інформація про стан кожного сегменту
      },
      tags: ['road', 'infrastructure'],
      bottomAnchor: 0,
      terrainAlign: false,
      // ВАЖЛИВО: для незавершених доріг додаємо targetType: ['build']
      targetType: (!road.built && (((road as any).plannedOnly === true) || (road.segments || []).some((s: any) => s.buildingState !== 'completed'))) ? ['build'] : []
    };

    // Додаємо в сцену
    const success = this.sceneLogic.pushObjectWithTerrainConstraint(roadObject);
    if (!success) {
      console.warn(`[BuildingsManager] Failed to add road ${road.id} to scene`);
    } else {
      // NEW: index edges for nearest-edge queries
      this.roadEdgeIndex.indexRoad(road.id, adaptedSegments);
    }
  }

  private adaptRoadToTerrain(
    path: Array<{x: number, y: number, z: number}>,
    width: number,
    snapData?: { startSnap?: RoadSnapData, endSnap?: RoadSnapData },
    roadId?: string
  ): Array<{
    startLeft:  {x: number, y: number, z: number},
    startRight: {x: number, y: number, z: number},
    endLeft:    {x: number, y: number, z: number},
    endRight:   {x: number, y: number, z: number},
    width:      number
  }> {
    if (path.length < 2) return [];
  
    const terrainManager = this.sceneLogic.getTerrainManager();
    if (!terrainManager) {
      console.warn("[BuildingsManager] No terrain manager available for road adaptation");
      return this.createBasicRoadSegments(path, width);
    }
  
    const EPS = 1e-6;
    const halfW = width * 0.5;
  
    // 2D (XZ) helpers
    const len = (x:number, z:number) => Math.hypot(x, z);
    const norm = (x:number, z:number): [number, number] => {
      const L = len(x, z);
      return L > EPS ? [x/L, z/L] : [1, 0];
    };
    const leftN  = (tx:number, tz:number): [number, number] => [ tz, -tx];
    const rightN = (tx:number, tz:number): [number, number] => [-tz,  tx];
    const cross  = (ax:number, az:number, bx:number, bz:number) => ax*bz - az*bx;
  
    // Перетин прямих: p1 + d1*t і p2 + d2*s (у XZ). null якщо паралельні.
    function intersectXZ(
      p1:{x:number,z:number}, d1:{x:number,z:number},
      p2:{x:number,z:number}, d2:{x:number,z:number}
    ): {x:number,z:number} | null {
      const den = cross(d1.x, d1.z, d2.x, d2.z);
      if (Math.abs(den) < 1e-8) return null;
      const v12x = p2.x - p1.x, v12z = p2.z - p1.z;
      const t = cross(v12x, v12z, d2.x, d2.z) / den;
      return { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
    }
  
    // 1) Прилягаємо центр-лінію до террейну
    const adapted = path.map(p => this.adaptPointToTerrain(p, terrainManager));
  
    // 2) Дробимо полілайн
    const P = this.subdivideRoadPath(adapted, 1.0); // 1м крок
    const n = P.length;
    if (n < 2) return [];
  
    // 3) Тангенси сегментів
    const T: Array<[number,number]> = new Array(n-1);
    for (let i=0;i<n-1;i++) {
      const dx = P[i+1].x - P[i].x;
      const dz = P[i+1].z - P[i].z;
      T[i] = norm(dx, dz);
    }
  
    // 4) Вершини лівого/правого країв через перетин offset-ліній
    const Lp: Array<{x:number,y:number,z:number}> = new Array(n);
    const Rp: Array<{x:number,y:number,z:number}> = new Array(n);
  
    for (let i=0;i<n;i++) {
      const hasIn  = i>0;
      const hasOut = i<n-1;
  
      // Фолбеки для кінців або вироджених випадків
      if (!hasIn && hasOut) {
        const [bx, bz] = T[i];
        const [lx, lz] = leftN(bx, bz);
        const [rx, rz] = rightN(bx, bz);
        const l = { x: P[i].x + lx*halfW, z: P[i].z + lz*halfW };
        const r = { x: P[i].x + rx*halfW, z: P[i].z + rz*halfW };
        Lp[i] = { x:l.x, y: terrainManager.getHeightAt(l.x,l.z) + 0.01, z:l.z };
        Rp[i] = { x:r.x, y: terrainManager.getHeightAt(r.x,r.z) + 0.01, z:r.z };
        continue;
      }
      if (hasIn && !hasOut) {
        const [ax, az] = T[i-1];
        const [lx, lz] = leftN(ax, az);
        const [rx, rz] = rightN(ax, az);
        const l = { x: P[i].x + lx*halfW, z: P[i].z + lz*halfW };
        const r = { x: P[i].x + rx*halfW, z: P[i].z + rz*halfW };
        Lp[i] = { x:l.x, y: terrainManager.getHeightAt(l.x,l.z) + 0.01, z:l.z };
        Rp[i] = { x:r.x, y: terrainManager.getHeightAt(r.x,r.z) + 0.01, z:r.z };
        continue;
      }
  
      // Є і вхідний, і вихідний сегмент
      const [ax, az] = T[i-1];     // вхідний
      const [bx, bz] = T[i];       // вихідний
  
      // Offset-лінії (ліва сторона): точки на відстані halfW вліво + напрями вздовж сегментів
      const [lax, laz] = leftN(ax, az);
      const [lbx, lbz] = leftN(bx, bz);
      const L1 = { x: P[i].x + lax*halfW, z: P[i].z + laz*halfW }; // через цю точку + напрям a
      const L2 = { x: P[i].x + lbx*halfW, z: P[i].z + lbz*halfW }; // через цю точку + напрям b
  
      // Offset-лінії (права сторона)
      const [rax, raz] = rightN(ax, az);
      const [rbx, rbz] = rightN(bx, bz);
      const R1 = { x: P[i].x + rax*halfW, z: P[i].z + raz*halfW };
      const R2 = { x: P[i].x + rbx*halfW, z: P[i].z + rbz*halfW };
  
      // Перетини (якщо кути майже колінеарні — fallback)
      const Lint = intersectXZ(L1, {x:ax,z:az}, L2, {x:bx,z:bz})
                ?? { x:(L1.x+L2.x)*0.5, z:(L1.z+L2.z)*0.5 };
      const Rint = intersectXZ(R1, {x:ax,z:az}, R2, {x:bx,z:bz})
                ?? { x:(R1.x+R2.x)*0.5, z:(R1.z+R2.z)*0.5 };
  
      Lp[i] = { x: Lint.x, y: terrainManager.getHeightAt(Lint.x, Lint.z) + 0.01, z: Lint.z };
      Rp[i] = { x: Rint.x, y: terrainManager.getHeightAt(Rint.x, Rint.z) + 0.01, z: Rint.z };
    }
  
    // 5) Сегменти — ідеально зшиті (кінець = початок наступного)
  const out: Array<{
      startLeft:  {x: number, y: number, z: number},
      startRight: {x: number, y: number, z: number},
      endLeft:    {x: number, y: number, z: number},
      endRight:   {x: number, y: number, z: number},
      width:      number
    }> = [];
  
    for (let i=1;i<n;i++) {
      out.push({
        startLeft:  Lp[i-1],
        startRight: Rp[i-1],
        endLeft:    Lp[i],
        endRight:   Rp[i],
        width
      });
    }
    
    // Внутрішні з'єднання будуть маркуватися як зайняті після створення RoadInstance
  
    // 6) Обробляємо snap дані (якщо є)
    if (snapData) {
      // Snap до початку
      if (snapData.startSnap && out.length > 0) {
        const edgePoints = this.getRoadEdgePoints(snapData.startSnap);
        if (edgePoints) {
          let sL = edgePoints.startLeft;
          let sR = edgePoints.startRight;
          switch (snapData.startSnap.edgeName) {
            case 'right':
              // очікування: startLeft = endRight; startRight = startRight
              sL = edgePoints.endRight;
              sR = edgePoints.startRight;
              break;
            case 'left':
              // симетрично: startLeft = startLeft; startRight = endLeft
              sL = edgePoints.startLeft;
              sR = edgePoints.endLeft;
              break;
            case 'end':
              sL = edgePoints.endLeft;
              sR = edgePoints.endRight;
              break;
            case 'start':
            default:
              sL = edgePoints.startRight;
              sR = edgePoints.startLeft;
              break;
          }
          out[0].startLeft = sL;
          out[0].startRight = sR;
          // Маркуємо ребро як зайняте (до якого під'єднуємося)
          const startKey = `${snapData.startSnap.roadId}|${snapData.startSnap.segmentIndex}|${snapData.startSnap.edgeIndex}`;
          this.busyEdges.add(startKey);
          
          // Маркуємо ребро нової дороги як зайняте (яким під'єднуємося)
          if (roadId) {
            const newRoadStartKey = `${roadId}|0|0`; // start ребро першого сегменту нової дороги
            this.busyEdges.add(newRoadStartKey);
          }

        }
      }
      
      // Snap до кінця
      if (snapData.endSnap && out.length > 0) {
        const edgePoints = this.getRoadEdgePoints(snapData.endSnap);
        if (edgePoints) {
          let eL = edgePoints.endLeft;
          let eR = edgePoints.endRight;
          switch (snapData.endSnap.edgeName) {
            case 'right':
              // очікування: endLeft = startRight; endRight = endRight
              eL = edgePoints.startRight;
              eR = edgePoints.endRight;
              break;
            case 'left':
              // симетрично: endLeft = startLeft; endRight = endLeft
              eL = edgePoints.endLeft;
              eR = edgePoints.startLeft;
              break;
            case 'start':
              eL = edgePoints.startLeft;
              eR = edgePoints.startRight;
              break;
            case 'end':
            default:
              eL = edgePoints.endRight;
              eR = edgePoints.endLeft;
              break;
          }
          const lastIndex = out.length - 1;
          out[lastIndex].endLeft = eL;
          out[lastIndex].endRight = eR;
          // Маркуємо ребро як зайняте (до якого під'єднуємося)
          const endKey = `${snapData.endSnap.roadId}|${snapData.endSnap.segmentIndex}|${snapData.endSnap.edgeIndex}`;
          this.busyEdges.add(endKey);
          
          // Маркуємо ребро нової дороги як зайняте (яким під'єднуємося)
          if (roadId) {
            const lastSegmentIndex = out.length - 1;
            const newRoadEndKey = `${roadId}|${lastSegmentIndex}|1`; // end ребро останнього сегменту нової дороги
            this.busyEdges.add(newRoadEndKey);
          }

        }
      }
    }
  
    return out;
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

    // Видаляємо дорогу з 3D сцени (і з просторового індексу)
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

    // NEW: remove from spatial index too
    this.roadEdgeIndex.removeRoad(road.id);
  }
}
