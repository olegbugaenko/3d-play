## Modules: BuildingsManager
**Файл(и):** `src/logic/modules/buildings/BuildingsManager.ts`
**Призначення:** Управління будівлями, їх станом, будівництвом та інтеграцією з системою бонусів.

### Публічні типи/інтерфейси
```ts
export interface BuildingTypeData {
  id: string;
  modifier?: BonusSourceModifier;
  requirements?: Requirement[];
  ui: BuildingUI;
  cost: CostFormula;
  maxLevel: number;
  name: string;
  description: string;
  tags: string[];
  data?: Record<string, any>;
  maxQuantity?: number;
}

export interface BuildingInstance {
  id: string;
  typeId: string;
  level: number;
  built: boolean;
  position?: Vector3;
  constructionProgress?: number;
  resourcesCollected?: Record<string, number>;
  internalStorage?: Record<string, {
    capacity: number;
    current: number;
  }>;
  isFunctional?: boolean;
  lastUpdateTime?: number;
}

export interface BuildingUI {
  defaultScale: Vector3;
  rotationOffset: Vector3;
  modelName?: string;
  color?: string;
  bottomAnchor?: number;
}

export interface BuildingsManagerSaveData {
  buildingInstances: BuildingInstance[];
}
```

### Ключові методи для Internal Storage
```ts
// Storage info API (для UI та debugging)
getBuildingStorageInfo(buildingId: string): Record<string, {
  current: number;
  capacity: number;
  percentage: number;
}> | null;

// Storage management API
doesBuildingNeedRefill(buildingId: string, threshold?: number): boolean;
getBuildingMissingResourcesFromStorage(buildingId: string): Record<string, number>;

// Internal tick для оновлення внутрішніх складів
tick(deltaTime: number): void;
```

---

## Modules: DroneManager
**Файл(и):** `src/logic/modules/drones/DroneManager.ts`
**Призначення:** Управління дронами, їх характеристиками, батареєю та інвентарем.

### Публічні типи/інтерфейси
```ts
export interface Drone {
    id: string;
    position: Vector3;
    status: 'idle' | 'busy' | 'charging';
    currentCommandId?: string;
    battery: number;
    maxBattery: number;
    inventory: Record<string, number>;
    maxInventory: number;
    efficiency: number;
    speed: number;
    maxSpeed: number;
}

export interface DroneTypeData {
  id: string;
  name: string;
  description: string;
  baseCollectionSpeed: number;
  baseMovementSpeed: number;
  baseInventoryCapacity: number;
  baseBatteryCapacity: number;
  baseUnloadSpeed: number;
  baseEfficiencyMultiplier: number;
  ui: {
    defaultScale: Vector3;
    rotationOffset: Vector3;
    modelPath?: string;
  };
}
```

---

## Modules: ResourceManager
**Файл(и):** `src/logic/modules/resources/ResourceManager.ts`
**Призначення:** Управління ресурсами, їх балансами, доходами та витратами.

### Публічні типи/інтерфейси
```ts
export interface ResourceData {
  max: number;
  balance: number;
  income: number;
  consumption: number;
  multiplier: number;
}

export interface ResourceStatus {
  name?: string;
  required: number;
  own: number;
  isAffordable: boolean;
  progress: number;
  icon?: string;
  color?: string;
}

export interface ResourceRequest {
  [resourceId: string]: number;
}

export interface ResourceCheckResult {
  isAffordable: boolean;
  progress: number;
  resources: Record<ResourceId, ResourceStatus>;
  missing: ResourceRequest;
  totalRequired: number;
  totalOwn: number;
}

export interface ResourceChange {
  resourceId: ResourceId;
  amount: number;
  reason?: string;
}

export interface ResourceHistoryEntry {
  timestamp: number;
  resourceId: ResourceId;
  amount: number;
  reason: string;
  balance: number;
}

export interface ResourceSaveData {
  collectedResources: any[];
  resourceCounts: Record<ResourceId, number>;
}
```

---

## Modules: UpgradesManager
**Файл(и):** `src/logic/modules/upgrades/UpgradesManager.ts`
**Призначення:** Управління апгрейдами, їх рівнями та інтеграцією з системою бонусів.

### Публічні типи/інтерфейси
```ts
export interface UpgradeTypeData {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  cost: CostFormula;
  modifier?: BonusSourceModifier;
  requirements?: Requirement[];
  ui?: {
    icon?: string;
    category?: string;
  };
}

export interface UpgradeState {
  level: number;
  unlocked: boolean;
}

export interface UpgradeDataUI {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  currentLevel: number;
  cost: ResourceRequest;
  effects: any[];
}

export interface UpgradesManagerSaveData {
  upgradeStates: Record<string, { level: number; unlocked: boolean }>;
}
```
