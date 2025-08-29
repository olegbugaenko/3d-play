export { BuildingsManager } from './BuildingsManager';
export type { 
  BuildingTypeData, 
  BuildingInstance, 
  BuildingsManagerSaveData,
  ResourceRequest,
  CostFormula,
  BuildingModifier,
  BuildingUI
} from './buildings.types';
export { 
  BUILDINGS_DB, 
  getBuildingType, 
  getAllBuildingTypes, 
  isBuildingTypeExists, 
  getBuildingTypesCount 
} from './buildings-db';
