import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// FIX: безпечний імпорт SkeletonUtils (працює на різних версіях three)
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BaseRenderer } from './BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import type { ParticleQuality } from '@systems/graphics';

export interface RoverData {
  modelPath?: string;
  scale?: number;
  maxSpeed?: number;
  target?: { x: number; z: number };
  rotatable?: boolean;
  rotationOffset?: number;
  storage?: Record<string, number>;
  maxCapacity?: number;
  power?: number;
  maxPower?: number;
  animationId?: string | null; // FIX: ідентифікатор кліпу для програвання
  dustTrail?: RoverDustTrailConfig;
  roadSpeedBonus?: number;
  isOnRoad?: boolean;
}

interface RoverDustTrailConfig {
  enabled?: boolean;
  particleSize?: number;
  emissionRate?: number;
  lifetime?: number;
  maxParticles?: number;
  color?: string;
}

type ProgressBarOpts = {
  parentScale: number;
  barY: number;
  barWidth?: number;
  barHeight?: number;
};

// re-used tmp objects (без зайвих алокацій)
const _qCam = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _localOffset = new THREE.Vector3();

// базові розміри/відступи для барів
const BAR_WIDTH = 0.2;
const BAR_HEIGHT = 0.018;
const GAP_Y = 0.41; // відстань між power і resource барами

const FALLBACK_DUST_TRAIL: Required<RoverDustTrailConfig> = {
  enabled: false,
  particleSize: 0.45,
  emissionRate: 16,
  lifetime: 1.4,
  maxParticles: 60,
  color: '#bca98f'
};

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3(0, 0, 1);
const _tmpVecD = new THREE.Vector3();

class DustTrailEmitter {
  private static spriteTexture: THREE.Texture | null = null;

  private readonly scene: THREE.Scene;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private ages: Float32Array;
  private lifetimes: Float32Array;
  private active: Uint8Array;
  private sizeScales: Float32Array;
  private alphaFactors: Float32Array;
  private activeCount = 0;
  private emissionAccumulator = 0;
  private capacity: number;
  private config: Required<RoverDustTrailConfig>;
  private globalEnabled = true;
  private qualityMultiplier = 1;
  private sizeAttribute: THREE.BufferAttribute;
  private alphaAttribute: THREE.BufferAttribute;

  private readonly state = {
    position: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, 1),
    speed: 0,
    shouldEmit: false
  };

  private static spawnLateral = new THREE.Vector3();
  private static spawnPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, config: RoverDustTrailConfig | undefined, quality: ParticleQuality) {
    this.scene = scene;
    this.config = this.buildConfig(config);
    this.capacity = Math.max(8, Math.floor(this.config.maxParticles));
    this.positions = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.ages = new Float32Array(this.capacity);
    this.lifetimes = new Float32Array(this.capacity);
    this.active = new Uint8Array(this.capacity);
    this.sizeScales = new Float32Array(this.capacity);
    this.alphaFactors = new Float32Array(this.capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.sizeAttribute = new THREE.BufferAttribute(this.sizeScales, 1);
    this.alphaAttribute = new THREE.BufferAttribute(this.alphaFactors, 1);
    this.geometry.setAttribute('aSize', this.sizeAttribute);
    this.geometry.setAttribute('aAlpha', this.alphaAttribute);

    this.material = new THREE.PointsMaterial({
      size: this.config.particleSize,
      map: DustTrailEmitter.getSpriteTexture(),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      depthTest: true,
      color: new THREE.Color(this.config.color),
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
      alphaTest: 0.05,
    });
    this.material.onBeforeCompile = (shader) => {
      if (shader.vertexShader.includes('attribute float aSize;')) {
        return;
      }

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aSize;\nattribute float aAlpha;\nvarying float vAlpha;'
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = aAlpha;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );');
    };
    this.material.needsUpdate = true;

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.scene.add(this.points);

    this.qualityMultiplier = quality === 'high' ? 1 : 0.6;
    this.hideAllParticles();
  }

  private buildConfig(config?: RoverDustTrailConfig): Required<RoverDustTrailConfig> {
    return {
      enabled: config?.enabled ?? FALLBACK_DUST_TRAIL.enabled,
      particleSize: config?.particleSize ?? FALLBACK_DUST_TRAIL.particleSize,
      emissionRate: config?.emissionRate ?? FALLBACK_DUST_TRAIL.emissionRate,
      lifetime: config?.lifetime ?? FALLBACK_DUST_TRAIL.lifetime,
      maxParticles: config?.maxParticles ?? FALLBACK_DUST_TRAIL.maxParticles,
      color: config?.color ?? FALLBACK_DUST_TRAIL.color
    };
  }

  public updateConfig(config: RoverDustTrailConfig | undefined, quality: ParticleQuality): void {
    const next = this.buildConfig(config);
    const needsResize = next.maxParticles > this.capacity;
    this.config = next;
    this.qualityMultiplier = quality === 'high' ? 1 : 0.6;
    this.material.size = next.particleSize;
    this.material.color.set(next.color);

    if (needsResize) {
      this.rebuildGeometry(Math.floor(next.maxParticles));
    }
  }

  public setState(position: THREE.Vector3, direction: THREE.Vector3, speed: number, shouldEmit: boolean): void {
    this.state.position.copy(position);
    this.state.direction.copy(direction);
    this.state.speed = speed;
    this.state.shouldEmit = shouldEmit;
  }

  public tick(delta: number): void {
    if (delta <= 0) return;

    const gravity = 0.5;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      this.ages[i] += delta;
      if (this.ages[i] >= this.lifetimes[i]) {
        this.active[i] = 0;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.hideParticle(i);
        continue;
      }

      const base = i * 3;
      this.positions[base] += this.velocities[base] * delta;
      this.positions[base + 1] += this.velocities[base + 1] * delta;
      this.positions[base + 2] += this.velocities[base + 2] * delta;

      this.velocities[base] *= 0.92;
      this.velocities[base + 2] *= 0.92;
      this.velocities[base + 1] -= gravity * delta;

      const lifetime = this.lifetimes[i];
      const progress = lifetime > 0 ? THREE.MathUtils.clamp(this.ages[i] / lifetime, 0, 1) : 1;
      const eased = progress * progress * (3 - 2 * progress);
      this.sizeScales[i] = 0.6 + eased * 1.9;
      const fade = 1 - progress;
      this.alphaFactors[i] = fade * fade;
    }

    if (this.globalEnabled && this.state.shouldEmit) {
      const effectiveRate = this.config.emissionRate * this.qualityMultiplier;
      this.emissionAccumulator += effectiveRate * delta;
      const spawnCount = Math.floor(this.emissionAccumulator);
      this.emissionAccumulator -= spawnCount;
      for (let i = 0; i < spawnCount; i++) {
        this.spawnParticle();
      }
    } else {
      this.emissionAccumulator = 0;
    }

    this.points.visible = this.globalEnabled && (this.state.shouldEmit || this.activeCount > 0);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  public setGlobalEnabled(enabled: boolean): void {
    this.globalEnabled = enabled;
    if (!enabled) {
      this.points.visible = false;
    }
  }

  public setQuality(quality: ParticleQuality): void {
    this.qualityMultiplier = quality === 'high' ? 1 : 0.6;
  }

  public dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }

  private hideParticle(index: number): void {
    const base = index * 3;
    this.positions[base] = this.state.position.x;
    this.positions[base + 1] = -9999;
    this.positions[base + 2] = this.state.position.z;
    this.sizeScales[index] = 0;
    this.alphaFactors[index] = 0;
  }

  private hideAllParticles(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.active[i] = 0;
      this.ages[i] = 0;
      this.lifetimes[i] = 0;
      this.hideParticle(i);
    }
    this.activeCount = 0;
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  private spawnParticle(): void {
    const index = this.findAvailableIndex();
    if (index === -1) {
      return;
    }

    this.active[index] = 1;
    this.ages[index] = 0;
    this.lifetimes[index] = this.config.lifetime * (0.7 + Math.random() * 0.6);
    this.sizeScales[index] = 0.6;
    this.alphaFactors[index] = 1;
    this.activeCount++;

    const base = index * 3;
    const dir = this.state.direction;
    const lateral = DustTrailEmitter.spawnLateral.set(dir.z, 0, -dir.x);
    if (lateral.lengthSq() > 1e-4) {
      lateral.normalize().multiplyScalar((Math.random() - 0.5) * 0.6);
    } else {
      lateral.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
    }

    const spawnPos = DustTrailEmitter.spawnPos
      .copy(this.state.position)
      .addScaledVector(dir, -0.25 - Math.random() * 0.2)
      .add(lateral);
    spawnPos.y += Math.random() * 0.12;

    this.positions[base] = spawnPos.x;
    this.positions[base + 1] = spawnPos.y;
    this.positions[base + 2] = spawnPos.z;

    const baseSpeed = Math.min(this.state.speed * 0.15 + Math.random() * 0.2, 0.5);
    this.velocities[base] = -dir.x * baseSpeed + (Math.random() - 0.5) * 0.4;
    this.velocities[base + 1] = 0.3 + Math.random() * 0.2;
    this.velocities[base + 2] = -dir.z * baseSpeed + (Math.random() - 0.5) * 0.4;
  }

  private findAvailableIndex(): number {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) {
        return i;
      }
    }
    return -1;
  }

  private rebuildGeometry(newCapacity: number): void {
    const capacity = Math.max(this.capacity, Math.floor(newCapacity));
    if (capacity === this.capacity) return;

    this.capacity = capacity;
    this.positions = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.ages = new Float32Array(this.capacity);
    this.lifetimes = new Float32Array(this.capacity);
    this.active = new Uint8Array(this.capacity);
    this.sizeScales = new Float32Array(this.capacity);
    this.alphaFactors = new Float32Array(this.capacity);
    this.activeCount = 0;
    this.emissionAccumulator = 0;

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.sizeAttribute = new THREE.BufferAttribute(this.sizeScales, 1);
    this.alphaAttribute = new THREE.BufferAttribute(this.alphaFactors, 1);
    newGeometry.setAttribute('aSize', this.sizeAttribute);
    newGeometry.setAttribute('aAlpha', this.alphaAttribute);

    this.geometry.dispose();
    this.geometry = newGeometry;
    this.points.geometry = newGeometry;

    this.hideAllParticles();
  }

  private static getSpriteTexture(): THREE.Texture {
    if (DustTrailEmitter.spriteTexture) {
      return DustTrailEmitter.spriteTexture;
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    DustTrailEmitter.spriteTexture = texture;
    return texture;
  }
}

export class RoverRenderer extends BaseRenderer {
  private loader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();
  // FIX: окремо кешуємо кліпи
  private animCache: Map<string, THREE.AnimationClip[]> = new Map();
  // FIX: свій clock для mixer.update()
  private animationClock = new THREE.Clock();
  private dustClock = new THREE.Clock();
  private dustEmitters: Map<string, DustTrailEmitter> = new Map();
  private dustTrailsEnabled = true;
  private particleQuality: ParticleQuality = 'high';

  constructor(scene: THREE.Scene) {
    super(scene);
    this.loader = new GLTFLoader();
  }

  render(object: TSceneObject): THREE.Mesh {
    // Якщо меш уже існує — оновлюємо й повертаємо
    const existing = this.meshes.get(object.id) as THREE.Mesh | undefined;
    if (existing) {
      this.updateProgressBar(existing, object.data as RoverData);
      this.updatePowerBar(existing, object.data as RoverData);
      this.setupMesh(existing, object);
      return existing;
    }

    const roverData: RoverData = object.data || {};
    const modelPath = roverData.modelPath || '/models/playtest-rover.glb';

    if (this.modelCache.has(modelPath)) {
      const cachedModel = this.modelCache.get(modelPath)!;
      const mesh = this.createRoverMesh(cachedModel, roverData);
      this.setupMesh(mesh, object);
      this.initializeTrailTracking(mesh);
      this.addMesh(object.id, mesh);

      // Бар ресурсів та бар енергії — створюємо після додавання у сцену
      this.attachOrUpdateProgressBar(mesh, roverData);
      this.attachOrUpdatePowerBar(mesh, roverData);

      // FIX: підвісити міксер/екшени з кешу
      const clips = this.animCache.get(modelPath) || [];
      if (clips.length) {
        const mixer = new THREE.AnimationMixer(mesh);
        const actions: Record<string, THREE.AnimationAction> = {};
        clips.forEach((clip) => (actions[clip.name] = mixer.clipAction(clip)));
        (mesh.userData.mixer = mixer),
        (mesh.userData.actions = actions),
        (mesh.userData.currentAction = null);
      }

      return mesh;
    }

    this.loader.load(
      modelPath,
      (gltf) => {
        this.modelCache.set(modelPath, gltf.scene);
        this.animCache.set(modelPath, gltf.animations); // FIX: зберегли кліпи
        console.log('anims: ', gltf.animations);
        const mesh = this.createRoverMesh(gltf.scene, roverData);
        this.setupMesh(mesh, object);
        this.initializeTrailTracking(mesh);

        // замінюємо fallback (+ прибираємо його індикатори)
        const prev = this.meshes.get(object.id) as THREE.Mesh | undefined;
        if (prev) {
          const prevPB = prev.userData.progressBar as THREE.Group | undefined;
          if (prevPB) this.scene.remove(prevPB);
          const prevPow = prev.userData.powerBar as THREE.Group | undefined;
          if (prevPow) this.scene.remove(prevPow);
          this.scene.remove(prev);
          this.meshes.delete(object.id);
        }

        this.addMesh(object.id, mesh);

        // Створюємо індикатори після того, як anchor у сцені
        this.attachOrUpdateProgressBar(mesh, roverData);
        this.attachOrUpdatePowerBar(mesh, roverData);

        // FIX: завели міксер та екшени
        if (gltf.animations && gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(mesh);
          const actions: Record<string, THREE.AnimationAction> = {};
          gltf.animations.forEach((clip) => (actions[clip.name] = mixer.clipAction(clip)));
          (mesh.userData.mixer = mixer),
          (mesh.userData.actions = actions),
          (mesh.userData.currentAction = null);
        }
      },
      (_progress) => {},
      (error) => {
        console.error(`Error loading rover model for ${object.id}:`, error);
      }
    );

    // Fallback
    const fallbackMesh = this.createFallbackMesh(roverData);
    this.setupMesh(fallbackMesh, object);
    this.initializeTrailTracking(fallbackMesh);
    this.addMesh(object.id, fallbackMesh);

    // і для fallback теж після addMesh:
    this.attachOrUpdateProgressBar(fallbackMesh, roverData);
    this.attachOrUpdatePowerBar(fallbackMesh, roverData);

    return fallbackMesh;
  }

  // -------------------------
  // Створення основного меша
  // -------------------------
  private createRoverMesh(model: THREE.Group, data: RoverData): THREE.Mesh {
    const scale = data.scale ?? 1.0;

    // FIX: коректний клон скіну (з фолбеком на clone(true))
    const clonedModel = ((SkeletonUtils as any)?.clone
      ? (SkeletonUtils as any).clone(model)
      : model.clone(true)) as THREE.Group;

    clonedModel.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    clonedModel.scale.setScalar(scale);

    const containerGeom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    // FIX: невидимий контейнер не тестує/не пише depth — точно не заважає рендеру
    const containerMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      visible: false,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(containerGeom, containerMat);
    mesh.frustumCulled = false;

    mesh.add(clonedModel);
    mesh.userData.modelScale = scale;

    // Порахуймо barY і збережімо (щоб не рахувати зайвий раз)
    const bbox = new THREE.Box3().setFromObject(clonedModel);
    const modelHeight = Math.max(0.001, bbox.max.y - bbox.min.y);
    mesh.userData.barY = bbox.max.y + 0.15 * modelHeight;

    return mesh;
  }

  private initializeTrailTracking(mesh: THREE.Mesh): void {
    const now = performance.now() * 0.001;
    mesh.updateMatrixWorld(true);
    if (!mesh.userData.prevPosition) {
      mesh.userData.prevPosition = mesh.position.clone();
    } else {
      (mesh.userData.prevPosition as THREE.Vector3).copy(mesh.position);
    }
    mesh.userData.prevTimestamp = now;
    const dir = mesh.getWorldDirection(_tmpVecB.set(0, 0, 0));
    if (dir.lengthSq() < 1e-6) {
      dir.set(0, 0, 1);
    } else {
      dir.normalize();
    }
    if (!mesh.userData.lastDirection) {
      mesh.userData.lastDirection = dir.clone();
    } else {
      (mesh.userData.lastDirection as THREE.Vector3).copy(dir);
    }
  }

  // -------------------------
  // Прогрес-бар РЕСУРСІВ (у scene, не дочірній)
  // -------------------------
  private attachOrUpdateProgressBar(anchorMesh: THREE.Mesh, data: RoverData): void {
    const parentScale = (anchorMesh.userData.modelScale as number) ?? 1.0;
    const baseBarY = (anchorMesh.userData.barY as number) ?? 1.2;

    const existing = anchorMesh.userData.progressBar as THREE.Group | undefined;

    if (!data.maxCapacity) {
      if (existing) {
        this.scene.remove(existing);
        anchorMesh.userData.progressBar = undefined;
      }
      return;
    }
    if (!data.storage) data.storage = {};

    const total = Object.values(data.storage).reduce((s, v) => s + v, 0);
    const progress = Math.min(Math.max(total / data.maxCapacity, 0), 1);

    if (existing) {
      this.applyProgressToBar(existing, progress);
      return;
    }

    // нижній бар (ресурси)
    const group = this.buildProgressBarGroup({
      parentScale,
      barY: baseBarY,
      barWidth: BAR_WIDTH,
      barHeight: BAR_HEIGHT
    }, 0x333333, 0xff8c00); // bg, fill (оранжевий)

    this.applyProgressToBar(group, progress);

    group.userData.anchor = anchorMesh;
    group.userData.localOffsetY = baseBarY;
    group.userData.baseParentScale = parentScale;

    this.scene.add(group);
    anchorMesh.userData.progressBar = group;
  }

  // -------------------------
  // Прогрес-бар ЕНЕРГІЇ (у scene, не дочірній)
  // -------------------------
  private attachOrUpdatePowerBar(anchorMesh: THREE.Mesh, data: RoverData): void {
    const parentScale = (anchorMesh.userData.modelScale as number) ?? 1.0;
    const baseBarY = (anchorMesh.userData.barY as number) ?? 1.2;

    const existing = anchorMesh.userData.powerBar as THREE.Group | undefined;

    if (!data.maxPower) {
      if (existing) {
        this.scene.remove(existing);
        anchorMesh.userData.powerBar = undefined;
      }
      return;
    }
    const powerVal = Math.max(0, data.power ?? 0);
    const progress = Math.min(powerVal / Math.max(1, data.maxPower), 1);

    if (existing) {
      this.applyProgressToBar(existing, progress);
      return;
    }

    // верхній бар (енергія) — на висоті +BAR_HEIGHT+GAP_Y від базового
    const powerY = baseBarY + BAR_HEIGHT + GAP_Y;

    const group = this.buildProgressBarGroup({
      parentScale,
      barY: powerY,
      barWidth: BAR_WIDTH,
      barHeight: BAR_HEIGHT
    }, 0x2a2a2a, 0x12d06b); // bg темніший, fill яскраво-зелений

    this.applyProgressToBar(group, progress);

    group.userData.anchor = anchorMesh;
    group.userData.localOffsetY = powerY;
    group.userData.baseParentScale = parentScale;

    this.scene.add(group);
    anchorMesh.userData.powerBar = group;
  }

  // -------------------------
  // Побудова бару (opaque fill + напівпрозорий фон)
  // -------------------------
  private buildProgressBarGroup(
    opts: ProgressBarOpts,
    bgColor: number,
    fillColor: number
  ): THREE.Group {
    const { parentScale, barY, barWidth = BAR_WIDTH, barHeight = BAR_HEIGHT } = opts;

    const group = new THREE.Group();
    group.name = 'progressBar';
    group.renderOrder = 1000;
    group.frustumCulled = false;

    // Спільні налаштування для UI (без світла/тон-меппінгу/туману)
    const commonUI: THREE.MeshBasicMaterialParameters = {
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    };

    // Рамка — прозора, позаду
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(barWidth + 0.005, barHeight + 0.005),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0.25,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        ...commonUI,
      })
    );
    border.position.set(0, 0, -0.002);
    border.frustumCulled = false;

    // Фон — напівпрозорий, позаду fill, з depthTest:true
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(barWidth, barHeight),
      new THREE.MeshBasicMaterial({
        color: bgColor,
        opacity: 0.45,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        ...commonUI,
      })
    );
    bg.position.set(0, 0, -0.001);
    bg.frustumCulled = false;

    // Півот лівого краю для заливки
    const fillPivot = new THREE.Group();
    fillPivot.position.set(-barWidth / 2, 0, 0.0);

    // ЗАЛИВКА — повністю opaque, з depthWrite/ depthTest
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(barWidth, barHeight),
      new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: false,
        depthTest: true,
        depthWrite: true,
        ...commonUI,
      })
    );
    fill.position.set(barWidth / 2, 0, 0.0005);
    fill.frustumCulled = false;

    fillPivot.add(fill);

    group.add(border, bg, fillPivot);

    // Оновлення трансформів — на BG (рендерюваний об'єкт)
    (bg as any).onBeforeRender = (_renderer: any, _scene: any, camera: THREE.Camera) => {
      const anchor = group.userData.anchor as THREE.Object3D | undefined;
      if (!anchor) return;

      const localY = group.userData.localOffsetY ?? barY;
      const baseParentScale = group.userData.baseParentScale ?? parentScale;

      // позиція (локальне (0, barY, 0) → world)
      _localOffset.set(0, localY, 0);
      anchor.updateWorldMatrix(true, false);
      anchor.localToWorld(_worldPos.copy(_localOffset));
      group.position.copy(_worldPos);

      // орієнтація (дивимось у камеру)
      (camera as THREE.Object3D).getWorldQuaternion(_qCam);
      group.quaternion.copy(_qCam);

      // анти-скейл (щоб бар не масштабувався з моделлю)
      anchor.getWorldScale(_worldScale);
      const sx = _worldScale.x || 1, sy = _worldScale.y || 1, sz = _worldScale.z || 1;
      const invBase = 1 / Math.max(baseParentScale, 1e-6);
      group.scale.set(invBase / sx, invBase / sy, invBase / sz);
    };

    return group;
  }

  private applyProgressToBar(group: THREE.Group, progress: number): void {
    // структура: [border=0, bg=1, fillPivot=2]
    const fillPivot = group.children[2] as THREE.Group;
    if (!fillPivot || fillPivot.children.length === 0) return;

    const fill = fillPivot.children[0] as THREE.Mesh;
    if (fill && fill.scale) {
      (fill.scale as THREE.Vector3).x = Math.max(progress, 0.0001);
    }
  }

  private updateProgressBar(anchorMesh: THREE.Object3D, data: RoverData): void {
    if (!(anchorMesh instanceof THREE.Mesh)) return;
    const group = anchorMesh.userData.progressBar as THREE.Group | undefined;

    if (!data.maxCapacity || !data.storage) {
      if (group) {
        this.scene.remove(group);
        anchorMesh.userData.progressBar = undefined;
      }
      return;
    }

    const total = Object.values(data.storage).reduce((s, v) => s + v, 0);
    const progress = Math.min(Math.max(total / data.maxCapacity, 0), 1);

    if (group) {
      this.applyProgressToBar(group, progress);
    } else {
      this.attachOrUpdateProgressBar(anchorMesh as THREE.Mesh, data);
    }
  }

  private updatePowerBar(anchorMesh: THREE.Object3D, data: RoverData): void {
    if (!(anchorMesh instanceof THREE.Mesh)) return;
    const group = anchorMesh.userData.powerBar as THREE.Group | undefined;

    if (!data.maxPower) {
      if (group) {
        this.scene.remove(group);
        anchorMesh.userData.powerBar = undefined;
      }
      return;
    }

    const powerVal = Math.max(0, data.power ?? 0);
    const progress = Math.min(powerVal / Math.max(1, data.maxPower), 1);

    if (group) {
      this.applyProgressToBar(group, progress);
    } else {
      this.attachOrUpdatePowerBar(anchorMesh as THREE.Mesh, data);
    }
  }

  // -------------------------
  // Fallback mesh (куб)
  // -------------------------
  private createFallbackMesh(data: RoverData): THREE.Mesh {
    const scale = data.scale ?? 1.0;

    const geometry = new THREE.BoxGeometry(1, 0.5, 1.5);
    const material = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;

    // важливо: масштаб моделі зберігаємо в userData, але сам контейнер не масштабуємо
    mesh.userData.modelScale = scale;

    // barY для заглушки
    mesh.userData.barY = 0.9;

    return mesh;
  }

  // -------------------------
  // Трансформи/тіні
  // -------------------------
  private setupMesh(mesh: THREE.Mesh, object: TSceneObject): void {
    mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  private updateDustTrailState(object: TSceneObject, mesh: THREE.Mesh): void {
    const now = performance.now() * 0.001;
    const prevTimestamp = (mesh.userData.prevTimestamp as number | undefined) ?? now;
    const deltaTime = Math.max(1e-3, now - prevTimestamp);
    let prevPosition = mesh.userData.prevPosition as THREE.Vector3 | undefined;
    if (!prevPosition) {
      prevPosition = mesh.position.clone();
      mesh.userData.prevPosition = prevPosition;
    }

    _tmpVecD.copy(mesh.position).sub(prevPosition);
    const distance = _tmpVecD.length();

    let direction: THREE.Vector3;
    if (distance > 1e-4) {
      _tmpVecD.multiplyScalar(1 / distance);
      direction = _tmpVecD;
      if (!mesh.userData.lastDirection) {
        mesh.userData.lastDirection = direction.clone();
      } else {
        (mesh.userData.lastDirection as THREE.Vector3).copy(direction);
      }
    } else {
      const stored = mesh.userData.lastDirection as THREE.Vector3 | undefined;
      if (stored) {
        direction = stored;
      } else {
        direction = _tmpVecC.set(0, 0, 1);
        mesh.userData.lastDirection = direction.clone();
      }
    }

    const speed = distance / deltaTime;
    prevPosition.copy(mesh.position);
    mesh.userData.prevTimestamp = now;

    const roverData = (object.data as RoverData) || {};
    const roadBonus = roverData.roadSpeedBonus ?? 1;
    const isOnRoad = roverData.isOnRoad ?? roadBonus > 1.05;
    const shouldEmit = !isOnRoad && speed > 0.25;

    const config = roverData.dustTrail;
    const shouldHaveEmitter = this.dustTrailsEnabled && !!config && config.enabled !== false;
    const existingEmitter = this.dustEmitters.get(object.id);

    if (!shouldHaveEmitter) {
      if (existingEmitter) {
        existingEmitter.dispose();
        this.dustEmitters.delete(object.id);
      }
      return;
    }

    let emitter = existingEmitter;
    if (!emitter) {
      emitter = new DustTrailEmitter(this.scene, config, this.particleQuality);
      emitter.setGlobalEnabled(this.dustTrailsEnabled);
      this.dustEmitters.set(object.id, emitter);
    } else {
      emitter.updateConfig(config, this.particleQuality);
      emitter.setGlobalEnabled(this.dustTrailsEnabled);
    }

    _tmpVecA.copy(mesh.position);
    _tmpVecA.y += 0.05;

    emitter.setState(_tmpVecA, direction, speed, shouldEmit);
  }

  // -------------------------
  // Tick/Update
  // -------------------------
  public update(object: TSceneObject): void {
    super.update(object);
    const existingMesh = this.meshes.get(object.id) as THREE.Mesh | undefined;
    if (!existingMesh) return;

    this.updateProgressBar(existingMesh, object.data as RoverData);
    this.updatePowerBar(existingMesh, object.data as RoverData);

    // FIX: оновлюємо mixer + керуємо animationId
    const delta = this.animationClock.getDelta();
    const mixer = existingMesh.userData.mixer as THREE.AnimationMixer | undefined;
    if (mixer) mixer.update(delta);

    this.updateDustTrailState(object, existingMesh);

    const actions = existingMesh.userData.actions as Record<string, THREE.AnimationAction> | undefined;
    if (!actions) return;

    const want = (object.data as RoverData)?.animationId ?? null;
    const current = (existingMesh.userData.currentAction as string | null) ?? null;
    if (want === current) return;

    const fade = 0.2;
    const next = want && actions[want] ? actions[want] : null;

    if (!next) {
      if (current && actions[current]) actions[current].fadeOut(fade);
      existingMesh.userData.currentAction = null;
      return;
    }

    next.reset().fadeIn(fade).play();
    if (current && actions[current]) actions[current].crossFadeTo(next, fade, false);
    existingMesh.userData.currentAction = want;
  }

  public updateDustTrails(): void {
    const delta = this.dustClock.getDelta();
    if (delta <= 0) {
      return;
    }
    for (const emitter of this.dustEmitters.values()) {
      emitter.tick(delta);
    }
  }

  public setDustTrailsEnabled(enabled: boolean): void {
    if (this.dustTrailsEnabled === enabled) return;
    this.dustTrailsEnabled = enabled;
    for (const emitter of this.dustEmitters.values()) {
      emitter.setGlobalEnabled(enabled);
    }
  }

  public setParticleQuality(quality: ParticleQuality): void {
    if (this.particleQuality === quality) return;
    this.particleQuality = quality;
    for (const emitter of this.dustEmitters.values()) {
      emitter.setQuality(quality);
    }
  }

  // -------------------------
  // Очищення ресурсів (важливо для HMR!)
  // -------------------------
  public dispose(): void {
    // Очищаємо всі індикатори
    for (const [_id, mesh] of this.meshes) {
      const progressBar = mesh.userData.progressBar as THREE.Group | undefined;
      const powerBar = mesh.userData.powerBar as THREE.Group | undefined;
      
      if (progressBar) {
        this.scene.remove(progressBar);
        mesh.userData.progressBar = undefined;
      }
      if (powerBar) {
        this.scene.remove(powerBar);
        mesh.userData.powerBar = undefined;
      }
      // FIX: зупиняємо міксер, якщо є
      const mixer = mesh.userData.mixer as THREE.AnimationMixer | undefined;
      mixer?.stopAllAction();
    }

    // Очищаємо кеш моделей
    this.modelCache.clear();
    this.animCache.clear(); // FIX

    // Очищаємо меші
    this.meshes.clear();

    for (const emitter of this.dustEmitters.values()) {
      emitter.dispose();
    }
    this.dustEmitters.clear();
  }

  public override remove(id: string): void {
    const emitter = this.dustEmitters.get(id);
    if (emitter) {
      emitter.dispose();
      this.dustEmitters.delete(id);
    }
    super.remove(id);
  }
}
