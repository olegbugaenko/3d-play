import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';

export function useSceneCore() {
  const scene = useMemo(() => {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#5a4f2e');

    const ambient = new THREE.AmbientLight(0xf0f0c0, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(80, 120, 60);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
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
    const c = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    c.position.set(5, 5, 5);
    return c;
  }, []);

  const renderer = useMemo(() => {
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    return r;
  }, []);

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
