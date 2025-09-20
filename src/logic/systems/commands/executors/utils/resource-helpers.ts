import { CommandContext } from '../../command.types';

export type ResourceMap = Record<string, number>;

const EPSILON = 1e-8;

export function ensureDroneStorage(drone: any): ResourceMap {
    if (!drone.data) {
        drone.data = {};
    }

    if (!drone.data.storage) {
        drone.data.storage = {};
    }

    return drone.data.storage as ResourceMap;
}

export function getStorageTotal(storage: ResourceMap): number {
    return Object.values(storage).reduce((sum, value) => sum + value, 0);
}

export function getDroneCapacity(drone: any): number {
    return drone.data?.maxCapacity ?? 0;
}

export function getDroneFreeCapacity(drone: any): number {
    const maxCapacity = getDroneCapacity(drone);
    if (!maxCapacity) {
        return 0;
    }

    const storage = ensureDroneStorage(drone);
    return Math.max(0, maxCapacity - getStorageTotal(storage));
}

export function withdrawFromDrone(storage: ResourceMap, resourceId: string, amount: number): number {
    if (amount <= 0) return 0;

    const current = storage[resourceId] || 0;
    const taken = Math.min(current, amount);
    if (taken > 0) {
        storage[resourceId] = current - taken;
    }
    return taken;
}

export function depositToDrone(drone: any, resourceId: string, amount: number): number {
    if (amount <= 0) return 0;

    const storage = ensureDroneStorage(drone);
    const maxCapacity = getDroneCapacity(drone);
    if (!maxCapacity) return 0;

    const total = getStorageTotal(storage);
    const free = Math.max(0, maxCapacity - total);
    const accepted = Math.min(free, amount);
    if (accepted > 0) {
        storage[resourceId] = (storage[resourceId] || 0) + accepted;
    }
    return accepted;
}

export function withdrawFromGlobalStorage(
    context: CommandContext,
    resourceId: string,
    amount: number,
    reason: string
): number {
    if (amount <= 0) return 0;
    const resourceManager = context.mapLogic?.resources;
    if (!resourceManager) return 0;

    const available = resourceManager.getResourceAmount(resourceId as any);
    const take = Math.min(available, amount);
    if (take <= 0) return 0;

    const success = resourceManager.spendResources([
        { resourceId: resourceId as any, amount: take, reason }
    ]);

    return success ? take : 0;
}

export function depositToGlobalStorage(
    context: CommandContext,
    resourceId: string,
    amount: number,
    reason: string
): number {
    if (amount <= 0) return 0;
    const resourceManager = context.mapLogic?.resources;
    if (!resourceManager) return 0;

    const current = resourceManager.getResourceAmount(resourceId as any);
    const capacity = resourceManager.getResourceCapacity(resourceId as any);
    const space = Math.max(0, capacity - current);
    const deposit = Math.min(space, amount);
    if (deposit <= 0) return 0;

    resourceManager.addResources([
        { resourceId: resourceId as any, amount: deposit, reason }
    ]);

    return deposit;
}

export function getGlobalFreeCapacity(context: CommandContext, resourceId: string): number {
    const resourceManager = context.mapLogic?.resources;
    if (!resourceManager) return 0;

    const current = resourceManager.getResourceAmount(resourceId as any);
    const capacity = resourceManager.getResourceCapacity(resourceId as any);
    return Math.max(0, capacity - current);
}

export function isGlobalStorageFull(context: CommandContext, resourceId: string, tolerance: number = 0): boolean {
    return getGlobalFreeCapacity(context, resourceId) <= tolerance;
}

export function hasAnyRequiredInGlobalStorage(
    context: CommandContext,
    required: ResourceMap,
    alreadyLoaded: ResourceMap = {}
): boolean {
    const resourceManager = context.mapLogic?.resources;
    if (!resourceManager) return false;

    for (const [resourceId, amount] of Object.entries(required)) {
        const needed = Math.max(0, Number(amount) - (alreadyLoaded[resourceId] || 0));
        if (needed <= EPSILON) {
            continue;
        }

        if (resourceManager.getResourceAmount(resourceId as any) > EPSILON) {
            return true;
        }
    }

    return false;
}

export function withdrawFromInternalStorage(
    context: CommandContext,
    buildingId: string,
    resourceId: string,
    amount: number
): number {
    if (amount <= 0) return 0;
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return 0;

    const instance = buildingsManager.getBuildingInstance?.(buildingId);
    const bucket = instance?.internalStorage?.[resourceId];
    if (!bucket) return 0;

    const current = bucket.current || 0;
    const taken = Math.min(current, amount);
    if (taken > 0) {
        bucket.current = Math.max(0, current - taken);
        context.scene.markObjectDirty?.(buildingId);
    }

    return taken;
}

export function depositToInternalStorage(
    context: CommandContext,
    buildingId: string,
    resourceId: string,
    amount: number
): number {
    if (amount <= 0) return 0;
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return 0;

    const instance = buildingsManager.getBuildingInstance?.(buildingId);
    const bucket = instance?.internalStorage?.[resourceId];
    if (!bucket) return 0;

    const current = bucket.current || 0;
    const capacity = bucket.capacity ?? current;
    const free = Math.max(0, capacity - current);
    const accepted = Math.min(free, amount);

    if (accepted > 0) {
        bucket.current = current + accepted;
        context.scene.markObjectDirty?.(buildingId);
    }

    return accepted;
}

export function hasAnyRequiredInInternalStorage(
    context: CommandContext,
    buildingId: string,
    required: ResourceMap,
    alreadyLoaded: ResourceMap = {}
): boolean {
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return false;

    const instance = buildingsManager.getBuildingInstance?.(buildingId);
    const storage = instance?.internalStorage;
    if (!storage) return false;

    return Object.entries(required).some(([resourceId, amount]) => {
        const needed = Math.max(0, Number(amount) - (alreadyLoaded[resourceId] || 0));
        if (needed <= EPSILON) {
            return false;
        }

        return (storage[resourceId]?.current || 0) > EPSILON;
    });
}

export function depositToConstruction(
    context: CommandContext,
    buildingId: string,
    resourceId: string,
    amount: number
): number {
    if (amount <= 0) return 0;
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return 0;

    const instance = buildingsManager.getBuildingInstance(buildingId);
    if (!instance) return 0;

    const buildingType = buildingsManager.getBuildingType(instance.typeId);
    if (!buildingType) return 0;

    const requiredResources = buildingType.cost(1) || {};
    const required = Number(requiredResources[resourceId]) || 0;
    if (required <= 0) return 0;

    const collected = instance.resourcesCollected?.[resourceId] || 0;
    const stillNeeded = Math.max(0, required - collected);
    const accepted = Math.min(stillNeeded, amount);
    if (accepted <= 0) return 0;

    const updatedResources = { ...(instance.resourcesCollected || {}) };
    updatedResources[resourceId] = collected + accepted;

    buildingsManager.updateConstructionProgress(
        buildingId,
        instance.constructionProgress ?? 0,
        updatedResources
    );

    return accepted;
}

export function hasConstructionResources(
    context: CommandContext,
    buildingId: string
): boolean {
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return false;

    const instance = buildingsManager.getBuildingInstance(buildingId);
    if (!instance) return false;

    const buildingType = buildingsManager.getBuildingType(instance.typeId);
    if (!buildingType) return false;

    const requiredResources = buildingType.cost(1) || {};

    return Object.entries(requiredResources).every(([resourceId, amount]) => {
        const collected = instance.resourcesCollected?.[resourceId] || 0;
        return collected + EPSILON >= Number(amount);
    });
}

export function depositToRoadSegment(
    context: CommandContext,
    roadId: string,
    segmentIndex: number,
    resourceId: string,
    amount: number
): number {
    if (amount <= 0) return 0;
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return 0;

    const road = buildingsManager.getRoadInfo(roadId);
    if (!road || !road.segments || segmentIndex < 0 || segmentIndex >= road.segments.length) {
        return 0;
    }

    const segment = road.segments[segmentIndex];
    if (!segment || segment.buildingState === 'completed') {
        return 0;
    }

    if (!segment.deliveredResources) {
        segment.deliveredResources = {};
    }

    const requiredResources = buildingsManager.calculateRoadCost(roadId, segmentIndex) || {};
    const required = Number(requiredResources[resourceId]) || 0;
    if (required <= 0) return 0;

    const delivered = segment.deliveredResources[resourceId] || 0;
    const stillNeeded = Math.max(0, required - delivered);
    const accepted = Math.min(stillNeeded, amount);
    if (accepted <= 0) return 0;

    segment.deliveredResources[resourceId] = delivered + accepted;

    if (!road.resourcesDelivered) {
        road.resourcesDelivered = {};
    }
    road.resourcesDelivered[resourceId] = (road.resourcesDelivered[resourceId] || 0) + accepted;

    const roadObject = context.scene.getObjectById(roadId);
    if (roadObject?.data) {
        roadObject.data.segmentStates = road.segments;
        context.scene.markObjectDirty?.(roadId);
    }

    return accepted;
}

export function isRoadSegmentSatisfied(
    context: CommandContext,
    roadId: string,
    segmentIndex: number
): boolean {
    const buildingsManager: any = context.mapLogic?.buildingsManager;
    if (!buildingsManager) return true;

    const road = buildingsManager.getRoadInfo(roadId);
    if (!road || !road.segments || segmentIndex < 0 || segmentIndex >= road.segments.length) {
        return true;
    }

    const segment = road.segments[segmentIndex];
    if (!segment) return true;

    if (segment.buildingState === 'completed') {
        return true;
    }

    const requiredResources = buildingsManager.calculateRoadCost(roadId, segmentIndex) || {};
    const deliveredResources = segment.deliveredResources || {};

    return Object.entries(requiredResources).every(([resourceId, amount]) => {
        const delivered = deliveredResources[resourceId] || 0;
        return delivered + EPSILON >= Number(amount);
    });
}

export function calculateLoadProgress(
    storage: ResourceMap,
    requiredResources: ResourceMap
): number {
    let totalRequired = 0;
    let totalLoaded = 0;

    for (const [resourceId, amount] of Object.entries(requiredResources)) {
        const required = Number(amount) || 0;
        totalRequired += required;
        totalLoaded += Math.min(storage[resourceId] || 0, required);
    }

    if (totalRequired <= EPSILON) {
        return 1;
    }

    return Math.min(1, totalLoaded / totalRequired);
}

export function calculateUnloadProgress(storage: ResourceMap, capacity: number): number {
    if (capacity <= 0) {
        return storage && getStorageTotal(storage) <= EPSILON ? 1 : 0;
    }

    const totalStored = getStorageTotal(storage);
    if (totalStored <= EPSILON) {
        return 1;
    }

    return Math.max(0, 1 - Math.min(1, totalStored / capacity));
}
