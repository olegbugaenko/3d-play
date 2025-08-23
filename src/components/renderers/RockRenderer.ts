import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface RockData {
  color?: number;       // hex, напр. 0xAABBCC
  size?: number;        // масштаб від моделі
  smoothness?: number;  // не використовується тут
  modelPath?: string;   // один із ROCK_MODELS
}

interface RockInstance {
  id: string;
  object: SceneObject;
  instanceId: number;
  modelPath: string;
  bucketKey: string; // modelPath|* (дефолт) або modelPath|#RRGGBB (палетний режим)
}

type RockRendererConfig = {
  MAX_INSTANCES?: number;          // ліміт інстансів на кошик
  usePaletteBuckets?: boolean;     // true => один InstancedMesh на колір (кеш матеріалів)
  paletteColors?: number[];        // (опц.) перелік дозволених кольорів у палетному режимі
};

export class RockRenderer extends BaseRenderer {
  private loader: GLTFLoader;

  // кеш завантажених сцен (GLB)
  private modelCache: Map<string, THREE.Group> = new Map();

  // кеш витягнутої геометрії
  private geometryCache: Map<string, THREE.BufferGeometry> = new Map();

  // Кошики інстансів
  private meshBuckets: Map<string, THREE.InstancedMesh> = new Map(); // key: model|* або model|#RRGGBB
  private nextInstanceId: Map<string, number> = new Map();
  private freeInstanceIds: Map<string, number[]> = new Map();
  private highestActiveIndex: Map<string, number> = new Map();

  // Кеш матеріалів під конкретний колір (палетний режим)
  private materialCacheByColor: Map<string, THREE.Material> = new Map(); // key: modelPath|#RRGGBB

  // Активні інстанси
  private instances: Map<string, RockInstance> = new Map();

  // Фоллбеки, що чекають заміни
  private pendingFallbacks: Map<string, { mesh: THREE.Mesh; object: SceneObject }> = new Map();

  private modelsReady = false;

  private readonly cfg: Required<RockRendererConfig> = {
    MAX_INSTANCES: 1000,
    usePaletteBuckets: false,
    paletteColors: [],
  };

  // Моделі
  private readonly ROCK_MODELS = [
    '/models/stone2.glb',
    '/models/stone3.glb',
    '/models/stone4.glb',
  ];

  constructor(scene: THREE.Scene, config: RockRendererConfig = {}) {
    super(scene);
    this.loader = new GLTFLoader();
    this.cfg = { ...this.cfg, ...config };
    this.initializeModels();
  }

  // ----------------------- Loading -----------------------

  private async initializeModels(): Promise<void> {
    try {
      const loadPromises = this.ROCK_MODELS.map(
        (modelPath) =>
          new Promise<{ path: string; model: THREE.Group }>((resolve, reject) => {
            this.loader.load(
              modelPath,
              (gltf) => resolve({ path: modelPath, model: gltf.scene }),
              undefined,
              (error) => reject(error),
            );
          }),
      );

      const loaded = await Promise.all(loadPromises);

      // Підготуємо кеш геометрії для кожної моделі
      for (const { path, model } of loaded) {
        this.modelCache.set(path, model);

        const geom = this.extractFirstGeometry(model);
        if (!geom) {
          console.warn(`[RockRenderer] Не знайшов геометрію у ${path}`);
          continue;
        }
        // гарантуємо нормалі (щоб не було чорного через відсутність світла/нормалей)
        if (!geom.attributes.normal) geom.computeVertexNormals();

        this.geometryCache.set(path, geom);
      }

      this.modelsReady = true;
      // Замінюємо фоллбеки на справжні інстанси
      this.replaceAllFallbacksWithInstances();
    } catch (e) {
      console.error('RockRenderer: помилка завантаження моделей каменів:', e);
    }
  }

  private extractFirstGeometry(group: THREE.Group): THREE.BufferGeometry | null {
    let geometry: THREE.BufferGeometry | null = null;
    group.traverse((child) => {
      if (!geometry && (child as any).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) geometry = mesh.geometry;
      }
    });
    return geometry;
  }

  // ----------------------- Public API -----------------------

  render(object: SceneObject): THREE.Object3D {
    const existing = this.instances.get(object.id);
    if (existing) {
      this.updateInstance(existing, /*allowRebucket=*/true);
      return this.meshBuckets.get(existing.bucketKey)!;
    }

    const rockData: RockData = object.data || {};
    const modelPath = rockData.modelPath || this.ROCK_MODELS[0];

    if (!this.modelsReady || !this.geometryCache.has(modelPath)) {
      const fallbackMesh = this.createFallbackMesh(rockData, object);
      this.addMesh(object.id, fallbackMesh);
      return fallbackMesh;
    }

    // Прибрати фоллбек, якщо був
    if (this.pendingFallbacks.has(object.id)) {
      const { mesh } = this.pendingFallbacks.get(object.id)!;
      if (mesh.parent === this.scene) this.scene.remove(mesh);
      this.pendingFallbacks.delete(object.id);
      this.meshes.delete(object.id);
    }

    const bucketKey = this.pickBucketKey(modelPath, rockData.color);
    const mesh = this.getOrCreateBucketMesh(bucketKey, modelPath, rockData.color);

    const instanceId = this.getNextInstanceId(bucketKey);
    if (instanceId === -1) {
      console.warn(`[RockRenderer] Досягнуто ліміт інстансів для ${bucketKey}`);
      const fallbackMesh = this.createFallbackMesh(rockData, object);
      this.addMesh(object.id, fallbackMesh);
      return fallbackMesh;
    }

    const inst: RockInstance = {
      id: object.id,
      object,
      instanceId,
      modelPath,
      bucketKey,
    };

    this.instances.set(object.id, inst);
    this.meshes.set(object.id, mesh); // мапимо до спільного меша кошика

    this.updateInstance(inst, /*allowRebucket=*/false);

    return mesh;
  }

  update(object: SceneObject): void {
    const inst = this.instances.get(object.id);
    if (inst) {
      inst.object = object;
      this.updateInstance(inst, /*allowRebucket=*/true);
    } else if (this.pendingFallbacks.has(object.id)) {
      // синхронізуємо фоллбек
      const { mesh } = this.pendingFallbacks.get(object.id)!;
      mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
      mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
      mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
    }
  }

  remove(id: string): void {
    const inst = this.instances.get(id);
    if (inst) {
      // звільнити слот у кошику
      const free = this.freeInstanceIds.get(inst.bucketKey) ?? [];
      free.push(inst.instanceId);
      this.freeInstanceIds.set(inst.bucketKey, free);

      const mesh = this.meshBuckets.get(inst.bucketKey);
      if (mesh) {
        // "сховати" інстанс
        const m = new THREE.Matrix4().makeScale(0, 0, 0);
        mesh.setMatrixAt(inst.instanceId, m);
        mesh.instanceMatrix.needsUpdate = true;
        this.recomputeMeshCount(inst.bucketKey);
      }

      this.instances.delete(id);
      this.meshes.delete(id); // не прибираємо спільний InstancedMesh зі сцени
      return;
    }

    // якщо це був фоллбек
    const pending = this.pendingFallbacks.get(id);
    if (pending) {
      if (pending.mesh.parent === this.scene) this.scene.remove(pending.mesh);
      this.pendingFallbacks.delete(id);
      this.meshes.delete(id);
      return;
    }

    super.remove(id);
  }

  // ----------------------- Core internals -----------------------

  private updateInstance(inst: RockInstance, allowRebucket: boolean): void {
    const rockData: RockData = inst.object.data || {};
    const desiredBucket = this.pickBucketKey(inst.modelPath, rockData.color);

    // Палетний режим: якщо змінився колір — переносимо в інший кошик
    if (allowRebucket && desiredBucket !== inst.bucketKey) {
      this.moveInstanceToBucket(inst, desiredBucket, rockData.color);
    }

    const mesh = this.meshBuckets.get(inst.bucketKey);
    if (!mesh) return;

    const { size = 1.0 } = rockData;

    const pos = new THREE.Vector3(inst.object.coordinates.x, inst.object.coordinates.y, inst.object.coordinates.z);
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(inst.object.rotation.x, inst.object.rotation.y, inst.object.rotation.z),
    );
    const scl = new THREE.Vector3(
      inst.object.scale.x * size,
      inst.object.scale.y * size,
      inst.object.scale.z * size,
    );
    const m = new THREE.Matrix4().compose(pos, quat, scl);

    mesh.setMatrixAt(inst.instanceId, m);
    mesh.instanceMatrix.needsUpdate = true;

    // Дефолтний кошик (per-instance color): застосовуємо колір з object.data.color
    if (this.isDefaultBucket(inst.bucketKey)) {
      const hex = (typeof rockData.color === 'number') ? rockData.color : 0xffffff;
      if (mesh.instanceColor) {
        mesh.setColorAt(inst.instanceId, new THREE.Color(hex));
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // Оновити видиму кількість
    const curMax = this.highestActiveIndex.get(inst.bucketKey) ?? -1;
    if (inst.instanceId > curMax) {
      this.highestActiveIndex.set(inst.bucketKey, inst.instanceId);
      mesh.count = inst.instanceId + 1;
    }
  }

  private moveInstanceToBucket(inst: RockInstance, newBucketKey: string, color?: number): void {
    // звільняємо старий слот
    const oldFree = this.freeInstanceIds.get(inst.bucketKey) ?? [];
    oldFree.push(inst.instanceId);
    this.freeInstanceIds.set(inst.bucketKey, oldFree);

    const oldMesh = this.meshBuckets.get(inst.bucketKey);
    if (oldMesh) {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      oldMesh.setMatrixAt(inst.instanceId, zero);
      oldMesh.instanceMatrix.needsUpdate = true;
      this.recomputeMeshCount(inst.bucketKey);
    }

    // новий кошик
    const newMesh = this.getOrCreateBucketMesh(newBucketKey, inst.modelPath, color);

    const newId = this.getNextInstanceId(newBucketKey);
    inst.instanceId = newId;
    inst.bucketKey = newBucketKey;

    // оновлюємо у новому меші
    this.updateInstance(inst, /*allowRebucket=*/false);

    // переназначимо посилання у meshes map
    this.meshes.set(inst.id, newMesh);
  }

  private pickBucketKey(modelPath: string, color?: number): string {
    if (this.cfg.usePaletteBuckets) {
      const keyColor = (typeof color === 'number') ? this.hex6(color) : 'FFFFFF';
      return `${modelPath}|#${keyColor}`;
    }
    return `${modelPath}|*`; // дефолт — один меш на модель
  }

  private isDefaultBucket(bucketKey: string): boolean {
    return bucketKey.endsWith('|*');
  }

  private getOrCreateBucketMesh(bucketKey: string, modelPath: string, color?: number): THREE.InstancedMesh {
    const existing = this.meshBuckets.get(bucketKey);
    if (existing) return existing;

    const geometry = this.geometryCache.get(modelPath);
    if (!geometry) {
      throw new Error(`[RockRenderer] Відсутня геометрія для ${modelPath}`);
    }

    // ===== Матеріал для інстансингу =====
    let material: THREE.Material;

    if (this.isDefaultBucket(bucketKey)) {
      // ДЕФОЛТ: один матеріал + per-instance colors (ЛАМБЕРТ, білий, vertexColors=true)
      material = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        flatShading: true,
        vertexColors: true, // <-- критично для instanceColor
      } as any);

      const mesh = new THREE.InstancedMesh(geometry, material, this.cfg.MAX_INSTANCES);

      // ініціалізуємо instanceColor у білий
      const instanceColors = new Float32Array(this.cfg.MAX_INSTANCES * 3);
      for (let i = 0; i < this.cfg.MAX_INSTANCES; i++) {
        const b = i * 3;
        instanceColors[b] = 1.0; instanceColors[b + 1] = 1.0; instanceColors[b + 2] = 1.0;
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
      mesh.instanceColor.needsUpdate = true;

      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.count = 0;

      this.scene.add(mesh);
      this.meshBuckets.set(bucketKey, mesh);
      this.nextInstanceId.set(bucketKey, 0);
      this.freeInstanceIds.set(bucketKey, []);
      this.highestActiveIndex.set(bucketKey, -1);
      console.log('this.meshBuckets', this.meshBuckets);
      return mesh;
    }

    // ПАЛЕТНИЙ КОШИК: власний матеріал на колір (кеш)
    const keyColor = `#${this.hex6(color ?? 0xffffff)}`;
    const matKey = `${modelPath}|${keyColor}`;

    material = this.materialCacheByColor.get(matKey) ?? new THREE.MeshLambertMaterial({
      color: color ?? 0xffffff,
      flatShading: true,
      vertexColors: false,
    } as any);

    this.materialCacheByColor.set(matKey, material);

    const mesh = new THREE.InstancedMesh(geometry, material, this.cfg.MAX_INSTANCES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;

    this.scene.add(mesh);
    this.meshBuckets.set(bucketKey, mesh);
    this.nextInstanceId.set(bucketKey, 0);
    this.freeInstanceIds.set(bucketKey, []);
    this.highestActiveIndex.set(bucketKey, -1);
    return mesh;
  }

  private getNextInstanceId(bucketKey: string): number {
    const free = this.freeInstanceIds.get(bucketKey);
    if (free && free.length > 0) return free.pop()!;

    const next = this.nextInstanceId.get(bucketKey) ?? 0;
    if (next < this.cfg.MAX_INSTANCES) {
      this.nextInstanceId.set(bucketKey, next + 1);
      return next;
    }
    return -1;
  }

  private recomputeMeshCount(bucketKey: string): void {
    const mesh = this.meshBuckets.get(bucketKey);
    if (!mesh) return;

    let maxIdx = -1;
    this.instances.forEach((ri) => {
      if (ri.bucketKey === bucketKey && ri.instanceId > maxIdx) maxIdx = ri.instanceId;
    });

    this.highestActiveIndex.set(bucketKey, maxIdx);
    mesh.count = maxIdx + 1;
  }

  private createFallbackMesh(data: RockData, object: SceneObject): THREE.Mesh {
    const { color = 0xfafafa, size = 1.0 } = data;

    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const material = new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    mesh.scale.set(object.scale.x * size, object.scale.y * size, object.scale.z * size);
    mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);

    this.pendingFallbacks.set(object.id, { mesh, object });
    return mesh;
  }

  private replaceAllFallbacksWithInstances(): void {
    const entries = Array.from(this.pendingFallbacks.entries());
    for (const [id, { mesh, object }] of entries) {
      if (mesh.parent === this.scene) this.scene.remove(mesh);
      this.meshes.delete(id);
      this.pendingFallbacks.delete(id);
      this.render(object); // створює інстанс у відповідному кошику
    }
  }

  cleanupInactiveInstances(): void {
    // Проходимо лише по реально вільних слотах (якщо хочеш періодично "обнуляти" матриці)
    this.freeInstanceIds.forEach((ids, bucketKey) => {
      const mesh = this.meshBuckets.get(bucketKey);
      if (!mesh || !ids || ids.length === 0) return;

      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < ids.length; i++) {
        mesh.setMatrixAt(ids[i], zero);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.recomputeMeshCount(bucketKey);
    });
  }

  getPerformanceStats(): { totalInstances: number; activeInstances: number; modelsLoaded: number; buckets: number } {
    let totalInstances = 0;
    this.nextInstanceId.forEach((count) => (totalInstances += count));
    return {
      totalInstances,
      activeInstances: this.instances.size,
      modelsLoaded: this.modelCache.size,
      buckets: this.meshBuckets.size,
    };
  }

  // ----------------------- Utils -----------------------

  private hex6(n: number): string {
    return (n >>> 0).toString(16).padStart(6, '0').toUpperCase();
  }
}
