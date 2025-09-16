## Systems: MapLogic
**Файл(и):** `src/logic/systems/map/map-logic.ts`
**Призначення:** Головна логіка карти, генерація ресурсів та управління ігровим світом.

### Публічні типи/інтерфейси
```ts
export class MapLogic implements SaveLoadManager {
  public commandSystem!: CommandSystem;
  public selection: SelectionLogic;
  public commandGroupSystem!: CommandGroupSystem;
  public autoGroupMonitor: AutoGroupMonitor;
  
  // Dependencies
  public resources!: ResourceManager;
  public upgradesManager!: UpgradesManager;
  public buildingsManager!: BuildingsManager;
  public droneManager!: DroneManager;
  
  // Core systems
  public scene: SceneLogic;
  public dynamics: DynamicsLogic;
  
  // State management
  private collectedRocks: Set<string>;
  private collectedBiomass: Set<string>;
  private generatedSeed!: number;
  private generationTracker!: MapGenerationTracker;
  
  // Cluster management
  private clusterIndex: SpatialHash2D | null = null;
  
  // Cloud generation
  private cloudGenerationTimer: number = 0;
  private cloudGenerationInterval: number = 60000;
  private activeClouds: Map<string, { createdAt: number; ttl: number }> = new Map();
}
```

---

## Systems: BonusSystem
**Файл(и):** `src/logic/systems/modifiers-system/BonusSystem.ts`
**Призначення:** Система бонусів та модифікаторів з графом залежностей та кешуванням.

### Публічні типи/інтерфейси
```ts
export class BonusSystem implements IBonusSystem {
  private registry: BonusRegistry;
  private graph: DependencyGraph;
  private formulaEngine: FormulaEngine;
  
  // Caching system
  private formulaResultsCache: Map<string, number> = new Map();
  private effectsCache: Map<string, number> = new Map();
  private resourcesCache: Map<string, ResourceCache> = new Map();
  
  // Source states
  private sourceStates: Map<string, BonusSourceState> = new Map();
  
  // Cache statistics
  private cacheStats: CacheStats;
}

export interface BonusSourceState {
  id: string;
  level: number;
  efficiency: number;
}

export interface ResourceCache {
  income: number;
  multiplier: number;
  consumption: number;
  cap: number;
  capMultiplier: number;
}

export interface CacheStats {
  formulaHits: number;
  formulaMisses: number;
  effectsHits: number;
  effectsMisses: number;
  resourcesHits: number;
  resourcesMisses: number;
}
```

---

## Systems: RequirementsSystem
**Файл(и):** `src/logic/systems/requirements/RequirementsSystem.ts`
**Призначення:** Система перевірки вимог для різних компонентів гри.

### Публічні типи/інтерфейси
```ts
export class RequirementsSystem implements IRequirementsSystem {
  private container: GameContainer;
  
  constructor(container: GameContainer);
  
  public checkRequirements(requirements: Requirement[]): RequirementsCheckResult;
  private checkSingleRequirement(requirement: Requirement): RequirementCheckDetail;
  private checkUpgradeRequirement(requirement: Requirement): RequirementCheckDetail;
  private checkBuildingTypeRequirement(requirement: Requirement): RequirementCheckDetail;
  private checkBuildingInstanceRequirement(requirement: Requirement): RequirementCheckDetail;
  private checkResourceRequirement(requirement: Requirement): RequirementCheckDetail;
  private checkCommandGroupRequirement(requirement: Requirement): RequirementCheckDetail;
}

export interface Requirement {
  id: string;
  scope: 'upgrade' | 'building-type' | 'building-instance' | 'resource' | 'command-group';
  level: number;
  description?: string;
}

export interface RequirementsCheckResult {
  satisfied: boolean;
  details: RequirementCheckDetail[];
}

export interface RequirementCheckDetail {
  requirement: Requirement;
  satisfied: boolean;
  currentLevel: number;
  requiredLevel: number;
  message: string;
}
```

---

## Systems: SceneLogic
**Файл(и):** `src/logic/systems/scene/scene-logic.ts`
**Призначення:** Головна логіка 3D сцени, управління об'єктами та оптимізація рендерингу.

### Публічні типи/інтерфейси
```ts
export class SceneLogic implements ISceneLogic {
  private objects: Record<string, TSceneObject<any>> = {};
  private viewPort!: TSceneViewport;
  private mapBounds: Vector3 = { x: 2000, y: 2000, z: 400 };
  
  // Grid system for fast object lookup
  private gridSystem: GridSystem;
  
  // Tag cache for fast access
  private tagCache: Map<string, Set<string>> = new Map();
  
  // Dirty flags system for optimization
  private dirtyObjects: Set<string> = new Set();
  
  // Terrain management
  private terrainManager: TerrainManager;
  
  // Pathfinding system
  public pathfinder: PathfindingSystem;
  
  // Public methods
  public markObjectDirty(id: string): void;
  public syncRotation(obj: TSceneObject): void;
  public getDirtyObjects(): TSceneObject<any>[];
  public pushObjectWithTerrainConstraint(obj: TSceneObject): boolean;
  public getObjectById(id: string): TSceneObject | undefined;
  public getObjectsByTag(tag: string): TSceneObject[];
  public removeObject(id: string): boolean;
  public updateObjectPosition(id: string, position: Vector3): boolean;
  public updateObjectData(id: string, data: any): boolean;
}

export interface TSceneObject<T = any> {
  id: string;
  type: string;
  coordinates: Vector3;
  scale: Vector3;
  rotation: Vector3;
  rotation2D?: number;
  obstacleSize: number;
  data: T;
  tags: string[];
  bottomAnchor: number;
  terrainAlign: boolean;
  targetType?: string[];
  commandType?: string[];
  
  // Dirty flags for optimization
  _dirtyFlags?: {
    position?: boolean;
    scale?: boolean;
    rotation?: boolean;
    data?: boolean;
    tags?: boolean;
    visibility?: boolean;
  };
  _lastUpdate?: number;
}

export interface TSceneViewport {
  width: number;
  height: number;
  camera: TCameraProps;
}

export interface GridSystem {
  cellSize: number;
  grid: Map<string, GridCell>;
}

export interface GridCell {
  objects: Set<string>;
}
```

---

## Systems: SaveLoadManager
**Файл(и):** `src/logic/systems/save-load/save-load.types.ts`
**Призначення:** Типи для системи збереження/завантаження стану гри.

### Публічні типи/інтерфейси
```ts
export interface SaveLoadManager {
  save(): any;
  load(data: any): void;
  reset(): void;
  beforeInit?(): void;
}

export interface GameSaveData {
  version: string;
  timestamp: number;
  gameState: {
    resources: ResourceSaveData;
    buildings: BuildingsManagerSaveData;
    drones: DroneSaveData;
    upgrades: UpgradesManagerSaveData;
    commands: CommandSystemSaveData;
    commandGroups: any;
    map: MapLogicSaveData;
  };
}

export interface CommandSystemSaveData {
  commandQueues: Array<{
    objectId: string;
    commands: Array<{
      id: string;
      type: string;
      status: string;
      parameters: Record<string, any>;
      progress: number;
      groupId?: string;
      resolvedParamsMapping?: Record<string, string>;
      groupRestartCodes?: string[];
    }>;
  }>;
  activeCommands: Array<{
    id: string;
    groupId: string;
    executorId: string;
    status: string;
    progress: number;
  }>;
}

export interface MapLogicSaveData {
  generatedSeed: number;
  collectedRocks: string[];
  collectedBiomass: string[];
  generationState: any;
  activeClouds: Array<{
    id: string;
    createdAt: number;
    ttl: number;
  }>;
}
```
