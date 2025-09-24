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
  const pinnedLookAtRef = useRef(new THREE.Vector3());
  const pinnedCameraPosRef = useRef(new THREE.Vector3());
  const sunDirectionRef = useRef(new THREE.Vector3());
  const sunColorRef = useRef(new THREE.Color());
  const ambientColorRef = useRef(new THREE.Color());
  const skyGlobalStateRef = useRef<
    (SkyCloudRenderState & {
      sunDirection: THREE.Vector3;
      sunColor: THREE.Color;
      ambientColor: THREE.Color;
    })
  >({
    cloudyFactor: 0,
    speedMultiplier: 1,
    wispyMultiplier: 1,
    opacityMultiplier: 1,
    sunDirection: sunDirectionRef.current,
    sunColor: sunColorRef.current,
    ambientColor: ambientColorRef.current,
  });

  const callRendererMethod = useCallback(
    (key: string, fn: string) => {
      const manager = rendererManagerRef.current;
      if (!manager) return;
      const rendererEntry = manager.renderers.get(key) as
        | { [method: string]: (() => void) | undefined }
        | undefined;
      const method = rendererEntry?.[fn];
      if (typeof method === 'function') {
        method.call(rendererEntry);
      }
    },
    [rendererManagerRef]
  );

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
          const targetLookAt = pinnedLookAtRef.current;
          targetLookAt.set(
            pinnedObject.coordinates.x,
            pinnedObject.coordinates.y,
            pinnedObject.coordinates.z
          );

          const targetPos = controller.getPinnedCameraPosition(pinnedCameraPosRef.current);
          controller.setTargetPosition(targetPos, targetLookAt);
          controller.updateSmoothMovement();
        }
      }
    }

    callRendererMethod('sky-cloud', 'updateSkyClouds');
    callRendererMethod('cloud', 'updateAllClouds');
    callRendererMethod('smoke', 'updateAllSmoke');
    callRendererMethod('fire', 'updateAllFire');
    callRendererMethod('explosion', 'updateAllExplosions');
    callRendererMethod('electric-arc', 'updateAllArcs');
    callRendererMethod('aurora', 'updateEnvironmentEffects');
    callRendererMethod('rover', 'updateDustTrails');

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

      const sunDirection = sunDirectionRef.current;
      sunDirection.set(
        sunState.direction.x,
        sunState.direction.y,
        sunState.direction.z,
      );

      const sunColor = sunColorRef.current;
      sunColor.setRGB(
        sunState.sunColor.r,
        sunState.sunColor.g,
        sunState.sunColor.b,
      );

      const ambientColor = ambientColorRef.current;
      ambientColor.setRGB(
        sunState.backgroundColor.r,
        sunState.backgroundColor.g,
        sunState.backgroundColor.b,
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
          const skyGlobalState = skyGlobalStateRef.current;
          skyGlobalState.cloudyFactor = skyState.cloudyFactor;
          skyGlobalState.speedMultiplier = skyState.speedMultiplier;
          skyGlobalState.wispyMultiplier = skyState.wispyMultiplier;
          skyGlobalState.opacityMultiplier = skyState.opacityMultiplier;
          skyRenderer.updateGlobalState?.(skyGlobalState);
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
