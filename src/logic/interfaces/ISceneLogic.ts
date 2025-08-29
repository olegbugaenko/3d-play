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
  getAllTags(): string[];
  getObjectsCountByTag(tag: string): number;
  
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
  getTotalObjectsCount(): number;
}
