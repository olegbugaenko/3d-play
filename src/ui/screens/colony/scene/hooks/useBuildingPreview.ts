import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { BuildingPreview } from '@ui/screens/colony/scene/renderers/BuildingPreview';
import { IMapLogic } from '@interfaces/index';

export function useBuildingPreview(scene: THREE.Scene, mapLogic: IMapLogic, loadingManager?: THREE.LoadingManager) {
  const buildingPreviewRef = useRef<BuildingPreview | null>(null);
  const mapLogicRef = useRef(mapLogic);
  const [isReady, setIsReady] = useState(false);

  // Оновлюємо ref коли mapLogic змінюється
  useEffect(() => {
    mapLogicRef.current = mapLogic;
  }, [mapLogic]);

  useEffect(() => {
    // Створюємо BuildingPreview
    buildingPreviewRef.current = new BuildingPreview(scene, loadingManager);

    // Попередньо завантажуємо моделі будівель
    const buildingTypes = Array.from(mapLogicRef.current.buildingsManager.getAllBuildingTypes().values());
    buildingPreviewRef.current.preloadModels(buildingTypes);
    setIsReady(true);

    return () => {
      buildingPreviewRef.current?.dispose();
      buildingPreviewRef.current = null;
      setIsReady(false);
    };
  }, [scene, loadingManager]); // Видалили mapLogic з залежностей, використовуємо ref

  return { buildingPreviewRef, isReady };
}
