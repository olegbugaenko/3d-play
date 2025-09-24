import { MutableRefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';
import { SelectionRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/SelectionRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { IMapLogic } from '@interfaces/index';

export function useSceneObjectSync(
  mapLogicRef: MutableRefObject<IMapLogic | null>,
  rendererManagerRef: MutableRefObject<RendererManager | null>,
  selectionRendererRef: MutableRefObject<SelectionRenderer | null>
) {
  const prevObjectsRef = useRef<Map<string, TSceneObject>>(new Map());
  const lastRendererRef = useRef<RendererManager | null>(null);

  return useCallback(() => {
    const rm = rendererManagerRef.current;
    const map = mapLogicRef.current;
    if (!rm || !map) return;

    if (rm !== lastRendererRef.current) {
      prevObjectsRef.current.clear();
      lastRendererRef.current = rm;
    }

    const current = map.scene.getVisibleObjectsOptimized().map<TSceneObject>((obj) => ({
      tags: obj.tags,
      id: obj.id,
      type: obj.type,
      coordinates: obj.coordinates,
      scale: obj.scale,
      rotation: obj.rotation,
      data: obj.data,
      _dirtyFlags: obj._dirtyFlags,
      _lastUpdate: obj._lastUpdate,
      needUpdate: obj.needUpdate,
    }));

    const prev = prevObjectsRef.current;
    const currentIds = new Set(current.map((o) => o.id));

    for (const [id, oldObj] of prev) {
      if (!currentIds.has(id)) {
        rm.removeObject(id, oldObj.type);
        prev.delete(id);
      }
    }

    for (const obj of current) {
      const prevObj = prev.get(obj.id);

      if (!prevObj) {
        rm.renderObject(obj);
        prev.set(obj.id, obj);
      } else if ((obj as any).needUpdate) {
        rm.updateObject(obj);
        prev.set(obj.id, obj);
      }

      if (map.selection.isSelected(obj.id)) {
        const mesh = rm.getMeshById(obj.id);
        if (mesh && 'position' in mesh && 'scale' in mesh && 'rotation' in mesh) {
          selectionRendererRef.current?.updateHighlightPosition(
            obj.id,
            mesh.position,
            mesh.scale,
            mesh.rotation
          );
        }
      }

      if (obj.tags?.includes('controlled')) {
        const tgt = obj.data?.target;
        if (tgt && typeof tgt === 'object' && 'x' in tgt && 'y' in tgt && 'z' in tgt) {
          selectionRendererRef.current?.addTargetIndicator(
            obj.id,
            new THREE.Vector3(tgt.x as number, tgt.y as number, tgt.z as number)
          );
        } else {
          selectionRendererRef.current?.removeTargetIndicator(obj.id);
        }
      }
    }

    const interactive = map.selection.findInteractableObjects();
    selectionRendererRef.current?.highlightInteractiveObjects(interactive);

    map.scene.clearDirtyFlagsAfterSync();
  }, [mapLogicRef, rendererManagerRef, selectionRendererRef]);
}
