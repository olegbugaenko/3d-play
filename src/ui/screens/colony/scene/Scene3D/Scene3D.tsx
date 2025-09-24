import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ISaveManager, IMapLogic } from '@interfaces/index';
import { CommandPanel, SegmentedConstructionPanel } from '@ui/screens/colony';
import { InteractionProvider } from '@ui/screens/colony/scene/context/InteractionContext';
import { useInteractionManager } from '@ui/screens/colony/scene/hooks/useInteractionManager';
import { useBuildingPreview } from '@ui/screens/colony/scene/hooks/useBuildingPreview';
import { useDebugInfo } from '@ui/screens/colony/scene/hooks/useDebugInfo';
import { DebugPanel } from '@ui/screens/colony/scene/components/DebugPanel';
import { VerticalMenuWithContext } from '../components/VerticalMenuWithContext';
import { DragSelection } from '../DragSelection';
import PathfindingDebug from '../debug/PathfindingDebug';
import { createUiLogicBridge } from '@ui/logic/UiLogicBridge';
import { useSceneCore, useScreenRaycaster } from '../hooks/useSceneCore';
import { useSceneManagers } from '../hooks/useSceneManagers';
import { useCameraController, useCameraViewportSync } from '../hooks/useCameraSystems';
import { ensureAreaSelectionRenderer, useTerrainStreaming } from '../hooks/useTerrainStreaming';
import { useSelectedUnits, useSelectionHighlights } from '../hooks/useSelectionState';
import { useCommandBridge } from '../hooks/useCommandBridge';
import { useSceneObjectSync } from '../hooks/useSceneSync';
import { useRenderLoop } from '../hooks/useRenderLoop';
import { SceneLoadingManager, useSceneLoadingSnapshot } from './loading/SceneLoadingManager';
import { SceneLoadingOverlay } from '../components/SceneLoadingOverlay';

interface Scene3DProps {
  saveManager: ISaveManager;
  onShowMainMenu: () => void;
  mapLogic: IMapLogic;
  game: any;
}

const Scene3D: React.FC<Scene3DProps> = ({ onShowMainMenu, mapLogic: appMapLogic, game }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const { scene, camera, renderer } = useSceneCore();
  const loadingManagerRef = useRef<SceneLoadingManager | null>(null);
  if (!loadingManagerRef.current) {
    loadingManagerRef.current = new SceneLoadingManager();
  }
  const loadingManager = loadingManagerRef.current;
  const loadingSnapshot = useSceneLoadingSnapshot(loadingManager);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [graphicsSettingsState, setGraphicsSettingsState] = useState(game.graphicsSettings.getState());
  const manualPending = Math.max(0, loadingSnapshot.manualTotal - loadingSnapshot.manualCompleted);
  const loadingMessage = loadingSnapshot.lastUrl
    ? `Завантаження: ${loadingSnapshot.lastUrl.split('/').pop()}`
    : manualPending > 0
      ? 'Генерація світу...'
      : undefined;

  const {
    rendererManagerRef,
    selectionRendererRef,
    terrainRendererRef,
    areaSelectionRendererRef,
    mapLogicRef,
    managersReady,
  } = useSceneManagers(scene, camera, renderer, appMapLogic, loadingManager, game.graphicsSettings);

  const { buildingPreviewRef, isReady: buildingPreviewReady } = useBuildingPreview(
    scene,
    appMapLogic,
    loadingManager.getLoadingManager(),
  );
  const controller = useCameraController(camera, renderer, mapLogicRef);
  const debugInfo = useDebugInfo(camera, controller, mapLogicRef, buildingPreviewRef);

  const { ensureTargetOnTerrain, updateViewport, maybeUpdateViewportOnMove } =
    useCameraViewportSync(camera, controller, mapLogicRef);

  const { updateTerrainForCamera, checkAndGenerate } =
    useTerrainStreaming(camera, terrainRendererRef, mapLogicRef);

  const { setFromClient: getRayFromScreen } = useScreenRaycaster(camera);

  const interactionManager = useInteractionManager(
    scene,
    camera,
    appMapLogic,
    managersReady ? selectionRendererRef.current : null,
    managersReady ? rendererManagerRef.current : null,
    managersReady ? areaSelectionRendererRef.current : null,
    buildingPreviewReady ? buildingPreviewRef.current : null,
  );

  useEffect(() => {
    ensureAreaSelectionRenderer(scene, areaSelectionRendererRef, mapLogicRef);
  }, [scene, areaSelectionRendererRef, mapLogicRef]);

  useSelectionHighlights(mapLogicRef, rendererManagerRef, selectionRendererRef);
  const selectedUnits = useSelectedUnits(mapLogicRef);

  const { selectedCommand, handleCommandChange } = useCommandBridge({
    camera,
    getRayFromScreen,
    areaSelectionRendererRef,
    interactionManager,
  });

  const syncVisibleObjects = useSceneObjectSync(mapLogicRef, rendererManagerRef, selectionRendererRef);

  const fps = useRenderLoop(
    scene,
    camera,
    renderer,
    controller,
    rendererManagerRef,
    {
      maybeUpdateViewportOnMove,
      checkAndGenerateTerrain: checkAndGenerate,
      syncVisibleObjects,
    },
    areaSelectionRendererRef,
    mapLogicRef,
  );

  useEffect(() => {
    if (!isSceneReady && managersReady && buildingPreviewReady && loadingManager.isDone()) {
      setIsSceneReady(true);
    }
  }, [isSceneReady, managersReady, buildingPreviewReady, loadingManager, loadingSnapshot]);

  useEffect(() => {
    return game.graphicsSettings.subscribe(setGraphicsSettingsState);
  }, [game]);

  useEffect(() => {
    if (!managersReady) return;
    const shadows = graphicsSettingsState.shadows;
    const enableDetailed = shadows === 'detailed';
    renderer.shadowMap.enabled = enableDetailed;
    if (enableDetailed) {
      renderer.shadowMap.needsUpdate = true;
    }
    const lights = (scene as THREE.Scene & {
      __lights__?: { ambient: THREE.AmbientLight; dir: THREE.DirectionalLight };
    }).__lights__;
    if (lights?.dir) {
      lights.dir.castShadow = enableDetailed;
    }
    rendererManagerRef.current?.setShadowMode(shadows);
    terrainRendererRef.current?.setShadowMode(shadows);
  }, [graphicsSettingsState.shadows, renderer, scene, rendererManagerRef, terrainRendererRef, managersReady]);

  useEffect(() => {
    if (!managersReady) return;
    rendererManagerRef.current?.setParticleQuality(graphicsSettingsState.particles);
    rendererManagerRef.current?.setDustTrailsEnabled(graphicsSettingsState.droneDustTrails);
  }, [graphicsSettingsState.particles, graphicsSettingsState.droneDustTrails, rendererManagerRef, managersReady]);

  useEffect(() => {
    const map = mapLogicRef.current;
    if (!map) return;

    updateViewport();
    ensureTargetOnTerrain();
    updateTerrainForCamera();
    ensureAreaSelectionRenderer(scene, areaSelectionRendererRef, mapLogicRef);
  }, [
    ensureTargetOnTerrain,
    mapLogicRef,
    scene,
    updateTerrainForCamera,
    updateViewport,
  ]);

  useEffect(() => {
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x888888);
    const axes = new THREE.AxesHelper(5);
    scene.add(grid, axes);
    updateViewport();
    ensureTargetOnTerrain();

    return () => {
      game.stopTicks();
      scene.remove(grid);
      scene.remove(axes);
      scene.clear();
      renderer.dispose();
    };
  }, [ensureTargetOnTerrain, renderer, scene, updateViewport, game]);

  useEffect(() => {
    if (!mountRef.current) return;
    mountRef.current.appendChild(renderer.domElement);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const delta = e.deltaY > 0 ? -1 : 1;
      const zoomSpeed = 0.2;
      const newPos = camera.position.clone().addScaledVector(dir, delta * zoomSpeed);
      const distance = newPos.distanceTo(controller.getTarget());
      if (distance >= 1 && distance <= 25) {
        camera.position.copy(newPos);
        ensureTargetOnTerrain();
        updateViewport();
      }
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      updateViewport();
      ensureTargetOnTerrain();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    renderer.domElement.addEventListener('contextmenu', preventContextMenu);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('contextmenu', preventContextMenu);
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [camera, controller, ensureTargetOnTerrain, renderer, updateViewport]);

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {!isSceneReady && (
        <SceneLoadingOverlay
          progress={loadingManager.getProgress()}
          message={loadingMessage}
          errors={loadingSnapshot.errors.length ? loadingSnapshot.errors : undefined}
        />
      )}
      {interactionManager && (
        <InteractionProvider value={interactionManager}>
          <VerticalMenuWithContext game={game} onShowMainMenu={onShowMainMenu} />

          <DebugPanel
            fps={fps}
            debugInfo={debugInfo}
            controller={controller}
            mapLogicRef={mapLogicRef}
            selectedCommand={selectedCommand}
            interactionManager={interactionManager}
          />

          <PathfindingDebug uiLogicBridge={createUiLogicBridge(mapLogicRef.current!)} />

          <CommandPanel
            selectedUnits={selectedUnits}
            onCommandChange={handleCommandChange}
            game={game}
            cameraController={controller}
            activeCommand={selectedCommand}
          />

          <SegmentedConstructionPanel />
          <DragSelection />
        </InteractionProvider>
      )}
    </div>
  );
};

export default Scene3D;
