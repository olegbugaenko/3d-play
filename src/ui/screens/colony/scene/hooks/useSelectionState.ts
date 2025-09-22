import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { IMapLogic } from '@interfaces/index';

function areIdsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useSelectedUnits(mapLogicRef: MutableRefObject<IMapLogic | null>) {
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const lastIdsRef = useRef<string[]>([]);

  const updateSelectedUnits = useCallback(() => {
    const ids = mapLogicRef.current?.selection.getSelectedObjects() ?? [];
    if (!areIdsEqual(ids, lastIdsRef.current)) {
      lastIdsRef.current = ids;
      setSelectedUnits(ids);
    }
  }, [mapLogicRef]);

  useEffect(() => {
    updateSelectedUnits();
    const interval = setInterval(updateSelectedUnits, 1000);
    return () => clearInterval(interval);
  }, [updateSelectedUnits]);

  return selectedUnits;
}

export function useSelectionHighlights(
  mapLogicRef: MutableRefObject<IMapLogic | null>,
  rendererManagerRef: MutableRefObject<RendererManager | null>,
  selectionRendererRef: MutableRefObject<SelectionRenderer | null>
) {
  useEffect(() => {
    const updateSelectionHighlights = () => {
      const map = mapLogicRef.current;
      const rm = rendererManagerRef.current;
      const sr = selectionRendererRef.current;

      if (!map || !rm || !sr) return;

      sr.clearAll();

      const selectedIds = map.selection.getSelectedObjects();
      selectedIds.forEach((id: string) => {
        const mesh = rm.getMeshById(id);
        if (mesh && mesh instanceof THREE.Mesh) {
          sr.addSelectionHighlight(id, mesh);
        }
      });

      const interactive = map.selection.findInteractableObjects();
      sr.highlightInteractiveObjects(interactive);
    };

    const interval = setInterval(updateSelectionHighlights, 100);
    return () => clearInterval(interval);
  }, [mapLogicRef, rendererManagerRef, selectionRendererRef]);
}
