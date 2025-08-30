import { Vector3 } from 'three';
import { TSceneObject  } from '@scene/scene.types';

export interface ParameterResolverContext {
  objectId: string;
  scene: any;
  mapLogic: any;
}

export class ParameterResolvers {
  constructor(private mapLogic: any) {}

  /**
   * Отримує позицію об'єкта по ID
   */
  getObjectPosition(objectId: string): Vector3 | null {
    const obj = this.mapLogic.scene.getObjectById(objectId);
    if (!obj || !obj.coordinates) {
      return null;
    }
    
    return new Vector3(
      obj.coordinates.x,
      obj.coordinates.y + (obj.bottomAnchor || 0),
      obj.coordinates.z
    );
  }

  /**
   * Знаходить найближчий об'єкт з вказаним тегом
   */
  getClosestObjectByTag(tag: string, fromPosition: Vector3, maxDistance: number = 1000): any {
    const objects = this.mapLogic.scene.getObjectsByTag(tag);
    let closestObject = null;
    let closestDistance = maxDistance;

    for (const obj of Object.values<TSceneObject>(objects)) {
        const objPos = new Vector3(obj.coordinates.x, obj.coordinates.y, obj.coordinates.z);
        const distance = fromPosition.distanceTo(objPos);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestObject = obj;
        }
    }

    return closestObject?.id;
  }

  /**
   * Знаходить найближчий об'єкт з вказаним типом команди
   */
  getClosestObjectByCommandType(commandType: string, fromPosition: Vector3, maxDistance: number = 1000): any {
    const objects = this.mapLogic.scene.getObjects();
    let closestObject = null;
    let closestDistance = maxDistance;

    for (const obj of Object.values<TSceneObject>(objects)) {
      if (obj.commandType && obj.commandType.includes(commandType)) {
        const objPos = new Vector3(obj.coordinates.x, obj.coordinates.y, obj.coordinates.z);
        const distance = fromPosition.distanceTo(objPos);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestObject = obj;
        }
      }
    }

    return closestObject?.id;
  }

  /**
   * Отримує поточну позицію об'єкта
   */
  getCurrentObjectPosition(objectId: string): Vector3 | null {
    return this.getObjectPosition(objectId);
  }

  /**
   * Знаходить найближчий склад (об'єкт з тегом 'storage')
   */
  getClosestStorage(fromPosition: Vector3, maxDistance: number = 1000): any {
    return this.getClosestObjectByTag('storage', fromPosition, maxDistance);
  }

  /**
   * Знаходить найближчий об'єкт для вивантаження ресурсів
   */
  getClosestUnloadTarget(fromPosition: Vector3, maxDistance: number = 1000): any {
    return this.getClosestObjectByCommandType('unload-resources', fromPosition, maxDistance);
  }

  /**
   * Знаходить найближчу зарядну станцію
   */
  getClosestChargingStation(fromPosition: Vector3, maxDistance: number = 1000): any {
    return this.getClosestObjectByTag('charge', fromPosition, maxDistance);
  }

  /**
   * Знаходить всі ресурси з вказаним тегом в межах радіуса
   * Фільтрує тільки розблоковані ресурси
   */
  getResourcesInRadius(tag: string, center: { x: number; y: number; z: number }, radius: number): any[] {
    // Пошук об'єктів у радіусі
    
    // Отримуємо всі ресурси в радіусі
    const allResources = this.mapLogic.scene.getObjectsByTagInRadius('resource', center, radius);
    
    // Фільтруємо по типу ресурсу та розблокованості
    const filteredResources = allResources.filter((one: TSceneObject) => {
      // Перевіряємо чи це потрібний тип ресурсу
      if (tag !== 'resource' && one.data.resourceId !== tag) {
        return false;
      }
      
      // Перевіряємо чи ресурс розблокований
      const resourceId = one.data.resourceId;
      if (!resourceId) {
        return false;
      }
      
      // Отримуємо ResourceManager через MapLogic
      const resourceManager = this.mapLogic.resources;
      if (!resourceManager) {
        console.warn('ResourceManager not available for resource filtering');
        return true; // Якщо нема ResourceManager - показуємо всі
      }
      
      return resourceManager.isUnlocked(resourceId);
    });
    
    return filteredResources.map((one: TSceneObject) => one.id);
  }

  /**
   * Отримує тип ресурсу з параметрів команди
   */
  getResourceType(resourceType: string): string {
    return resourceType;
  }

  /**
   * Отримує перший елемент з масиву
   */
  getFirstOfList(list: any[]): any {
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }
    return list[0];
  }
}
