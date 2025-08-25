import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface RoverData {
  modelPath?: string;
  scale?: number;
  maxSpeed?: number;
  target?: { x: number; z: number };
  rotatable?: boolean;          // Чи може об'єкт обертатися в напрямку руху
  rotationOffset?: number;      // Зміщення кута повороту в радіанах (наприклад, Math.PI/2)
  storage?: Record<string, number>; // Поточні ресурси в сховищі
  maxCapacity?: number;         // Максимальна ємність сховища
}

type ProgressBarOpts = {
  parentScale: number;
  barY: number;
  barWidth?: number;
  barHeight?: number;
};

export class RoverRenderer extends BaseRenderer {
  private loader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();

  constructor(scene: THREE.Scene) {
    super(scene);
    this.loader = new GLTFLoader();
  }

  render(object: SceneObject): THREE.Mesh {
    const roverData: RoverData = object.data || {};
    const modelPath = roverData.modelPath || '/models/playtest-rover.glb';

    // якщо вже кешовано — створюємо одразу
    if (this.modelCache.has(modelPath)) {
      const cachedModel = this.modelCache.get(modelPath)!;
      const mesh = this.createRoverMesh(cachedModel, roverData);
      this.setupMesh(mesh, object);
      this.addMesh(object.id, mesh);
      return mesh;
    }

    // асинхронно завантажуємо модель
    this.loader.load(
      modelPath,
      (gltf) => {
        this.modelCache.set(modelPath, gltf.scene);
        const mesh = this.createRoverMesh(gltf.scene, roverData);
        this.setupMesh(mesh, object);

        // замінюємо fallback
        const prev = this.meshes.get(object.id);
        if (prev) {
          this.scene.remove(prev);
          this.meshes.delete(object.id);
        }
        this.addMesh(object.id, mesh);
      },
      (progress) => {
        const pct = progress.total ? (progress.loaded / progress.total) * 100 : 0;
        console.log(`Loading rover model: ${pct.toFixed(1)}%`);
      },
      (error) => {
        console.error(`Error loading rover model for ${object.id}:`, error);
        console.error('Model path:', modelPath);
        // Залишимо fallback, який вже буде створений нижче
      }
    );

    // Повертаємо fallback поки модель вантажиться
    const fallbackMesh = this.createFallbackMesh(roverData);
    this.setupMesh(fallbackMesh, object);
    this.addMesh(object.id, fallbackMesh);
    return fallbackMesh;
  }

  // -------------------------
  // Створення основного меша
  // -------------------------
  private createRoverMesh(model: THREE.Group, data: RoverData): THREE.Mesh {
    const scale = data.scale || 1.0;

    // клон моделі + масштаб
    const clonedModel = model.clone(true);
    clonedModel.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    clonedModel.scale.setScalar(scale);

    // контейнер — невидимий, але НЕ кулиться фрустумом
    const containerGeom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const containerMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, visible: false });
    const mesh = new THREE.Mesh(containerGeom, containerMat);
    mesh.frustumCulled = false; // ключове!

    // додаємо модель
    mesh.add(clonedModel);

    // точна висота для позиції прогрес-бару
    const bbox = new THREE.Box3().setFromObject(clonedModel);
    const modelHeight = Math.max(0.001, bbox.max.y - bbox.min.y);
    const barY = bbox.max.y + 0.15 * modelHeight; // трішки над «дахом»

    // додати/оновити прогрес-бар
    this.createOrUpdateProgressBar(mesh, data, { parentScale: scale, barY });

    return mesh;
  }

  // -------------------------
  // Прогрес-бар
  // -------------------------
  private createOrUpdateProgressBar(mesh: THREE.Mesh, data: RoverData, opts: ProgressBarOpts): void {
    if (!data.storage || !data.maxCapacity) {
      // якщо немає даних — прибираємо бар (якщо був)
      const prev = mesh.getObjectByName('progressBar');
      if (prev) mesh.remove(prev);
      return;
    }

    const total = Object.values(data.storage).reduce((s, v) => s + v, 0);
    const progress = Math.min(Math.max(total / data.maxCapacity, 0), 1);

    // чи існує вже бар?
    const existing = mesh.getObjectByName('progressBar') as THREE.Group | null;
    if (existing) {
      this.applyProgressToBar(existing, progress);
      return;
    }

    // створюємо новий
    const group = this.buildProgressBarGroup(opts);
    this.applyProgressToBar(group, progress);
    mesh.add(group);
  }

  private buildProgressBarGroup(opts: ProgressBarOpts): THREE.Group {
    const { parentScale, barY, barWidth = 1.5, barHeight = 0.12 } = opts;

    const group = new THREE.Group();
    group.name = 'progressBar';

    // бар має фіксований екранний розмір незалежно від масштабу батька
    const inv = 1 / Math.max(parentScale, 1e-6);
    group.scale.set(inv, inv, inv);

    // спільні опції матеріалів — поверх усього, прозорі, двосторонні
    const commonMatOpts: THREE.MeshBasicMaterialParameters = {
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    };

    // фон
    const bgGeom = new THREE.PlaneGeometry(barWidth, barHeight);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x666666, opacity: 0.8, ...commonMatOpts });
    const bg = new THREE.Mesh(bgGeom, bgMat);
    bg.position.set(0, barY, 0);

    // заповнення (через півод для лівого вирівнювання)
    const fillGeom = new THREE.PlaneGeometry(barWidth, barHeight);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xff8c00, opacity: 0.95, ...commonMatOpts });
    const fill = new THREE.Mesh(fillGeom, fillMat);
    const fillPivot = new THREE.Group();
    fillPivot.position.set(-barWidth / 2, barY, 0); // тепер (0,barY) — лівий край
    fill.position.x = barWidth / 2;                 // ставимо саму планку назад
    fillPivot.add(fill);

    // легка «рамка» (опційно, вигляд кращий)
    const borderGeom = new THREE.PlaneGeometry(barWidth + 0.02, barHeight + 0.02);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.25, ...commonMatOpts });
    const border = new THREE.Mesh(borderGeom, borderMat);
    border.position.set(0, barY, -0.0005); // трохи ззаду

    group.add(border);
    group.add(bg);
    group.add(fillPivot);

    // білбординг: повертаємось лицем до камери кожен кадр
    group.onBeforeRender = (_r, _s, camera) => {
      group.quaternion.copy(camera.quaternion);
    };

    // рендеримо пізніше за модель
    group.renderOrder = 1000;

    return group;
  }

  private applyProgressToBar(group: THREE.Group, progress: number): void {
    // структура: [border=0, bg=1, fillPivot=2]
    const fillPivot = group.children[2] as THREE.Group;
    const fill = fillPivot.children[0] as THREE.Mesh;
    fill.scale.x = Math.max(progress, 0.0001); // 0 не даємо, щоб не «зникало»
  }

  private updateProgressBar(mesh: THREE.Object3D, data: RoverData): void {
    if (!(mesh instanceof THREE.Mesh)) return;
    const group = mesh.getObjectByName('progressBar') as THREE.Group | null;

    if (!data.maxCapacity) {
      if (group) mesh.remove(group);
      return;
    }

    if(!data.storage) {
        data.storage = {};
    }

    const total = Object.values(data.storage).reduce((s, v) => s + v, 0);
    const progress = Math.min(Math.max(total / data.maxCapacity, 0), 1);

    
    if (group) {
      this.applyProgressToBar(group, progress);
    } else {
      // якщо бару ще немає (наприклад, було додано storage пізніше)
      // робимо просту оцінку barY (без bbox) — 1.2
      this.createOrUpdateProgressBar(mesh, data, { parentScale: 1.0, barY: 1.2 });
    }
  }

  // -------------------------
  // Fallback mesh (куб)
  // -------------------------
  private createFallbackMesh(data: RoverData): THREE.Mesh {
    const scale = data.scale || 1.0;

    const geometry = new THREE.BoxGeometry(1, 0.5, 1.5);
    const material = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // щоб бар не зникав
    mesh.scale.setScalar(scale);

    // бар на фіксованій висоті (для заглушки)
    this.createOrUpdateProgressBar(mesh, data, { parentScale: scale, barY: 0.9 });

    return mesh;
  }

  // -------------------------
  // Позиціювання/обертання/тіні
  // -------------------------
  private setupMesh(mesh: THREE.Mesh, object: SceneObject): void {
    mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);

    // TEMPORARILY DISABLED SHADOWS FOR FPS TESTING
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  private update(object: SceneObject) {
    const existingMesh = this.meshes.get(object.id) as THREE.Mesh | undefined;
    if (existingMesh) {
      // оновлюємо лише прогрес-бар (без перестворення)
      this.updateProgressBar(existingMesh, object.data as RoverData);
      return existingMesh;
    }
  }
}
