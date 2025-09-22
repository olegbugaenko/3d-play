import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { InteractionManager } from '../interaction/InteractionManager';
import { SelectionHandler } from '../interaction/handlers/SelectionHandler';
import { CommandHandler } from '../interaction/handlers/CommandHandler';
import { GatherHandler } from '../interaction/handlers/GatherHandler';
import { BuildingHandler } from '../interaction/handlers/BuildingHandler';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';
import { BuildingPreview } from '@ui/screens/colony/scene/renderers/BuildingPreview';
import { IMapLogic } from '@interfaces/index';

export function useInteractionManager(
  scene: THREE.Scene, 
  camera: THREE.Camera, 
  mapLogic: IMapLogic,
  selectionRenderer: SelectionRenderer | null,
  rendererManager: RendererManager | null,
  areaSelectionRenderer: AreaSelectionRenderer | null,
  buildingPreview: BuildingPreview | null
) {
  const [manager, setManager] = useState<InteractionManager | null>(null);

  useEffect(() => {
    if (!selectionRenderer || !rendererManager || !areaSelectionRenderer || !buildingPreview) {
      return undefined;
    }

    const interactionManager = new InteractionManager();

    const emit = interactionManager.emit.bind(interactionManager);
    const selectionHandler = new SelectionHandler(scene, camera, mapLogic, selectionRenderer, rendererManager, emit);
    const commandHandler = new CommandHandler(scene, camera, mapLogic, rendererManager);
    const gatherHandler = new GatherHandler(scene, camera, mapLogic, areaSelectionRenderer, emit);
    const buildingHandler = new BuildingHandler(scene, camera, mapLogic, buildingPreview, emit);

    interactionManager.registerHandler('selection', selectionHandler);
    interactionManager.registerHandler('command', commandHandler);
    interactionManager.registerHandler('gather', gatherHandler);
    interactionManager.registerHandler('building', buildingHandler);

    setManager(interactionManager);

    return () => {
      interactionManager.dispose();
      setManager(null);
    };
  }, [
    areaSelectionRenderer,
    buildingPreview,
    camera,
    mapLogic,
    rendererManager,
    scene,
    selectionRenderer,
  ]);

  return manager;
}
