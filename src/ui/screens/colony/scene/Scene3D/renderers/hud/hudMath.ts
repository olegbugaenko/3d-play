import * as THREE from 'three';

const _camPos = new THREE.Vector3();

export function computeScreenSpaceScale(
  camera: THREE.Camera,
  worldPos: THREE.Vector3,
  planeWorldHeight: number,
  targetPx: number,
  renderer: THREE.WebGLRenderer | undefined,
  minScale: number,
  maxScale: number
): number {
  const size = renderer?.getSize(new THREE.Vector2());
  const dpr = renderer?.getPixelRatio?.() ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const viewportH = (size?.y ?? (typeof window !== 'undefined' ? window.innerHeight || 800 : 800)) * dpr;

  if ((camera as any).isOrthographicCamera) {
    const cam = camera as THREE.OrthographicCamera;
    const orthoHeight = Math.max(1e-6, cam.top - cam.bottom);
    const pxPerWorld = viewportH / orthoHeight;
    const currentPx = planeWorldHeight * pxPerWorld;
    const scale = Math.round(targetPx) / Math.max(1e-6, currentPx);
    return THREE.MathUtils.clamp(scale, minScale, maxScale);
  }

  if ((camera as any).isPerspectiveCamera) {
    (camera as THREE.Object3D).getWorldPosition(_camPos);
    const distance = _camPos.distanceTo(worldPos);
    const cam = camera as THREE.PerspectiveCamera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    const denom = Math.max(1e-6, 2 * distance * tan);
    const heightToPixels = viewportH / denom;
    const scale = Math.round(targetPx) / Math.max(1e-6, planeWorldHeight * heightToPixels);
    return THREE.MathUtils.clamp(scale, minScale, maxScale);
  }

  return 1;
}

export function clampScaleByWidth(
  baseScale: number,
  aspect: number,
  targetHeightPx: number,
  maxWidthPx: number
): number {
  if (maxWidthPx <= 0) return baseScale;
  const predictedWidthPx = targetHeightPx * aspect;
  if (predictedWidthPx <= maxWidthPx) {
    return baseScale;
  }
  const factor = maxWidthPx / Math.max(1e-6, predictedWidthPx);
  return baseScale * factor;
}
