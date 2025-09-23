import * as THREE from 'three';

const SHADOW_NAME = '__bakedShadow';
const SHADOW_GEOMETRY = new THREE.PlaneGeometry(1, 1);
let SHADOW_TEXTURE: THREE.DataTexture | null = null;

function createShadowTexture(size = 256, falloff = 1.6): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  const maxRadius = half * Math.SQRT2;

  let ptr = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const norm = Math.min(1, dist / maxRadius);
      const intensity = Math.pow(1 - norm, falloff);
      const alpha = Math.min(255, Math.max(0, Math.floor(255 * intensity)));

      data[ptr++] = 0;
      data[ptr++] = 0;
      data[ptr++] = 0;
      data[ptr++] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return texture;
}

function ensureTexture(): THREE.Texture {
  if (!SHADOW_TEXTURE) {
    SHADOW_TEXTURE = createShadowTexture();
  }
  return SHADOW_TEXTURE;
}

function disposeMesh(mesh: THREE.Object3D | null | undefined) {
  if (!mesh || !(mesh instanceof THREE.Mesh)) return;
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    (material as THREE.Material).dispose();
  }
}

export interface BakedShadowConfig {
  width: number;
  depth: number;
  minY: number;
  centerX?: number;
  centerZ?: number;
  intensity?: number;
  softness?: number;
  offset?: number;
  color?: THREE.ColorRepresentation;
  minSize?: number;
}

export function applyBakedShadow(target: THREE.Object3D, config: BakedShadowConfig): void {
  const existing = target.getObjectByName(SHADOW_NAME);
  if (existing) {
    target.remove(existing);
    disposeMesh(existing);
  }

  const texture = ensureTexture();
  const intensity = THREE.MathUtils.clamp(config.intensity ?? 0.6, 0, 1);
  const softness = config.softness ?? 1.3;
  const minSize = config.minSize ?? 0.5;
  const baseWidth = Number.isFinite(config.width) ? Math.abs(config.width) : 0;
  const baseDepth = Number.isFinite(config.depth) ? Math.abs(config.depth) : 0;
  const width = Math.max(minSize, baseWidth * softness);
  const depth = Math.max(minSize, baseDepth * softness);

  const centerX = Number.isFinite(config.centerX ?? NaN) ? config.centerX! : 0;
  const centerZ = Number.isFinite(config.centerZ ?? NaN) ? config.centerZ! : 0;
  const minY = Number.isFinite(config.minY) ? config.minY : 0;
  const offsetWorld = config.offset ?? 0.015;
  const parentScaleY = Math.max(1e-6, target.scale?.y ?? 1);
  const offsetLocal = offsetWorld / parentScaleY;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: new THREE.Color(config.color ?? 0x000000),
    transparent: true,
    opacity: intensity,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.MultiplyBlending,
    side: THREE.DoubleSide,
  });

  const plane = new THREE.Mesh(SHADOW_GEOMETRY, material);
  plane.name = SHADOW_NAME;
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(centerX, minY + offsetLocal, centerZ);
  plane.scale.set(width, depth, 1);
  plane.renderOrder = -5;
  plane.matrixAutoUpdate = true;
  plane.castShadow = false;
  plane.receiveShadow = false;
  plane.userData.bakedShadow = true;
  plane.layers.mask = target.layers.mask;

  target.add(plane);
}

export function removeBakedShadow(target: THREE.Object3D): void {
  const existing = target.getObjectByName(SHADOW_NAME);
  if (existing) {
    target.remove(existing);
    disposeMesh(existing);
  }
}

export function computeShadowFootprint(source: THREE.Object3D): {
  width: number;
  depth: number;
  minY: number;
  centerX: number;
  centerZ: number;
} {
  source.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(source);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  return {
    width: size.x,
    depth: size.z,
    minY: box.min.y,
    centerX: center.x,
    centerZ: center.z,
  };
}
