import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';

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

export class RoverRenderer extends BaseRenderer {
  private loader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();

  constructor(scene: THREE.Scene) {
    super(scene);
    this.loader = new GLTFLoader();
  }

  render(object: SceneObject): THREE.Mesh {
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
      this.addMesh(object.id, mesh);

      // Бар ресурсів та бар енергії — створюємо після додавання у сцену
      this.attachOrUpdateProgressBar(mesh, roverData);
      this.attachOrUpdatePowerBar(mesh, roverData);

      console.warn(`ROVER RENDERED: `, object)

      return mesh;
    }

    this.loader.load(
      modelPath,
      (gltf) => {
        this.modelCache.set(modelPath, gltf.scene);
        const mesh = this.createRoverMesh(gltf.scene, roverData);
        this.setupMesh(mesh, object);
        console.warn('Drone now added', object);
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
      },
      (progress) => {
        const pct = progress.total ? (progress.loaded / progress.total) * 100 : 0;
        // Завантаження моделі ровера
      },
      (error) => {
        console.error(`Error loading rover model for ${object.id}:`, error);
      }
    );

    // Fallback
    const fallbackMesh = this.createFallbackMesh(roverData);
    this.setupMesh(fallbackMesh, object);
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

    const clonedModel = model.clone(true);
    clonedModel.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    clonedModel.scale.setScalar(scale);

    const containerGeom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const containerMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, visible: false });
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
    bg.onBeforeRender = (_renderer, _scene, camera) => {
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
      camera.getWorldQuaternion(_qCam);
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
      fill.scale.x = Math.max(progress, 0.0001);
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
      this.attachOrUpdateProgressBar(anchorMesh, data);
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
      this.attachOrUpdatePowerBar(anchorMesh, data);
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
  private setupMesh(mesh: THREE.Mesh, object: SceneObject): void {
    mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
    mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  // -------------------------
  // Tick/Update
  // -------------------------
  public update(object: SceneObject): void {
    super.update(object);
    const existingMesh = this.meshes.get(object.id) as THREE.Mesh | undefined;
    if (existingMesh) {
      this.updateProgressBar(existingMesh, object.data as RoverData);
      this.updatePowerBar(existingMesh, object.data as RoverData);
    }
  }

  // -------------------------
  // Очищення ресурсів (важливо для HMR!)
  // -------------------------
  public dispose(): void {
    // Очищаємо всі індикатори
    for (const [id, mesh] of this.meshes) {
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
    }

    // Очищаємо кеш моделей
    this.modelCache.clear();
    
    // Очищаємо меші
    this.meshes.clear();
  }
}
