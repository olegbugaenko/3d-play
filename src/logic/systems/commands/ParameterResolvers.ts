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
  getClosestObjectByTag(
    tag: string, 
    fromPosition: Vector3, 
    maxDistance: number = 1000,
    filter?: (obj: TSceneObject) => boolean
  ): any {
    const objects = this.mapLogic.scene.getObjectsByTag(tag);
    let closestObject = null;
    let closestDistance = maxDistance;

    for (const obj of Object.values<TSceneObject>(objects)) {
        // Застосовуємо фільтр якщо він переданий
        if (filter && !filter(obj)) {
          continue;
        }

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
    return this.getClosestObjectByTag('storage', fromPosition, maxDistance, (obj) => obj.data?.isBuilt !== false);
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
    return this.getClosestObjectByTag('charge', fromPosition, maxDistance, (obj) => obj.data?.isBuilt !== false);
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

      console.log(`Finding docking for ${targetObject.id}: `, targetObject.coordinates, dockingPoint);

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

  /**
   * Отримує інстанс будівлі по ID
   */
  getBuildingInstance(buildingId: string): any {
    const buildingsManager = this.mapLogic.buildingsManager;
    if (!buildingsManager) {
      console.error('[ParameterResolvers] BuildingsManager not found');
      return null;
    }

    const buildingInstance = buildingsManager.getBuildingInstance(buildingId);
    if (!buildingInstance) {
      console.error(`[ParameterResolvers] Building instance not found: ${buildingId}`);
      return null;
    }

    return buildingInstance;
  }

  /**
   * Отримує ресурси, потрібні для будівництва
   */
  getBuildingRequiredResources(buildingId: string): Record<string, number> {
    const buildingInstance = this.getBuildingInstance(buildingId);
    if (!buildingInstance) {
      return {};
    }

    const buildingsManager = this.mapLogic.buildingsManager;
    if (!buildingsManager) {
      return {};
    }

    try {
      // Отримуємо тип будівлі
      const buildingType = buildingsManager.getBuildingType(buildingInstance.typeId);
      if (!buildingType) {
        console.error(`[ParameterResolvers] Building type not found: ${buildingInstance.typeId}`);
        return {};
      }

      // Отримуємо costs для рівня 1 (початкове будівництво)
      if (!buildingType.cost) {
        console.error(`[ParameterResolvers] No cost formula found for building ${buildingInstance.typeId}`);
        throw new Error(`No cost formula found for building ${buildingInstance.typeId}`);
      }

      const costs = buildingType.cost(1); // Викликаємо формулу з рівнем 1
      if (!costs) {
        console.error(`[ParameterResolvers] Cost formula returned null for building ${buildingInstance.typeId} level 1`);
        throw new Error(`Cost formula returned null for building ${buildingInstance.typeId} level 1`);
      }

      // Конвертуємо costs в формат Record<string, number>
      const requiredResources: Record<string, number> = {};
      
      for (const [resourceId, amount] of Object.entries(costs)) {
        if (typeof amount === 'number' && amount > 0) {
          requiredResources[resourceId] = amount;
        }
      }

      console.log(`[ParameterResolvers] Required resources for ${buildingId}:`, requiredResources);
      return requiredResources;

    } catch (error) {
      console.error(`[ParameterResolvers] Error getting required resources for ${buildingId}:`, error);
      return {};
    }
  }

  /**
   * Обчислює відсутні ресурси для будівництва
   */
  getMissingResources(buildingId: string): Record<string, number> {
    const buildingInstance = this.getBuildingInstance(buildingId);
    const requiredResources = this.getBuildingRequiredResources(buildingId);
    
    if (!buildingInstance || Object.keys(requiredResources).length === 0) {
      return {};
    }

    const collectedResources = buildingInstance.resourcesCollected || {};
    const missingResources: Record<string, number> = {};

    // Обчислюємо різницю між потрібними та зібраними ресурсами
    for (const [resourceId, required] of Object.entries(requiredResources)) {
      const collected = collectedResources[resourceId] || 0;
      const missing = Math.max(0, required - collected);
      
      if (missing > 0) {
        missingResources[resourceId] = missing;
      }
    }

    console.log(`[ParameterResolvers] Missing resources for ${buildingId}:`, missingResources);
    return missingResources;
  }

  /**
   * Перевіряє чи є ще відсутні ресурси для будівництва
   */
  checkHasMissingResources(buildingId: string): boolean {
    const missingResources = this.getMissingResources(buildingId);
    const hasMissing = Object.values(missingResources).some(amount => amount > 0);
    
    console.log(`[ParameterResolvers] Has missing resources for ${buildingId}:`, hasMissing);
    return hasMissing;
  }

  /**
   * Універсальний резолвер для обчислення суми значень в об'єкті
   * @param values - об'єкт з числовими значеннями
   * @returns сума всіх значень
   */
  getValuesSum(values: Record<string, any>): number {
    if (!values || typeof values !== 'object') {
      console.warn(`[ParameterResolvers] getValuesSum: invalid input:`, values);
      return 0;
    }

    const sum = Object.values(values).reduce((total, val) => {
      const numVal = typeof val === 'number' ? val : 0;
      return total + numVal;
    }, 0);
    
    console.log(`[ParameterResolvers] Values sum:`, { values, sum });
    return sum;
  }

  /**
   * Отримує ресурси які є у дрона але не потрібні для будівництва
   */
  getUnnecessaryResources(objectId: string, requiredResources: Record<string, number>): Record<string, number> {
    const object = this.mapLogic.scene.getObjectById(objectId);
    if (!object || !object.data?.storage) {
      console.log(`[ParameterResolvers] Object not found or no storage:`, objectId);
      return {};
    }

    const storage = object.data.storage as Record<string, number>;
    const unnecessaryResources: Record<string, number> = {};

    // Проходимо по всіх ресурсах в storage дрона
    for (const [resourceId, currentAmount] of Object.entries(storage)) {
      if (currentAmount > 0) {
        const requiredAmount = requiredResources[resourceId] || 0;
        
        // Якщо цей ресурс не потрібен для будівництва - додаємо весь
        if (requiredAmount === 0) {
          unnecessaryResources[resourceId] = currentAmount;
        }
        // Якщо маємо більше ніж потрібно - додаємо надлишок
        else if (currentAmount > requiredAmount) {
          unnecessaryResources[resourceId] = currentAmount - requiredAmount;
        }
      }
    }

    console.log(`[ParameterResolvers] Unnecessary resources:`, { objectId, requiredResources, storage, unnecessaryResources });
    return unnecessaryResources;
  }

  /**
   * Планер для building-transfer: визначає напрямок, resourceId та amount, а також точки доступу і склад
   */
  planBuildingTransfer(buildingId: string, objectId: string): any {
    const bm = this.mapLogic.buildingsManager as any;
    if (!bm) return null;
    const sm = bm.storageManager || bm.getStorageManager?.();
    if (!sm?.pickBuildingTransferAction) return null;

    const plan = sm.pickBuildingTransferAction(buildingId);
    if (!plan) return null;

    const dronePos = this.getCurrentObjectPosition(objectId) || new Vector3(0,0,0);
    const buildingAccess = this.getObjectAccessPoint(buildingId, objectId);
    const closestStorageId = this.getClosestStorage(dronePos, 200);
    const storageAccess = closestStorageId ? this.getObjectAccessPoint(closestStorageId, objectId) : null;

    // amount heuristics: 5 by default
    const inst = bm.getBuildingInstance(buildingId);
    const storageInfo = inst?.internalStorage?.[plan.resourceId];
    const drone = this.mapLogic.scene.getObjectById(objectId);
    const droneFree = Math.max(0, (drone?.data?.maxCapacity || 5) - (Object.values(drone?.data?.storage || {}).reduce((s: number, v: any) => s + (v as number), 0)));

    let amount = 0;
    if (plan.direction === 'from-building') {
      // collect: беремо з будівлі стільки, скільки влізе в дрон і є у будівлі
      amount = Math.min(droneFree, storageInfo?.current || 0);
    } else {
      // to-building: беремо скільки бракує
      const missing = Math.max(0, (storageInfo?.capacity || 0) - (storageInfo?.current || 0));
      amount = Math.min(missing, droneFree || 5);
    }

    // Для load-resources: скільки треба завантажити зі складу
    const loadResourcesMap: Record<string, number> = {};
    loadResourcesMap[plan.resourceId] = Math.max(0, amount);

    // Для unload-resources: скільки треба вивантажити з дрона
    const droneStorage = drone?.data?.storage?.[plan.resourceId] || 0;
    const unloadResourcesMap: Record<string, number> = {};
    
    if (plan.direction === 'from-building') {
      // Збираємо з будівлі - вивантажуємо все що завантажили
      unloadResourcesMap[plan.resourceId] = Math.max(0, amount);
    } else {
      // Веземо в будівлю - вивантажуємо все що є в дрона цього ресурсу
      unloadResourcesMap[plan.resourceId] = Math.max(0, droneStorage);
    }

    // Якщо нема що везти — не стартуємо групу
    if (loadResourcesMap[plan.resourceId] <= 0 && unloadResourcesMap[plan.resourceId] <= 0) return null;

    return {
      ...plan,
      amount: Math.max(0, amount),
      buildingAccessPoint: buildingAccess,
      closestStorageId,
      storageAccessPoint: storageAccess,
      resources: loadResourcesMap,
      resourcesToUnload: unloadResourcesMap
    };
  }

  /**
   * Отримує інстанс дороги по ID
   */
  getRoadInstance(roadId: string): any {
    const buildingsManager = this.mapLogic.buildingsManager;
    if (!buildingsManager) {
      console.error('[ParameterResolvers] BuildingsManager not found');
      return null;
    }

    const roadInstance = buildingsManager.getRoadInfo(roadId);
    if (!roadInstance) {
      console.error(`[ParameterResolvers] Road instance not found: ${roadId}`);
      return null;
    }

    return roadInstance;
  }

  /**
   * Отримує наступний недобудований сегмент дороги
   */
  getNextUnbuiltRoadSegment(roadId: string): any {
    const roadInstance = this.getRoadInstance(roadId);
    if (!roadInstance || !roadInstance.segments) {
      return null;
    }

    const unbuiltIndex = roadInstance.segments.findIndex((s: any) => s.buildingState !== 'completed');
    if (unbuiltIndex === -1) {
      return null; // Всі сегменти побудовані
    }

    return {
      id: `${roadId}-segment-${unbuiltIndex}`,
      index: unbuiltIndex,
      segment: roadInstance.segments[unbuiltIndex]
    };
  }

  /**
   * Отримує потрібні ресурси для сегмента дороги
   */
  getRoadSegmentRequiredResources(roadId: string, segmentIndex: number): Record<string, number> {
    const buildingsManager = this.mapLogic.buildingsManager;
    if (!buildingsManager) {
      return {};
    }

    // Використовуємо універсальний метод з BuildingsManager
    return buildingsManager.calculateRoadCost(roadId, segmentIndex);
  }

  /**
   * Отримує позицію сегмента дороги (центр сегмента)
   */
  getRoadSegmentPosition(roadId: string, segmentIndex: number): Vector3 | null {
    const roadInstance = this.getRoadInstance(roadId);
    if (!roadInstance || !roadInstance.segments || !roadInstance.segments[segmentIndex]) {
      return null;
    }

    const segment = roadInstance.segments[segmentIndex];
    
    // Якщо є startPoint та endPoint - беремо центр між ними
    if (segment.startPoint && segment.endPoint) {
      const centerX = (segment.startPoint.x + segment.endPoint.x) / 2;
      const centerY = (segment.startPoint.y + segment.endPoint.y) / 2;
      const centerZ = (segment.startPoint.z + segment.endPoint.z) / 2;
      
      return new Vector3(centerX, centerY, centerZ);
    }

    // Інакше спробуємо отримати з path дороги
    if (roadInstance.path && roadInstance.path.length > segmentIndex + 1) {
      const startPoint = roadInstance.path[segmentIndex];
      const endPoint = roadInstance.path[segmentIndex + 1];
      
      const centerX = (startPoint.x + endPoint.x) / 2;
      const centerY = (startPoint.y + endPoint.y) / 2;
      const centerZ = (startPoint.z + endPoint.z) / 2;
      
      return new Vector3(centerX, centerY, centerZ);
    }

    return null;
  }

  /**
   * Обчислює відсутні ресурси для сегмента дороги
   */
  getMissingResourcesForRoadSegment(roadId: string, segmentIndex: number): Record<string, number> {
    const requiredResources = this.getRoadSegmentRequiredResources(roadId, segmentIndex);
    const roadInstance = this.getRoadInstance(roadId);
    
    if (!roadInstance || !roadInstance.segments || !roadInstance.segments[segmentIndex]) {
      return {};
    }

    const segment = roadInstance.segments[segmentIndex];
    const deliveredResources = segment.deliveredResources || {};
    const missingResources: Record<string, number> = {};

    // Обчислюємо різницю між потрібними та доставленими ресурсами
    for (const [resourceId, required] of Object.entries(requiredResources)) {
      const delivered = deliveredResources[resourceId] || 0;
      const missing = Math.max(0, required - delivered);
      
      if (missing > 0) {
        missingResources[resourceId] = missing;
      }
    }

    return missingResources;
  }
}
