import { TSceneObject } from '@scene/scene.types';
import { SaveLoadManager } from '@save-load/save-load.types';
import { ISceneLogic } from './ISceneLogic';

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
}
