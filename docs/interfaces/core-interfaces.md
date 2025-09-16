## Core Interfaces: Модулі та Системи
**Файл(и):** `src/logic/interfaces/`
**Призначення:** Основні інтерфейси для всіх модулів та систем проекту.

### Публічні типи/інтерфейси

---

## IBonusSystem
**Файл(и):** `src/logic/interfaces/IBonusSystem.ts`
**Призначення:** Інтерфейс для системи бонусів та модифікаторів.

```ts
export interface IBonusSystem {
  // Основні методи
  getResourceValue(resourceId: string): any;
  buildDependencyGraph(): void;
  
  // Реєстрація джерел
  registerSource(id: string, data: any): void;
  setSourceState(id: string, level: number, efficiency?: number): void;
  updateBonusSourceLevel(sourceId: string, level: number): void;
  
  // Отримання ефектів
  getEffectValue(effectId: string): number;
  
  // Отримання деталей бонусів
  getBonusDetails(bonusSourceId: string, level?: number): any[];
  
  // Системні методи
  reset(): void;
}
```

---

## IBuildingsManager
**Файл(и):** `src/logic/interfaces/IBuildingsManager.ts`
**Призначення:** Інтерфейс для управління будівлями та їх станом.

```ts
export interface IBuildingsManager extends SaveLoadManager {
  // Основні методи
  buildOrUpgrade(instanceId: string, typeId: string, position?: Vector3): boolean;
  destroyBuilding(instanceId: string): boolean;
  moveBuilding(instanceId: string, newPosition: Vector3): boolean;
  planBuilding(instanceId: string, typeId: string, position: Vector3): boolean;
  
  // Отримання даних
  getBuildingInstance(instanceId: string): any | undefined;
  getBuildingType(typeId: string): any | undefined;
  getAllBuildingTypes(): Map<string, any>;
  getAllBuildingInstances(): Map<string, any>;
  
  // Додаткові методи
  registerBuildingType(id: string, data: any): void;
  setInitialState(instanceId: string, typeId: string, level?: number, built?: boolean, position?: Vector3): void;
  generateBuilding(typeId: string, position: Vector3, level?: number): void;
  
  // Методи для реквайрментів
  canBuild(buildingTypeId: string): boolean;
  getTotalLevelForBuildingType(buildingTypeId: string): number;
  getMaxLevelForBuildingType(buildingTypeId: string): number;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
  
  // Синхронізація isBuilt статусу
  syncBuildingIsBuiltStatus(instanceId: string): void;
  syncAllBuildingsIsBuiltStatus(): void;
  updateBuildingStatus(instanceId: string, built: boolean, level: number): void;
  updateConstructionProgress(instanceId: string, progress: number, resourcesCollected?: Record<string, number>): void;
  
  // Завершення будівництва та управління бонусами
  completeBuildingConstruction(instanceId: string): void;
  updateBonusLevelForBuildingType(buildingTypeId: string): void;
}
```

---

## IDroneManager
**Файл(и):** `src/logic/interfaces/IDroneManager.ts`
**Призначення:** Інтерфейс для управління дронами та їх станом.

```ts
export interface IDroneManager extends SaveLoadManager {
  // Основні методи
  createDrone(id: string, position: Vector3, type: string): any;
  removeDrone(droneId: string): boolean;
  moveDrone(droneId: string, target: Vector3): boolean;
  
  // Отримання даних
  getDrone(droneId: string): any | null;
  getAllDrones(): any[];
  getDronesByTag(tag: string): any[];
  
  // Системні методи
  tick(dT: number): void;
  reset(): void;
  beforeInit?(): void;
}
```

---

## IResourceManager
**Файл(и):** `src/logic/interfaces/IResourceManager.ts`
**Призначення:** Інтерфейс для управління ресурсами гри.

```ts
export interface IResourceManager extends SaveLoadManager {
  // Основні методи
  getResourceAmount(resourceId: ResourceId): number;
  getResourceCapacity(resourceId: ResourceId): number;
  getResourceProgress(resourceId: ResourceId): number;
  
  // Зміна ресурсів
  addResources(changes: ResourceChange[]): boolean;
  spendResources(changes: ResourceChange[]): boolean;
  setResourceAmount(resourceId: ResourceId, amount: number, reason?: string): void;
  
  // Перевірка ресурсів
  checkResources(request: ResourceRequest): ResourceCheckResult;
  
  // Системні методи
  tick(dT: number): void;
  reset(): void;
  
  // Методи для роботи з історією
  clearHistory(): void;
  getHistoryStats(): { totalEntries: number; maxSize: number; oldestEntry?: number; newestEntry?: number };
}
```

---

## IUpgradesManager
**Файл(и):** `src/logic/interfaces/IUpgradesManager.ts`
**Призначення:** Інтерфейс для управління апгрейдами та їх станом.

```ts
export interface IUpgradesManager extends SaveLoadManager {
  // Основні методи
  purchaseUpgrade(instanceId: string): boolean;
  upgradeLevel(typeId: string): boolean;
  unlockUpgrade(typeId: string): boolean;
  
  // Отримання даних
  getUpgrade(typeId: string): UpgradeDataUI | null;
  getAllUpgrades(): Map<string, UpgradeState>;
  getUpgradeCost(typeId: string, level: number): ResourceRequest | undefined;
  getUpgradeState(typeId: string): UpgradeState | undefined;
  
  // Методи для реквайрментів
  isUnlocked(upgradeId: string): boolean;
  getAvailableUpgrades(): UpgradeTypeData[];
  
  // Додаткові методи
  registerUpgradeType(id: string, data: UpgradeTypeData): void;
  setInitialState(typeId: string, level?: number, unlocked?: boolean): void;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
```

---

## ISceneLogic
**Файл(и):** `src/logic/interfaces/ISceneLogic.ts`
**Призначення:** Інтерфейс для логіки 3D сцени та управління об'єктами.

```ts
export interface ISceneLogic {
  // Основні методи
  getObjectById<T = any>(id: string): TSceneObject<T> | undefined;
  getObjects(): Record<string, TSceneObject<any>>;
  pushObject<T = any>(object: TSceneObject<T>): boolean;
  pushObjectWithTerrainConstraint<T = any>(object: TSceneObject<T>): boolean;
  
  // Пошук по тегах
  getObjectsByTag(tag: string): TSceneObject<any>[];
  getObjectsByTags(tags: string[]): TSceneObject<any>[];
  getObjectsByAnyTag(tags: string[]): TSceneObject<any>[];
  getObjectsByTagInRadius(tag: string, center: Vector3, radius: number): TSceneObject<any>[];
  
  // Теги
  addObjectTags(id: string, tags: string[]): void;
  removeObjectTags(id: string, tags: string[]): void;
  setObjectTags(id: string, tags: string[]): void;
  updateObjectTags(id: string, newTags: string[], removeTags?: string[]): void;
  getAllTags(): string[];
  getObjectsCountByTag(tag: string): number;
  
  // Валідація та очищення tagCache
  validateTagCache(): { isValid: boolean; issues: string[] };
  cleanupTagCache(): void;
  
  // Terrain
  getTerrainManager(): any | null;
  updateViewport(cameraProps: TCameraProps): void;
  initializeViewport(cameraProps: TCameraProps, bounds?: Vector3): void;
  
  // Додаткові методи
  moveObjectWithTerrainConstraint(id: string, newPosition: Vector3): boolean;
  
  // Видалення об'єктів
  removeObject(id: string): boolean;
  
  // Методи для Scene3D
  getVisibleObjects(): TSceneObject<any>[];
  getVisibleObjectsOptimized(): TSceneObject<any>[];
  getDirtyObjects(): TSceneObject<any>[];
  clearDirtyFlagsAfterSync(): void;
  getTotalObjectsCount(): number;
  
  // Метод для маркування об'єкта як dirty
  markObjectDirty(id: string): void;
  
  // Метод для синхронізації ротації
  syncRotation(obj: TSceneObject<any>): void;
  
  // Pathfinding system
  pathfinder: any;
}
```

---

## IMapLogic
**Файл(и):** `src/logic/interfaces/IMapLogic.ts`
**Призначення:** Інтерфейс для логіки карти та генерації ресурсів.

```ts
export interface IMapLogic extends SaveLoadManager {
  // Основні методи
  newGame(): void;
  tick(dT: number): void;
  setCommandSystems(commandSystem: any, commandGroupSystem: any): void;
  
  // Генерація карти
  generateMap(seed?: number): void;
  updateGenerationSeed(seed: number): void;
  generateTerrain(): void;
  generateResources(): void;
  generateBuildings(): void;
  
  // Отримання даних
  getObjects(): Record<string, TSceneObject<any>>;
  getObjectsByTag(tag: string): TSceneObject<any>[];
  getObjectById(id: string): TSceneObject<any> | undefined;
  
  // Додаткові методи для CommandSystem
  scene: ISceneLogic; // SceneLogic instance
  commandGroupSystem: any; // CommandGroupSystem instance
  
  // Додаткові властивості для Scene3D
  commandSystem: any;
  selection: any;
  autoGroupMonitor: any;
  generatedSeed: number;
  collectedRocks: any[];
  generationTracker: any;
  seededRandom: any;
  dynamics: any;
  resources: any;
  buildingsManager: any;
  upgradesManager: any;
  droneManager: any;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
  
  // Методи для взаємодії з ресурсами та об'єктами
  mineResource(resourceId: string, selectedObjects: string[]): void;
  chargeObject(selectedObjects: string[]): void;
  handleRightclickCommand(selectedObjects: string[], targetPosition: { x: number; y: number; z: number }, selectedCommand?: any): void;
  
  // Методи для збору ресурсів
  collectRock(rockId: string): void;
  collectBiomass(biomassId: string): void;
  
  // Dependency validation
  validateDependencies(): { isValid: boolean; missing: string[] };
}
```

---

## IRequirementsSystem
**Файл(и):** `src/logic/interfaces/IRequirementsSystem.ts`
**Призначення:** Інтерфейс для системи перевірки вимог.

```ts
export interface IRequirementsSystem {
  /**
   * Перевіряє чи задоволені всі реквайрменти
   */
  checkRequirements(requirements: Requirement[]): RequirementsCheckResult;
}
```

---

## ISaveManager
**Файл(и):** `src/logic/interfaces/ISaveManager.ts`
**Призначення:** Інтерфейс для системи збереження/завантаження.

```ts
export interface ISaveManager extends SaveLoadManager {
  // Основні методи збереження/завантаження
  saveGame(slotId: number): void;
  loadGame(slotId: number): void;
  deleteSlot(slotId: number): boolean;
  
  // Отримання даних
  getSaveSlots(): Array<{ slot: number; timestamp: number; hasData: boolean }>;
  
  // Реєстрація менеджерів
  registerManager(name: string, manager: SaveLoadManager): void;
  
  // Управління поточним слотом
  setCurrentSlot(slot: number): void;
  getCurrentSlot(): number | null;
  saveToCurrentSlot(): boolean;
  
  // Додаткові властивості для Scene3D
  managers: Map<string, SaveLoadManager>;
  SAVE_KEY_PREFIX: string;
  VERSION: string;
  mapLogic: any;
  newGame(slot?: number): void;
  getLoadOrder(): string[];
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
```

---

## ICommandGroupSystem
**Файл(и):** `src/logic/interfaces/ICommandGroupSystem.ts`
**Призначення:** Інтерфейс для системи управління групами команд.

```ts
export interface ICommandGroupSystem extends SaveLoadManager {
  // Основні методи
  executeCommandGroup(groupId: string, objectIds: string[]): boolean;
  cancelCommandGroup(objectId: string, groupId: string): boolean;
  addCommandToGroup(groupId: string, command: Command, objectIds: string[]): boolean;
  
  // Отримання даних
  getCommandGroup(groupId: string): any | undefined;
  getAllCommandGroups(): Map<string, any>;
  getActiveGroups(): Map<string, any>;
  
  // Методи для UI з реквайрментами
  isUnlocked(groupId: string): boolean;
  getAvailableCommandGroups(): any[];
  getAvailableUIGroups(): any[];
  getAvailableGroupsByScope(scope: 'gather' | 'build' | 'none'): any[];
  getAvailableGroupsByScopeAndCategory(scope: 'gather' | 'build' | 'none', category: string): any[];
  
  // Системні методи
  tick(dT: number): void;
  update(dT: number): void;
  reset(): void;
  beforeInit?(): void;
}
```
