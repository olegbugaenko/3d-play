import { MutableRefObject, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { CommandGroup } from '@systems/commands';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';
import { InteractionManager } from '../interaction/InteractionManager';

export interface CommandBridgeOptions {
  camera: THREE.PerspectiveCamera;
  getRayFromScreen: (x: number, y: number) => THREE.Raycaster;
  areaSelectionRendererRef: MutableRefObject<AreaSelectionRenderer | null>;
  interactionManager: InteractionManager | null;
}

function getCommandColor(command: CommandGroup | null) {
  const category = command?.ui?.category;
  switch (category) {
    case 'stone':
      return '#8B4513';
    case 'ore':
      return '#696969';
    default:
      return '#00ff88';
  }
}

export function useCommandBridge(options: CommandBridgeOptions) {
  const { camera, getRayFromScreen, areaSelectionRendererRef, interactionManager } = options;
  const [selectedCommand, setSelectedCommand] = useState<CommandGroup | null>(null);

  const applyCommandToInteraction = useCallback(
    (command: CommandGroup | null) => {
      if (!interactionManager) return;

      if (!command) {
        interactionManager.setSelectedCommand(null);
        interactionManager.setMode('selection');
        return;
      }

      const scope = command.ui?.scope;
      if (scope === 'gather') {
        interactionManager.setMode('gather');
      } else if (scope === 'build') {
        interactionManager.setMode('building');
      } else {
        interactionManager.setMode('command');
      }

      interactionManager.setSelectedCommand(command);
    },
    [interactionManager]
  );

  const handleCommandChange = useCallback(
    (command: CommandGroup | null) => {
      setSelectedCommand(command);
      applyCommandToInteraction(command);
    },
    [applyCommandToInteraction]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const areaRenderer = areaSelectionRendererRef.current;
      if (!areaRenderer || selectedCommand?.ui?.scope !== 'gather') return;

      areaRenderer.updatePosition(
        event.clientX,
        event.clientY,
        camera,
        getRayFromScreen(event.clientX, event.clientY)
      );
    },
    [areaSelectionRendererRef, camera, getRayFromScreen, selectedCommand]
  );

  useEffect(() => {
    const areaRenderer = areaSelectionRendererRef.current;
    if (!areaRenderer) return;

    if (selectedCommand && selectedCommand.ui?.scope === 'gather') {
      const radius = (selectedCommand.ui as any)?.radius ?? 5;
      const color = getCommandColor(selectedCommand);
      areaRenderer.show(radius, color);
    } else {
      areaRenderer.hide();
    }
  }, [areaSelectionRendererRef, selectedCommand]);

  useEffect(() => {
    if (selectedCommand?.ui?.scope !== 'gather') return;

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove, selectedCommand]);

  useEffect(() => {
    if (!interactionManager) return;

    const handleModeChange = (data: { from: string; to: string }) => {
      if (data.to === 'selection') {
        setSelectedCommand(null);
      }
    };

    interactionManager.on('modeChange', handleModeChange);
    return () => {
      interactionManager.off('modeChange', handleModeChange);
    };
  }, [interactionManager]);

  return { selectedCommand, handleCommandChange };
}
