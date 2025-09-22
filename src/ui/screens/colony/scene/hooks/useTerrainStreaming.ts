import { MutableRefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { TerrainRenderer } from '@ui/screens/colony/scene/Scene3D/renderers/TerrainRenderer';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';
import { IMapLogic } from '@interfaces/index';

export function useTerrainStreaming(
  camera: THREE.PerspectiveCamera,
  terrainRendererRef: MutableRefObject<TerrainRenderer | null>,
  mapLogicRef: MutableRefObject<IMapLogic | null>
) {
  const lastPosRef = useRef<{ x: number; y: number; z: number } | null>(null);

  const updateTerrainForCamera = useCallback(() => {
    const tr = terrainRendererRef.current;
    const tm = mapLogicRef.current?.scene.getTerrainManager();
    if (!tr || !tm) return;

    tr.updateTerrain({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  }, [camera, terrainRendererRef, mapLogicRef]);

  const checkAndGenerate = useCallback(() => {
    const tr = terrainRendererRef.current;
    const tm = mapLogicRef.current?.scene.getTerrainManager();
    if (!tr || !tm) return;

    const last = lastPosRef.current;
    const cur = camera.position;

    if (last) {
      const dx = cur.x - last.x;
      const dz = cur.z - last.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 50) {
        tr.renderTerrain({ x: cur.x, y: cur.y, z: cur.z }).catch(console.error);
        lastPosRef.current = { x: cur.x, y: cur.y, z: cur.z };
      }
    } else {
      lastPosRef.current = { x: cur.x, y: cur.y, z: cur.z };
    }
  }, [camera, terrainRendererRef, mapLogicRef]);

  return { updateTerrainForCamera, checkAndGenerate };
}

export function ensureAreaSelectionRenderer(
  scene: THREE.Scene,
  areaSelectionRendererRef: MutableRefObject<AreaSelectionRenderer | null>,
  mapLogicRef: MutableRefObject<IMapLogic | null>
) {
  const tm = mapLogicRef.current?.scene.getTerrainManager();
  if (!tm) return;

  if (!areaSelectionRendererRef.current) {
    areaSelectionRendererRef.current = new AreaSelectionRenderer(scene, tm);
  }
}
