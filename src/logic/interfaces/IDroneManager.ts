import { Vector3 } from '@utils/vector-math';
import { SaveLoadManager } from '@save-load/save-load.types';

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
