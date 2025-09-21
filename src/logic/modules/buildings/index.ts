export { BuildingsManager } from './BuildingsManager';
export type {
  BuildingTypeData,
  BuildingInstance,
  BuildingTypeId,
  BuildingsManagerSaveData,
  BuildingUI,
  RoadTypeId,
} from './buildings.types';
export { BUILDING_TYPE_IDS, ROAD_TYPE_IDS } from './buildings.types';
export {
  BUILDINGS_DB,
  getBuildingType,
  getAllBuildingTypes, 
  isBuildingTypeExists, 
  getBuildingTypesCount 
} from './buildings-db';
