import { IMapLogic } from '@interfaces/IMapLogic';
import { AuroraEffect } from '@logic/systems/environment/environment.types';

export interface UiLogicBridge {
  // Storage info for buildings (used by HUD overlays)
  getBuildingStorageInfo(
    buildingId: string
  ): Record<string, { current: number; capacity: number; percentage: number }> | null;
  getBuildingInternalStorage(buildingId: string): Record<string, { current: number; capacity: number }> | null;
  pickBuildingTransferAction(buildingId: string): { direction: 'from-building' | 'to-building'; resourceId: string } | null;
  // Pathfinding visualization
  getPathfindingVisualizationData(
    centerX: number, 
    centerZ: number, 
    radius: number, 
    droneId: string
  ): Array<{x: number, z: number, passable: boolean}> | null;
  // Roads visualization
  getRoadsVisualizationData(
    centerX: number, 
    centerZ: number, 
    radius: number
  ): Array<{x: number, z: number, isRoad: boolean, speedBonus: number}> | null;
  // Roads aggregates for HUD
  getRoadAggregates(roadId: string): {
    builtSegments: number;
    totalSegments: number;
    totalRequired: Record<string, number>;
    totalDelivered: Record<string, number>;
  } | null;
  // Environment effects
  getAuroraEffects(): AuroraEffect[];
}

export function createUiLogicBridge(mapLogic: IMapLogic): UiLogicBridge {
  return {
    getBuildingStorageInfo: (buildingId: string) => {
      const bm: any = (mapLogic as any).buildingsManager;
      if (!bm || typeof bm.getBuildingStorageInfo !== 'function') return null;
      return bm.getBuildingStorageInfo(buildingId);
    },
    getBuildingInternalStorage: (buildingId: string) => {
      const bm: any = (mapLogic as any).buildingsManager;
      const inst = bm?.getBuildingInstance?.(buildingId);
      return inst?.internalStorage || null;
    },
    pickBuildingTransferAction: (buildingId: string) => {
      const bm: any = (mapLogic as any).buildingsManager;
      const sm = bm?.storageManager || (bm?.getStorageManager?.());
      if (!sm?.pickBuildingTransferAction) return null;
      return sm.pickBuildingTransferAction(buildingId);
    },
    getPathfindingVisualizationData: (centerX: number, centerZ: number, radius: number, droneId: string) => {
      const scene: any = (mapLogic as any).scene;
      const droneObj = scene?.getObjectById?.(droneId);
      const pathfinder = scene?.pathfinder;
      if (!pathfinder?.getPassabilityVisualizationData || !droneObj) return null;
      return pathfinder.getPassabilityVisualizationData(centerX, centerZ, radius, droneObj);
    },
    getRoadsVisualizationData: (centerX: number, centerZ: number, radius: number) => {
      const scene: any = (mapLogic as any).scene;
      const pathfinder = scene?.pathfinder;
      if (!pathfinder?.getRoadsVisualizationData) return null;
      return pathfinder.getRoadsVisualizationData(centerX, centerZ, radius);
    },
    getRoadAggregates: (roadId: string) => {
      const bm: any = (mapLogic as any).buildingsManager;
      if (!bm?.getRoadAggregates) return null;
      return bm.getRoadAggregates(roadId);
    },
    getAuroraEffects: () => {
      const environment: any = (mapLogic as any).environment;
      if (!environment?.getAuroraEffects) return [];
      return environment.getAuroraEffects();
    }
  };
}


