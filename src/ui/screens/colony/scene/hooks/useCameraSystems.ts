import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CameraController } from '@ui/screens/colony/scene/CameraController';
import { IMapLogic } from '@interfaces/index';

export function useCameraController(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  mapLogicRef: MutableRefObject<IMapLogic | null>
) {
  const controller = useMemo(() => {
    return new CameraController(camera, renderer.domElement, {
      enableDamping: true,
      dampingFactor: 0.05,
      minDistance: 1,
      maxDistance: 25,
      panSpeed: 0.05,
      rotateSpeed: 0.05,
      zoomSpeed: 0.3,
    });
  }, [camera, renderer]);

  useEffect(() => {
    controller.setGetTerrainHeight((x, z) => {
      const tm = mapLogicRef.current?.scene.getTerrainManager();
      return tm ? tm.getHeightAt(x, z) : undefined;
    });
  }, [controller, mapLogicRef]);

  return controller;
}

export function useCameraViewportSync(
  camera: THREE.PerspectiveCamera,
  controller: CameraController,
  mapLogicRef: MutableRefObject<IMapLogic | null>
) {
  const lastCamPosRef = useRef<{ x: number; y: number; z: number } | null>(null);

  const ensureTargetOnTerrain = useCallback(() => {
    const tm = mapLogicRef.current?.scene.getTerrainManager();
    if (!tm) return;

    const target = controller.getTarget();
    const h = tm.getHeightAt(target.x, target.z);
    if (h === undefined) return;

    const diff = h - target.y;
    if (Math.abs(diff) > 0.1) {
      controller.setTarget(new THREE.Vector3(target.x, h, target.z));
      camera.position.y += diff;
    }
  }, [camera, controller, mapLogicRef]);

  const updateViewport = useCallback(() => {
    const map = mapLogicRef.current;
    if (!map) return;

    map.scene.updateViewport({
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
      fov: camera.fov,
      aspect: camera.aspect,
      distance: camera.position.distanceTo(controller.getTarget()),
    });
  }, [camera, controller, mapLogicRef]);

  const maybeUpdateViewportOnMove = useCallback(() => {
    const cur = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const last = lastCamPosRef.current;
    const moved =
      !last || Math.abs(cur.x - last.x) > 5 || Math.abs(cur.z - last.z) > 5;

    if (moved) {
      lastCamPosRef.current = cur;
      ensureTargetOnTerrain();
      updateViewport();
    }
  }, [camera.position, ensureTargetOnTerrain, updateViewport]);

  return { ensureTargetOnTerrain, updateViewport, maybeUpdateViewportOnMove };
}
