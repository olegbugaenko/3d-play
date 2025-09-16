## Systems: MapLogic
**Файл(и):** `src/logic/systems/map/map-logic.ts`
**Призначення:** Головна логіка карти, генерація ресурсів та управління ігровим світом.

### Публічні типи/інтерфейси
```ts
export class MapLogic implements SaveLoadManager {
  // Core systems
  public commandSystem!: CommandSystem;
  public selection: SelectionLogic;
  public commandGroupSystem!: CommandGroupSystem;
  public autoGroupMonitor: AutoGroupMonitor;
  
  // Dependencies
  public resources!: ResourceManager;
  public upgradesManager!: UpgradesManager;
  public buildingsManager!: BuildingsManager;
  public droneManager!: DroneManager;
  
  // Scene systems
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

export interface MapConfig {
  width: number;
  height: number;
  depth: number;
  generation: {
    defaultSeed: number;
    rocks: {
      clusterCount: number;
      rocksPerCluster: number;
      clusterRadius: { min: number; max: number };
      resourceTypes: readonly ('stone' | 'ore')[];
    };
    boulders: {
      count: number;
      minDistance: number;
      sizeRange: { min: number; max: number };
    };
    biomass: {
      clusterCount: number;
      biomassPerCluster: number;
      clusterRadius: { min: number; max: number };
      resourceTypes: readonly ('biomass')[];
    };
    resources: {
      minDistanceBetweenResources: number;
    };
  };
  terrain: {
    resolution: number;
    maxHeight: number;
    minHeight: number;
    renderResolution: number;
    textures: {
      [key: string]: {
        weight: number;
        texturePath: string;
        tiling?: { x: number; y: number };
      };
    };
    noise: {
      scale: number;
      octaves: number;
      persistence: number;
      lacunarity: number;
    };
  };
  objects: {
    gridSize: number;
    spacing: number;
    offset: number;
    defaults: {
      cube: { anchorPoint: 'bottom'; scale: Vector3 };
      sphere: { anchorPoint: 'center'; scale: Vector3 };
    };
  };
}
```

---

## Systems: TerrainManager
**Файл(и):** `src/logic/systems/scene/terrain-manager.ts`
**Призначення:** Управління террейном з детермінованою генерацією та кешуванням.

### Публічні типи/інтерфейси
```ts
export interface TerrainConfig {
  width: number;
  height: number;
  resolution: number;
  maxHeight: number;
  minHeight: number;
  seed?: number;
  noise?: {
    scale: number;
    octaves: number;
    persistence: number;
    lacunarity: number;
  };
  textures?: {
    [key: string]: {
      weight: number;
      texturePath: string;
      tiling?: { x: number; y: number };
    };
  };
}

export class TerrainManager {
  private config: TerrainConfig;
  private seededRandom: SeededRandom;
  private hashCache = new Map<string, number>();
  private seedProfile!: SeedProfile;
  
  constructor(config: TerrainConfig);
  
  // Public methods
  public getHeightAt(x: number, z: number): number;
  public getNormalAt(x: number, z: number): Vector3 | null;
  public generateTerrainData(): Float32Array;
  public getTextureWeightsAt(x: number, z: number): Record<string, number>;
}

type SeedProfile = {
  offX: number;
  offZ: number;
  rot: number;
  warpAmp: number;
  warpFreq: number;
  octaveFreqJitter: number[];
  octaveAmpJitter: number[];
};
```

---

## Systems: PathfindingSystem
**Файл(и):** `src/logic/systems/scene/path-finding/pathfinding-system.ts`
**Призначення:** Система пошуку шляхів з A* алгоритмом та управлінням зайнятістю.

### Публічні типи/інтерфейси
```ts
export class PathfindingSystem {
  constructor(public grid: OccupancyGridStore);
  
  // Public API
  public canStandAtWorld(x: number, z: number, obj: TSceneObject, safety?: number): boolean;
  public findDockingPointToStatic(
    drone: TSceneObject,
    target: TSceneObject,
    safety?: number,
    fullCircle?: boolean
  ): Vector3 | null;
  public findPath(
    start: Vector3,
    goal: Vector3,
    obj: TSceneObject,
    maxIterations?: number
  ): Vector3[] | null;
  public findNearestPassablePoint(
    x: number,
    z: number,
    obj: TSceneObject,
    maxRadius?: number
  ): Vector3 | null;
}

export class OccupancyGridStore {
  public readonly s: number; // cell size
  public readonly w: number; // width in cells
  public readonly h: number; // height in cells
  
  constructor(cellSize: number, width: number, height: number);
  
  // Public methods
  public worldToCell(x: number, z: number): { i: number; j: number };
  public cellToWorld(i: number, j: number): { x: number; z: number };
  public inb(i: number, j: number): boolean;
  public passable(i: number, j: number, radius: number, safety?: number): boolean;
  public setObstacle(i: number, j: number, radius: number): void;
  public clearObstacle(i: number, j: number, radius: number): void;
  public canStandAt(i: number, j: number, radius: number, safety?: number): boolean;
}
```

---

## Systems: SelectionLogic
**Файл(и):** `src/logic/systems/scene/selection/SelectionLogic.ts`
**Призначення:** Логіка вибору об'єктів та пошуку взаємодій.

### Публічні типи/інтерфейси
```ts
export class SelectionLogic {
  private selectedObjects: Set<string> = new Set();
  
  constructor(private scene: SceneLogic);
  
  // Selection management
  public selectObject(objectId: string): void;
  public deselectObject(objectId: string): void;
  public deselectAll(): void;
  public isSelected(objectId: string): boolean;
  public getSelectedObjects(): string[];
  public getSelectedCount(): number;
  
  // Interaction finding
  public findInteractableObjects(): TSceneObject[];
  private listAvailableCommands(): Set<string>;
}
```

---

## Systems: SaveManager
**Файл(и):** `src/logic/systems/save-load/save-manager.ts`
**Призначення:** Централізований менеджер збереження/завантаження стану гри.

### Публічні типи/інтерфейси
```ts
export class SaveManager implements SaveLoadManager, ISaveManager {
  public managers: Map<string, SaveLoadManager> = new Map();
  public readonly SAVE_KEY_PREFIX = 'game_save_';
  public readonly VERSION = '1.0.0';
  private currentSlot: number | null = null;
  
  constructor(public mapLogic: IMapLogic);
  
  // Manager registration
  public registerManager(name: string, manager: SaveLoadManager): void;
  
  // Slot management
  public setCurrentSlot(slot: number): void;
  public getCurrentSlot(): number | null;
  public saveToCurrentSlot(): boolean;
  
  // Save/Load operations
  public saveGame(slot: number): boolean;
  public loadGame(slot: number): boolean;
  public newGame(slot?: number): void;
  
  // Slot operations
  public getSaveSlots(): Array<{ slot: number; timestamp: number; hasData: boolean }>;
  public deleteSlot(slot: number): boolean;
  public getLoadOrder(): string[];
}

export interface GameSave {
  slot: number;
  timestamp: number;
  version: string;
  resourceManager: ResourceSaveData;
  mapLogic: MapLogicSaveData;
  commandSystem: CommandSystemSaveData;
  commandGroupSystem: any;
  droneManager: DroneSaveData;
  upgradesManager: UpgradesManagerSaveData;
  buildingsManager: BuildingsManagerSaveData;
}
```
