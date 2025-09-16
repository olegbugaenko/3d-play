import { TCameraProps } from '../../../shared/camera.types';
import { TSceneObject } from '@scene/scene.types';
import { Vector3 } from '@utils/vector-math';

export interface ISceneLogic {
  // Основні методи
  getObjectById<T = any>(id: string): TSceneObject<T> | undefined;
  getObjects(): Record<string, TSceneObject<any>>;
  pushObject<T = any>(object: TSceneObject<T>): boolean;
  pushObjectWithTerrainConstraint<T = any>(object: TSceneObject<T>): boolean;
  
  // Пошук по тегам
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
  
  // 🚀 Метод для маркування об'єкта як dirty
  markObjectDirty(id: string): void;
  
  // 🚀 Метод для синхронізації ротації
  syncRotation(obj: TSceneObject<any>): void;
  
  // Pathfinding system
  pathfinder: any;
}
