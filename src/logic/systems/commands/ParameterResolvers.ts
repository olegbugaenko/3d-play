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
   * Враховує obstacleSize об'єктів при розрахунку відстані
   * Використовує оптимізований пошук через gridSystem
   */
  getClosestObjectByCommandType(commandType: string, fromPosition: Vector3, maxDistance: number = 1000): any {
    // Використовуємо оптимізований метод для пошуку об'єктів в радіусі
    const objectsInRadius = this.mapLogic.scene.getObjectsInRadius(
      { x: fromPosition.x, y: fromPosition.y, z: fromPosition.z },
      maxDistance
    );
    
    let closestObject = null;
    let closestDistance = maxDistance;

    for (const obj of objectsInRadius) {
      if (obj.commandType && obj.commandType.includes(commandType)) {
        const objPos = new Vector3(obj.coordinates.x, obj.coordinates.y, obj.coordinates.z);
        const baseDistance = fromPosition.distanceTo(objPos);
        
        // Враховуємо obstacleSize об'єкта при розрахунку відстані
        const obstacleSize = obj.obstacleSize || 0;
        const adjustedDistance = Math.max(0, baseDistance - obstacleSize);
        
        if (adjustedDistance < closestDistance) {
          closestDistance = adjustedDistance;
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

  /**
   * Сортує масив об'єктів за відстанню до дрона
   * Повертає відсортований масив ID об'єктів (найближчі спочатку)
   */
  sortObjectsByDistanceToDrone(objectIds: string[], dronePosition: Vector3): string[] {
    if (!Array.isArray(objectIds) || objectIds.length === 0) {
      return [];
    }

    // Отримуємо всі об'єкти з ID
    const objects = objectIds.map(id => this.mapLogic.scene.getObjectById(id)).filter(obj => obj !== undefined);
    
    // Сортуємо за відстанню до дрона
    const sortedObjects = objects.sort((a, b) => {
      const posA = new Vector3(a!.coordinates.x, a!.coordinates.y, a!.coordinates.z);
      const posB = new Vector3(b!.coordinates.x, b!.coordinates.y, b!.coordinates.z);
      
      const distanceA = dronePosition.distanceTo(posA);
      const distanceB = dronePosition.distanceTo(posB);
      
      return distanceA - distanceB; // Найближчі спочатку
    });
    
    // Повертаємо тільки ID відсортованих об'єктів
    return sortedObjects.map(obj => obj!.id);
  }

  /**
   * Отримує найближчу точку доступу до об'єкта для взаємодії
   * Використовує findDockingPointToStatic для знаходження оптимальної точки стиковки
   */
  getObjectAccessPoint(objectId: string, droneId: string): Vector3 | null {
    const targetObject = this.mapLogic.scene.getObjectById(objectId);
    const droneObject = this.mapLogic.scene.getObjectById(droneId);
    
    if (!targetObject || !droneObject) {
      return null;
    }

    // Отримуємо PathfindingSystem
    const pathfindingSystem = this.mapLogic.scene.pathfinder;
    if (!pathfindingSystem) {
      return null;
    }

    try {
      // Знаходимо найближчу точку доступу до об'єкта
      const dockingPoint = pathfindingSystem.findDockingPointToStatic(
        droneObject,
        targetObject,
        0.05, // safety margin
        true  // fullCircle
      );

      if (dockingPoint) {
        return new Vector3(dockingPoint.x, dockingPoint.y, dockingPoint.z);
      } else {
        console.warn(`No docking point found for object ${objectId}`);
        return null;
      }
    } catch (error) {
      console.warn('Error finding docking point:', error);
      return null;
    }
  }
}
