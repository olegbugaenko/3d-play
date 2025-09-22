import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { CameraController } from '@ui/screens/colony/scene/CameraController';
import { IMapLogic } from '@interfaces/index';
import { BuildingPreview } from '@ui/screens/colony/scene/renderers/BuildingPreview';

interface DebugInfo {
  visibleObjectsCount: number;
  totalObjectsCount: number;
  viewportData: { centerX: number; centerY: number; width: number; height: number };
  gridInfo: { totalCells: number; visibleCells: number };
  currentDistance: number;
  buildingModelsLoaded: number;
  buildingModelsTotal: number;
}

export function useDebugInfo(
  camera: THREE.PerspectiveCamera,
  controller: CameraController,
  mapLogicRef: React.MutableRefObject<IMapLogic | null>,
  buildingPreviewRef: React.MutableRefObject<BuildingPreview | null>
) {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    visibleObjectsCount: 0,
    totalObjectsCount: 0,
    viewportData: { centerX: 0, centerY: 0, width: 0, height: 0 },
    gridInfo: { totalCells: 0, visibleCells: 0 },
    currentDistance: 0,
    buildingModelsLoaded: 0,
    buildingModelsTotal: 0
  });

  useEffect(() => {
    let id: number;
    
    const updateUI = () => {
      const map = mapLogicRef.current;
      if (map) {
        try {
          const objects = map.scene.getVisibleObjects();
          const newVisibleCount = objects.length;
          const newTotalCount = map.scene.getTotalObjectsCount();
          
          const newDistance = Math.round(camera.position.distanceTo(controller.getTarget()) * 100) / 100;
          
          const sceneLogic = map.scene;
          const vp = (sceneLogic as { viewPort?: { centerX: number; centerY: number; width: number; height: number } })?.viewPort;
          
          let newViewportData = { centerX: 0, centerY: 0, width: 0, height: 0 };
          if (vp) {
            const newCenterX = Math.round(vp.centerX * 100) / 100;
            const newCenterY = Math.round(vp.centerY * 100) / 100;
            const newWidth = Math.round(vp.width * 100) / 100;
            const newHeight = Math.round(vp.height * 100) / 100;
            
            newViewportData = { 
              centerX: newCenterX, 
              centerY: newCenterY, 
              width: newWidth, 
              height: newHeight 
            };
          }
          
          const gridSystem = (sceneLogic as { gridSystem?: { grid: { size: number } } })?.gridSystem;
          let newGridInfo = { totalCells: 0, visibleCells: 0 };
          if (gridSystem) {
            const newTotalCells = gridSystem.grid.size;
            const newVisibleCells = (sceneLogic as unknown as { getVisibleGridCellsCount: () => number }).getVisibleGridCellsCount();
            
            newGridInfo = { 
              totalCells: newTotalCells, 
              visibleCells: newVisibleCells 
            };
          }

          // Отримуємо інформацію про завантаження моделей будівель
          const buildingLoadingState = buildingPreviewRef.current?.getLoadingState() || { loaded: 0, total: 0 };

          setDebugInfo(prev => {
            // Перевіряємо чи щось дійсно змінилось перед оновленням
            const viewportChanged = 
              prev.viewportData.centerX !== newViewportData.centerX ||
              prev.viewportData.centerY !== newViewportData.centerY ||
              prev.viewportData.width !== newViewportData.width ||
              prev.viewportData.height !== newViewportData.height;
              
            const gridChanged = 
              prev.gridInfo.totalCells !== newGridInfo.totalCells ||
              prev.gridInfo.visibleCells !== newGridInfo.visibleCells;
              
            const buildingModelsChanged = 
              prev.buildingModelsLoaded !== buildingLoadingState.loaded ||
              prev.buildingModelsTotal !== buildingLoadingState.total;

            if (prev.visibleObjectsCount === newVisibleCount &&
                prev.totalObjectsCount === newTotalCount &&
                prev.currentDistance === newDistance &&
                !viewportChanged &&
                !gridChanged &&
                !buildingModelsChanged) {
              return prev; // Нічого не змінилось, повертаємо попереднє значення
            }

            return {
              visibleObjectsCount: newVisibleCount,
              totalObjectsCount: newTotalCount,
              viewportData: newViewportData,
              gridInfo: newGridInfo,
              currentDistance: newDistance,
              buildingModelsLoaded: buildingLoadingState.loaded,
              buildingModelsTotal: buildingLoadingState.total
            };
          });
        } catch {}
      }
      
      id = window.setTimeout(updateUI, 250);
    };
    
    updateUI();
    return () => window.clearTimeout(id);
  }, [camera, controller, mapLogicRef, buildingPreviewRef]); // Прибрали debugInfo з залежностей

  return debugInfo;
}
