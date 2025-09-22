import { Vector3 } from 'three';
import { CommandGroupContext } from '../command-group.types';
import { TSceneObject } from '@scene/scene.types';

export class ParameterResolverToolkit {
  constructor(private readonly mapLogic: any) {}

  getObjectPosition(objectId: string): Vector3 | null {
    const obj = this.mapLogic?.scene?.getObjectById(objectId);
    if (!obj || !obj.coordinates) {
      return null;
    }

    return new Vector3(
      obj.coordinates.x,
      obj.coordinates.y + (obj.bottomAnchor || 0),
      obj.coordinates.z
    );
  }

  getClosestObjectByTag(
    tag: string,
    fromPosition: Vector3,
    maxDistance: number = 1000,
    filter?: (obj: TSceneObject) => boolean
  ): any {
    const objects = this.mapLogic?.scene?.getObjectsByTag(tag) ?? {};
    let closestObject: TSceneObject | null = null;
    let closestDistance = maxDistance;

    for (const obj of Object.values<TSceneObject>(objects)) {
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

  getClosestObjectByCommandType(commandType: string, fromPosition: Vector3, maxDistance: number = 1000): any {
    const objectsInRadius = this.mapLogic?.scene?.getObjectsInRadius?.(
      { x: fromPosition.x, y: fromPosition.y, z: fromPosition.z },
      maxDistance
    ) ?? [];

    let closestObject: any = null;
    let closestDistance = maxDistance;

    for (const obj of objectsInRadius) {
      if (obj.commandType && obj.commandType.includes(commandType)) {
        const objPos = new Vector3(obj.coordinates.x, obj.coordinates.y, obj.coordinates.z);
        const baseDistance = fromPosition.distanceTo(objPos);
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

  getCurrentObjectPosition(objectId: string): Vector3 | null {
    return this.getObjectPosition(objectId);
  }

  getClosestStorage(fromPosition: Vector3, maxDistance: number = 1000): any {
    return this.getClosestObjectByTag('storage', fromPosition, maxDistance, obj => obj.data?.isBuilt !== false);
  }

  getClosestUnloadTarget(fromPosition: Vector3, maxDistance: number = 1000): any {
    return this.getClosestObjectByCommandType('unload-resources', fromPosition, maxDistance);
  }

  getClosestChargingStation(fromPosition: Vector3, maxDistance: number = 1000): any {
    return this.getClosestObjectByTag('charge', fromPosition, maxDistance, obj => obj.data?.isBuilt !== false);
  }

  getResourcesInRadius(tag: string, center: { x: number; y: number; z: number }, radius: number): any[] {
    const allResources = this.mapLogic?.scene?.getObjectsByTagInRadius?.('resource', center, radius) ?? [];

    const filteredResources = allResources.filter((one: TSceneObject) => {
      if (tag !== 'resource' && one.data?.resourceId !== tag) {
        return false;
      }

      const resourceId = one.data?.resourceId;
      if (!resourceId) {
        return false;
      }

      const resourceManager = this.mapLogic?.resources;
      if (!resourceManager) {
        return true;
      }

      return resourceManager.isUnlocked(resourceId);
    });

    return filteredResources.map((one: TSceneObject) => one.id);
  }

  getResourceType(resourceType: string): string {
    return resourceType;
  }

  getFirstOfList(list: any[]): any {
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }
    return list[0];
  }

  sortObjectsByDistanceToDrone(objectIds: string[], dronePosition: Vector3): string[] {
    if (!Array.isArray(objectIds) || objectIds.length === 0) {
      return [];
    }

    const objects = objectIds
      .map(id => this.mapLogic?.scene?.getObjectById(id))
      .filter(obj => obj !== undefined && obj !== null);

    const sortedObjects = objects.sort((a, b) => {
      const posA = new Vector3(a!.coordinates.x, a!.coordinates.y, a!.coordinates.z);
      const posB = new Vector3(b!.coordinates.x, b!.coordinates.y, b!.coordinates.z);

      const distanceA = dronePosition.distanceTo(posA);
      const distanceB = dronePosition.distanceTo(posB);

      return distanceA - distanceB;
    });

    return sortedObjects.map(obj => obj!.id);
  }

  getObjectAccessPoint(objectId: string, droneId: string): Vector3 | null {
    const targetObject = this.mapLogic?.scene?.getObjectById(objectId);
    const droneObject = this.mapLogic?.scene?.getObjectById(droneId);

    if (!targetObject || !droneObject) {
      return null;
    }

    const pathfindingSystem = this.mapLogic?.scene?.pathfinder;
    if (!pathfindingSystem?.findDockingPointToStatic) {
      return null;
    }

    try {
      const dockingPoint = pathfindingSystem.findDockingPointToStatic(
        droneObject,
        targetObject,
        0.05,
        true
      );

      if (dockingPoint) {
        return new Vector3(dockingPoint.x, dockingPoint.y, dockingPoint.z);
      }
      return null;
    } catch (error) {
      console.warn('Error finding docking point:', error);
      return null;
    }
  }

  getBuildingInstance(buildingId: string): any {
    const buildingsManager = this.mapLogic?.buildingsManager;
    if (!buildingsManager?.getBuildingInstance) {
      console.error('[ParameterResolverToolkit] BuildingsManager not found');
      return null;
    }

    const buildingInstance = buildingsManager.getBuildingInstance(buildingId);
    if (!buildingInstance) {
      console.error(`[ParameterResolverToolkit] Building instance not found: ${buildingId}`);
      return null;
    }

    return buildingInstance;
  }

  getBuildingRequiredResources(buildingId: string): Record<string, number> {
    const buildingInstance = this.getBuildingInstance(buildingId);
    if (!buildingInstance) {
      return {};
    }

    const buildingsManager = this.mapLogic?.buildingsManager;
    if (!buildingsManager?.getBuildingInstance) {
      return {};
    }

    try {
      const buildingType = buildingsManager.getBuildingType(buildingInstance.typeId);
      if (!buildingType?.cost) {
        throw new Error(`No cost formula found for building ${buildingInstance.typeId}`);
      }

      const costs = buildingType.cost(1);
      if (!costs) {
        throw new Error(`Cost formula returned null for building ${buildingInstance.typeId} level 1`);
      }

      const requiredResources: Record<string, number> = {};
      for (const [resourceId, amount] of Object.entries(costs)) {
        if (typeof amount === 'number' && amount > 0) {
          requiredResources[resourceId] = amount;
        }
      }

      return requiredResources;
    } catch (error) {
      console.error(`[ParameterResolverToolkit] Error getting required resources for ${buildingId}:`, error);
      return {};
    }
  }

  getMissingResources(buildingId: string): Record<string, number> {
    const buildingInstance = this.getBuildingInstance(buildingId);
    const requiredResources = this.getBuildingRequiredResources(buildingId);

    if (!buildingInstance || Object.keys(requiredResources).length === 0) {
      return {};
    }

    const collectedResources = buildingInstance.resourcesCollected || {};
    const missingResources: Record<string, number> = {};

    for (const [resourceId, required] of Object.entries(requiredResources)) {
      const collected = collectedResources[resourceId] || 0;
      const missing = Math.max(0, required - collected);

      if (missing > 0) {
        missingResources[resourceId] = missing;
      }
    }

    return missingResources;
  }

  checkHasMissingResources(buildingId: string): boolean {
    const missingResources = this.getMissingResources(buildingId);
    return Object.values(missingResources).some(amount => amount > 0);
  }

  getValuesSum(values: Record<string, any>): number {
    if (!values || typeof values !== 'object') {
      console.warn('[ParameterResolverToolkit] getValuesSum: invalid input:', values);
      return 0;
    }

    return Object.values(values).reduce((total, val) => {
      const numVal = typeof val === 'number' ? val : 0;
      return total + numVal;
    }, 0);
  }

  getUnnecessaryResources(objectId: string, requiredResources: Record<string, number>): Record<string, number> {
    const object = this.mapLogic?.scene?.getObjectById(objectId);
    if (!object || !object.data?.storage) {
      return {};
    }

    const storage = object.data.storage as Record<string, number>;
    const unnecessaryResources: Record<string, number> = {};

    for (const [resourceId, currentAmount] of Object.entries(storage)) {
      if (currentAmount > 0) {
        const requiredAmount = requiredResources[resourceId] || 0;

        if (requiredAmount === 0) {
          unnecessaryResources[resourceId] = currentAmount;
        } else if (currentAmount > requiredAmount) {
          unnecessaryResources[resourceId] = currentAmount - requiredAmount;
        }
      }
    }

    return unnecessaryResources;
  }

  planBuildingTransfer(buildingId: string, objectId: string): any {
    const bm = this.mapLogic?.buildingsManager as any;
    if (!bm) {
      return null;
    }
    const sm = bm.storageManager || bm.getStorageManager?.();
    if (!sm?.pickBuildingTransferAction) {
      return null;
    }

    const plan = sm.pickBuildingTransferAction(buildingId);
    if (!plan) {
      return null;
    }

    const dronePos = this.getCurrentObjectPosition(objectId) || new Vector3(0, 0, 0);
    const buildingAccess = this.getObjectAccessPoint(buildingId, objectId);
    const closestStorageId = this.getClosestStorage(dronePos, 200);
    const storageAccess = closestStorageId ? this.getObjectAccessPoint(closestStorageId, objectId) : null;

    const toFiniteNumber = (value: any): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const toPositiveNumber = (value: any): number => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      return Math.max(0, numeric);
    };

    const normalizeResourceMap = (input: Record<string, number>): Record<string, number> => {
      const normalized: Record<string, number> = {};
      for (const [resourceId, rawValue] of Object.entries(input)) {
        const positive = toPositiveNumber(rawValue);
        if (positive > 0) {
          normalized[resourceId] = positive;
        }
      }
      return normalized;
    };

    const inst = bm.getBuildingInstance?.(buildingId);
    const storageInfo = inst?.internalStorage?.[plan.resourceId];
    const drone = this.mapLogic?.scene?.getObjectById(objectId);
    const droneStorageRecord = (drone?.data?.storage ?? {}) as Record<string, number>;
    const droneStorageValues = Object.values(droneStorageRecord);
    const droneLoad = droneStorageValues.reduce((sum, val) => sum + toPositiveNumber(val), 0);
    const droneMaxCapacity = drone?.data?.maxCapacity || 5;
    const droneFree = Math.max(0, droneMaxCapacity - droneLoad);

    let amount = 0;
    if (plan.direction === 'from-building') {
      amount = Math.min(droneFree, storageInfo?.current || 0);
    } else {
      const missing = Math.max(0, (storageInfo?.capacity || 0) - (storageInfo?.current || 0));
      amount = Math.min(missing, droneFree || 5);
    }

    const resourceManager: any = this.mapLogic?.resources;
    if (plan.direction === 'from-building') {
      const capacityValue = toFiniteNumber(resourceManager?.getResourceCapacity?.(plan.resourceId as any));
      const currentValue = toFiniteNumber(resourceManager?.getResourceAmount?.(plan.resourceId as any)) ?? 0;

      if (capacityValue !== null) {
        const freeCapacity = Math.max(0, capacityValue - Math.max(0, currentValue));
        amount = Math.min(amount, freeCapacity);
      }
    }

    const positiveAmount = Math.max(0, amount);
    const loadResourcesRaw: Record<string, number> = {};
    if (positiveAmount > 0) {
      loadResourcesRaw[plan.resourceId] = positiveAmount;
    }

    const droneResourceAmount = toPositiveNumber(droneStorageRecord[plan.resourceId]);
    const unloadResourcesRaw: Record<string, number> = {};

    if (plan.direction === 'from-building') {
      const expectedAfterLoad = Math.min(droneMaxCapacity, droneResourceAmount + positiveAmount);
      if (expectedAfterLoad > 0) {
        unloadResourcesRaw[plan.resourceId] = expectedAfterLoad;
      }

      for (const [resourceId, storedAmount] of Object.entries(droneStorageRecord)) {
        const positiveStored = toPositiveNumber(storedAmount);
        if (positiveStored <= 0) {
          continue;
        }

        if (resourceId === plan.resourceId) {
          unloadResourcesRaw[resourceId] = Math.max(unloadResourcesRaw[resourceId] ?? 0, positiveStored);
        } else {
          unloadResourcesRaw[resourceId] = positiveStored;
        }
      }
    } else if (droneResourceAmount > 0) {
      unloadResourcesRaw[plan.resourceId] = droneResourceAmount;
    }

    const loadResourcesMap = normalizeResourceMap(loadResourcesRaw);
    const unloadResourcesMap = normalizeResourceMap(unloadResourcesRaw);

    let hasStorageCapacity = true;
    if (plan.direction === 'from-building' && Object.keys(unloadResourcesMap).length > 0) {
      hasStorageCapacity = Object.keys(unloadResourcesMap).some(resourceId => {
        const capacityValue = toFiniteNumber(resourceManager?.getResourceCapacity?.(resourceId as any));
        if (capacityValue === null) {
          return true;
        }
        const currentValue = toFiniteNumber(resourceManager?.getResourceAmount?.(resourceId as any)) ?? 0;
        return capacityValue - Math.max(0, currentValue) > 0;
      });
    }

    return {
      ...plan,
      amount: positiveAmount,
      buildingAccessPoint: buildingAccess,
      closestStorageId,
      storageAccessPoint: storageAccess,
      resources: loadResourcesMap,
      resourcesToUnload: unloadResourcesMap,
      hasStorageCapacity
    };
  }

  getRoadInstance(roadId: string): any {
    const buildingsManager = this.mapLogic?.buildingsManager;
    if (!buildingsManager?.getRoadInfo) {
      console.error('[ParameterResolverToolkit] BuildingsManager not found');
      return null;
    }

    const roadInstance = buildingsManager.getRoadInfo(roadId);
    if (!roadInstance) {
      console.error(`[ParameterResolverToolkit] Road instance not found: ${roadId}`);
      return null;
    }

    return roadInstance;
  }

  getNextUnbuiltRoadSegment(roadId: string): any {
    const roadInstance = this.getRoadInstance(roadId);
    if (!roadInstance?.segments) {
      return null;
    }

    const unbuiltIndex = roadInstance.segments.findIndex((s: any) => s.buildingState !== 'completed');
    if (unbuiltIndex === -1) {
      return null;
    }

    return {
      id: `${roadId}-segment-${unbuiltIndex}`,
      index: unbuiltIndex,
      segment: roadInstance.segments[unbuiltIndex]
    };
  }

  getRoadSegmentRequiredResources(roadId: string, segmentIndex: number): Record<string, number> {
    const buildingsManager = this.mapLogic?.buildingsManager;
    if (!buildingsManager?.calculateRoadCost) {
      return {};
    }

    return buildingsManager.calculateRoadCost(roadId, segmentIndex);
  }

  getRoadSegmentPosition(roadId: string, segmentIndex: number): Vector3 | null {
    const roadInstance = this.getRoadInstance(roadId);
    if (!roadInstance?.segments || !roadInstance.segments[segmentIndex]) {
      return null;
    }

    const segment = roadInstance.segments[segmentIndex];

    if (segment.startPoint && segment.endPoint) {
      const centerX = (segment.startPoint.x + segment.endPoint.x) / 2;
      const centerY = (segment.startPoint.y + segment.endPoint.y) / 2;
      const centerZ = (segment.startPoint.z + segment.endPoint.z) / 2;

      return new Vector3(centerX, centerY, centerZ);
    }

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

  getMissingResourcesForRoadSegment(roadId: string, segmentIndex: number): Record<string, number> {
    const requiredResources = this.getRoadSegmentRequiredResources(roadId, segmentIndex);
    const roadInstance = this.getRoadInstance(roadId);

    if (!roadInstance?.segments || !roadInstance.segments[segmentIndex]) {
      return {};
    }

    const segment = roadInstance.segments[segmentIndex];
    const deliveredResources = segment.deliveredResources || {};
    const missingResources: Record<string, number> = {};

    for (const [resourceId, required] of Object.entries(requiredResources)) {
      const delivered = deliveredResources[resourceId] || 0;
      const missing = Math.max(0, required - delivered);

      if (missing > 0) {
        missingResources[resourceId] = missing;
      }
    }

    return missingResources;
  }

  getFromPosition(context: CommandGroupContext): Vector3 {
    const currentPos = this.getCurrentObjectPosition(context.objectId);
    if (currentPos) {
      return currentPos;
    }

    if (context.targets?.base) {
      return new Vector3(context.targets.base.x, context.targets.base.y, context.targets.base.z);
    }

    return new Vector3(0, 0, 0);
  }
}
