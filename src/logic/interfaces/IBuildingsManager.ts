import { Vector3 } from '@utils/vector-math';
import { SaveLoadManager } from '@save-load/save-load.types';

export interface IBuildingsManager extends SaveLoadManager {
  // Основні методи
  buildOrUpgrade(instanceId: string, typeId: string, position?: Vector3): boolean;
  destroyBuilding(instanceId: string): boolean;
  moveBuilding(instanceId: string, newPosition: Vector3): boolean;
  
  // Отримання даних
  getBuildingInstance(instanceId: string): any | undefined;
  getBuildingType(typeId: string): any | undefined;
  getAllBuildingTypes(): Map<string, any>;
  getAllBuildingInstances(): Map<string, any>;
  
  // Додаткові методи
  registerBuildingType(id: string, data: any): void;
  setInitialState(instanceId: string, typeId: string, level?: number, built?: boolean, position?: Vector3): void;
  generateBuilding(typeId: string, position: Vector3, level?: number): void;
  
  // Системні методи
  reset(): void;
  beforeInit?(): void;
}
