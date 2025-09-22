import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { TerrainRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/TerrainRenderer';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';
import { createUiLogicBridge } from '@ui/logic/UiLogicBridge';
import { IMapLogic } from '@interfaces/index';

export function useSceneManagers(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  appMapLogic: IMapLogic
) {
  const rendererManagerRef = useRef<RendererManager | null>(null);
  const selectionRendererRef = useRef<SelectionRenderer | null>(null);
  const terrainRendererRef = useRef<TerrainRenderer | null>(null);
  const areaSelectionRendererRef = useRef<AreaSelectionRenderer | null>(null);
  const mapLogicRef = useRef<IMapLogic | null>(null);
  const [managersReady, setManagersReady] = useState(false);

  useEffect(() => {
    const bridge = createUiLogicBridge(appMapLogic);
    rendererManagerRef.current = new RendererManager(scene, renderer, bridge);
    mapLogicRef.current = appMapLogic;

    selectionRendererRef.current = new SelectionRenderer(
      scene,
      (id) => rendererManagerRef.current?.getMeshById(id) || null,
      (id) => mapLogicRef.current?.scene.getObjectById(id) || null
    );

    const tm = mapLogicRef.current.scene.getTerrainManager();
    if (tm) {
      terrainRendererRef.current = new TerrainRenderer(scene, tm);
      terrainRendererRef.current
        .renderTerrain({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        })
        .catch((e) => console.error('Failed to render initial terrain:', e));
    }

    setManagersReady(true);

    return () => {
      selectionRendererRef.current?.clearAll();
      rendererManagerRef.current?.dispose();
      terrainRendererRef.current?.dispose();

      if (tm) {
        areaSelectionRendererRef.current?.dispose();
      }

      setManagersReady(false);
    };
  }, [scene, camera, renderer, appMapLogic]);

  return {
    rendererManagerRef,
    selectionRendererRef,
    terrainRendererRef,
    areaSelectionRendererRef,
    mapLogicRef,
    managersReady,
  };
}
