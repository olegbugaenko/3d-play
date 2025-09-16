import { useRef, useEffect } from 'react';
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
  const interactionManagerRef = useRef<InteractionManager | null>(null);

  useEffect(() => {
    // Створюємо InteractionManager один раз
    interactionManagerRef.current = new InteractionManager();
    
    // Реєструємо хендлери тільки якщо всі залежності готові
    if (selectionRenderer && rendererManager && areaSelectionRenderer && buildingPreview) {
        const selectionHandler = new SelectionHandler(scene, camera, mapLogic, selectionRenderer, rendererManager, interactionManagerRef.current?.emit.bind(interactionManagerRef.current));
        const commandHandler = new CommandHandler(scene, camera, mapLogic, rendererManager);
        const gatherHandler = new GatherHandler(scene, camera, mapLogic, areaSelectionRenderer, interactionManagerRef.current?.emit.bind(interactionManagerRef.current));
        const buildingHandler = new BuildingHandler(scene, camera, mapLogic, buildingPreview, interactionManagerRef.current?.emit.bind(interactionManagerRef.current));
      
      interactionManagerRef.current.registerHandler('selection', selectionHandler);
      interactionManagerRef.current.registerHandler('command', commandHandler);
      interactionManagerRef.current.registerHandler('gather', gatherHandler);
      interactionManagerRef.current.registerHandler('building', buildingHandler);
    }

    return () => {
      // Cleanup при розмонтуванні
      interactionManagerRef.current?.dispose();
    };
  }, [scene, camera, mapLogic, selectionRenderer, rendererManager, areaSelectionRenderer, buildingPreview]);

  return interactionManagerRef.current;
}
