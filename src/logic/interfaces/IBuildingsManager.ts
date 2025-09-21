import { Vector3 } from '@utils/vector-math';
import { SaveLoadManager } from '@save-load/save-load.types';
import { BuildingInstance, BuildingTypeData, BuildingTypeId, RoadTypeId } from '@buildings/buildings.types';

export interface IBuildingsManager extends SaveLoadManager {
  // Основні методи
  buildOrUpgrade(instanceId: string, typeId: BuildingTypeId, position?: Vector3): boolean;
  destroyBuilding(instanceId: string): boolean;
  moveBuilding(instanceId: string, newPosition: Vector3): boolean;
  planBuilding(instanceId: string, typeId: BuildingTypeId, position: Vector3): boolean;

  // Отримання даних
  getBuildingInstance(instanceId: string): BuildingInstance | undefined;
  getBuildingType(typeId: BuildingTypeId): BuildingTypeData | undefined;
  getAllBuildingTypes(): Map<BuildingTypeId, BuildingTypeData>;
  getAllBuildingInstances(): Map<string, BuildingInstance>;

  // Додаткові методи
  registerBuildingType(id: BuildingTypeId, data: BuildingTypeData): void;
  setInitialState(instanceId: string, typeId: BuildingTypeId, level?: number, built?: boolean, position?: Vector3): void;
  generateBuilding(typeId: BuildingTypeId, position: Vector3, level?: number): void;

  // Методи для реквайрментів
  canBuild(buildingTypeId: BuildingTypeId): boolean;
  getTotalLevelForBuildingType(buildingTypeId: BuildingTypeId): number;
  getMaxLevelForBuildingType(buildingTypeId: BuildingTypeId): number;

  // Дороги
  canBuildRoad(roadTypeId: RoadTypeId): boolean;
  generateRoads(type: RoadTypeId, path: Array<{ x: number; z: number }>): string | null;

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
  updateBonusLevelForBuildingType(buildingTypeId: BuildingTypeId): void;
}
