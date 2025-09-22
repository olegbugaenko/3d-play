import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { TerrainRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/TerrainRenderer';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';
import { createUiLogicBridge } from '@ui/logic/UiLogicBridge';
import { IMapLogic } from '@interfaces/index';
import { SceneLoadingManager } from '../Scene3D/loading/SceneLoadingManager';

export function useSceneManagers(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  appMapLogic: IMapLogic,
  loadingManager?: SceneLoadingManager
) {
  const rendererManagerRef = useRef<RendererManager | null>(null);
  const selectionRendererRef = useRef<SelectionRenderer | null>(null);
  const terrainRendererRef = useRef<TerrainRenderer | null>(null);
  const areaSelectionRendererRef = useRef<AreaSelectionRenderer | null>(null);
  const mapLogicRef = useRef<IMapLogic | null>(null);
  const [managersReady, setManagersReady] = useState(false);

  useEffect(() => {
    const bridge = createUiLogicBridge(appMapLogic);
    const manager = loadingManager?.getLoadingManager();
    rendererManagerRef.current = new RendererManager(scene, renderer, bridge, manager);
    mapLogicRef.current = appMapLogic;

    selectionRendererRef.current = new SelectionRenderer(
      scene,
      (id) => rendererManagerRef.current?.getMeshById(id) || null,
      (id) => mapLogicRef.current?.scene.getObjectById(id) || null
    );

    const tm = mapLogicRef.current.scene.getTerrainManager();
    if (tm) {
      terrainRendererRef.current = new TerrainRenderer(scene, tm, manager);
      const initialRender = terrainRendererRef.current
        .renderTerrain({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        })
        .catch((e) => console.error('Failed to render initial terrain:', e));

      loadingManager?.trackPromise(initialRender);
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
  }, [scene, camera, renderer, appMapLogic, loadingManager]);

  return {
    rendererManagerRef,
    selectionRendererRef,
    terrainRendererRef,
    areaSelectionRendererRef,
    mapLogicRef,
    managersReady,
  };
}
