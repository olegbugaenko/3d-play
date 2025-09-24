import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { AntialiasingMode } from '@systems/graphics';

export function getPixelRatioForMode(mode: AntialiasingMode) {
  const deviceRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (mode === 'msaa') {
    return Math.min(1.5, deviceRatio);
  }
  return Math.min(1, deviceRatio);
}

export function useSceneCore(antialiasing: AntialiasingMode) {
  const scene = useMemo(() => {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#5a4f2e'); // Початковий колір, буде оновлений динамічно

    const ambient = new THREE.AmbientLight(0xf0f0c0, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(80, 120, 60);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.bias = -0.0005;

    const shadowCam = dir.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -220;
    shadowCam.right = 220;
    shadowCam.top = 220;
    shadowCam.bottom = -220;
    shadowCam.near = 10;
    shadowCam.far = 400;
    s.add(ambient, dir);

    (s as THREE.Scene & {
      __lights__?: { ambient: THREE.AmbientLight; dir: THREE.DirectionalLight };
    }).__lights__ = { ambient, dir };

    return s;
  }, []);

  const camera = useMemo(() => {
    const c = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 6000);
    c.position.set(5, 5, 5);
    return c;
  }, []);

  const renderer = useMemo(() => {
    const r = new THREE.WebGLRenderer({
      antialias: antialiasing === 'msaa',
      powerPreference: 'high-performance',
    });
    r.setPixelRatio(getPixelRatioForMode(antialiasing));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    return r;
  }, [antialiasing]);

  useEffect(() => {
    return () => {
      const lights = (scene as THREE.Scene & {
        __lights__?: { ambient: THREE.AmbientLight; dir: THREE.DirectionalLight };
      }).__lights__;

      if (lights) {
        scene.remove(lights.ambient);
        scene.remove(lights.dir);
      }
    };
  }, [scene]);

  return { scene, camera, renderer };
}

export function useScreenRaycaster(camera: THREE.Camera) {
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  const setFromClient = useCallback(
    (clientX: number, clientY: number) => {
      ndc.x = (clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster;
    },
    [camera, ndc, raycaster]
  );

  return { setFromClient, raycaster };
}
