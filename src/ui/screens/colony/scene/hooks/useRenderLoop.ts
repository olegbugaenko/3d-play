import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CameraController } from '@ui/screens/colony/scene/CameraController';
import { RendererManager } from '@ui/screens/colony/scene/Scene3D/renderers/RendererManager';
import { AreaSelectionRenderer } from '@ui/screens/colony/scene/AreaSelectionRenderer';
import { IMapLogic } from '@interfaces/index';
import { SkyCloudInstance, SkyCloudRenderState } from '@logic/systems/environment/environment.types';

export interface RenderLoopOptions {
  maybeUpdateViewportOnMove: () => void;
  checkAndGenerateTerrain: () => void;
  syncVisibleObjects: () => void;
}

export function useRenderLoop(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  controller: CameraController,
  rendererManagerRef: MutableRefObject<RendererManager | null>,
  options: RenderLoopOptions,
  areaSelectionRendererRef: MutableRefObject<AreaSelectionRenderer | null>,
  mapLogicRef: MutableRefObject<IMapLogic | null>
) {
  const rafRef = useRef<number>();
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);

    frameCountRef.current += 1;
    const now = performance.now();
    if (now - lastTimeRef.current >= 2000) {
      const newFps = frameCountRef.current / 2;
      setFps((prevFps) => {
        if (Math.abs(prevFps - newFps) > 5) {
          return newFps;
        }
        return prevFps;
      });
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    controller.handleAutoPan();
    options.maybeUpdateViewportOnMove();
    options.checkAndGenerateTerrain();

    if (controller.isCameraPinned()) {
      const pinnedObjectId = controller.getPinnedObjectId();
      if (pinnedObjectId) {
        const pinnedObject = mapLogicRef.current?.scene.getObjectById(pinnedObjectId);
        if (pinnedObject) {
          const targetLookAt = new THREE.Vector3(
            pinnedObject.coordinates.x,
            pinnedObject.coordinates.y,
            pinnedObject.coordinates.z
          );

          const targetPos = controller.getPinnedCameraPosition();
          controller.setTargetPosition(targetPos, targetLookAt);
          controller.updateSmoothMovement();
        }
      }
    }

    const rm = rendererManagerRef.current;
    if (rm) {
      const tryCall = (key: string, fn: string) => {
        const r = rm.renderers.get(key);
        if (r && fn in r) {
          const rendererAny = r as unknown as { [key: string]: () => void };
          rendererAny[fn]();
        }
      };

      tryCall('sky-cloud', 'updateSkyClouds');
      tryCall('cloud', 'updateAllClouds');
      tryCall('smoke', 'updateAllSmoke');
      tryCall('fire', 'updateAllFire');
      tryCall('explosion', 'updateAllExplosions');
      tryCall('electric-arc', 'updateAllArcs');
      tryCall('aurora', 'updateEnvironmentEffects');
      tryCall('rover', 'updateDustTrails');
    }

    const lights = (scene as THREE.Scene & {
      __lights__?: { ambient: THREE.AmbientLight; dir: THREE.DirectionalLight };
    }).__lights__;
    const environment: any = mapLogicRef.current && (mapLogicRef.current as any).environment;
    if (lights && environment?.getSunLightState) {
      const sunState = environment.getSunLightState();
      lights.dir.intensity = sunState.directionalIntensity;
      lights.dir.position.set(
        sunState.direction.x,
        sunState.direction.y,
        sunState.direction.z,
      );
      lights.dir.color.setRGB(
        sunState.directionalColor.r,
        sunState.directionalColor.g,
        sunState.directionalColor.b,
      );
      lights.ambient.intensity = sunState.ambientIntensity;
      lights.ambient.color.setRGB(
        sunState.haloColor.r,
        sunState.haloColor.g,
        sunState.haloColor.b,
      );

      // Оновлюємо колір фону в залежності від пори доби
      if (scene.background instanceof THREE.Color) {
        scene.background.setRGB(
          sunState.backgroundColor.r,
          sunState.backgroundColor.g,
          sunState.backgroundColor.b,
        );
      }

      const sunRenderer = rendererManagerRef.current?.renderers.get('sun') as
        | { updateSunState?: (state: typeof sunState) => void }
        | undefined;
      sunRenderer?.updateSunState?.(sunState);


      const skyRenderer = rendererManagerRef.current?.renderers.get('sky-cloud') as
        | {
            updateGlobalState?: (
              state: SkyCloudRenderState & {
                sunDirection: THREE.Vector3;
                sunColor: THREE.Color;
                ambientColor: THREE.Color;
              }
            ) => void;
            syncFromEnvironment?: (instances: SkyCloudInstance[]) => void;
          }
        | undefined;

      if (skyRenderer) {
        const skyState = environment.getSkyCloudRenderState?.();
        if (skyState) {
          skyRenderer.updateGlobalState?.({
            ...skyState,
            sunDirection: new THREE.Vector3(
              sunState.direction.x,
              sunState.direction.y,
              sunState.direction.z,
            ),
            sunColor: new THREE.Color(
              sunState.sunColor.r,
              sunState.sunColor.g,
              sunState.sunColor.b,
            ),
            ambientColor: new THREE.Color(
              sunState.backgroundColor.r,
              sunState.backgroundColor.g,
              sunState.backgroundColor.b,
            ),
          });
        }

        const skyInstances = environment.getSkyCloudInstances?.();
        if (skyInstances) {
          skyRenderer.syncFromEnvironment?.(skyInstances);
        }
      }
    }

    options.syncVisibleObjects();

    if (areaSelectionRendererRef.current) {
      areaSelectionRendererRef.current.update();
    }

    renderer.render(scene, camera);
  }, [
    areaSelectionRendererRef,
    camera,
    controller,
    mapLogicRef,
    options,
    renderer,
    rendererManagerRef,
    scene,
  ]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  return fps;
}
