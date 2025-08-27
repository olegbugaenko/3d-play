import { Vector3 } from 'three';
import { SceneObject } from '../../src/components/renderers/BaseRenderer';

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
    const objects = this.mapLogic.scene.getObjects();
    let closestObject = null;
    let closestDistance = maxDistance;

    for (const obj of Object.values(objects)) {
      if (obj.tags && obj.tags.includes(tag)) {
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
   * Знаходить найближчий об'єкт з вказаним типом команди
   */
  getClosestObjectByCommandType(commandType: string, fromPosition: Vector3, maxDistance: number = 1000): any {
    const objects = this.mapLogic.scene.getObjects();
    let closestObject = null;
    let closestDistance = maxDistance;

    for (const obj of Object.values(objects)) {
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
   */
  getResourcesInRadius(tag: string, center: { x: number; y: number; z: number }, radius: number): any[] {
            // Пошук об'єктів у радіусі
    return this.mapLogic.scene.getObjectsByTagInRadius('resource', center, radius).filter((one: SceneObject) => one.data.resourceId === tag).map((one: SceneObject) => one.id);
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
