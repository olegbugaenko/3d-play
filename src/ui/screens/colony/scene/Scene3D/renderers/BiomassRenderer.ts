import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BaseRenderer } from './BaseRenderer'
import { TSceneObject } from '@logic/systems/scene/scene.types'
import { MapLogic } from '@logic/systems/map/map-logic'
import { removeBakedShadow } from './utils/bakedShadows'
import type { ShadowQuality } from '@systems/graphics'

interface BiomassData {
  resourceId?: string;
  resourceAmount?: number;
  modelPath?: string;
}

interface BiomassInstance {
  id: string;
  object: TSceneObject;
  mesh: THREE.Object3D;
}

type ShadowOptions = { intensity?: number; softness?: number; minSize?: number; offset?: number };

export class BiomassRenderer extends BaseRenderer {
  private loader: GLTFLoader;
  
  // Кеш завантажених моделей
  private modelCache: Map<string, THREE.Group> = new Map();
  
  // Активні інстанси
  private instances: Map<string, BiomassInstance> = new Map();
  
  // Фоллбеки, що чекають заміни
  private pendingFallbacks: Map<string, { mesh: THREE.Mesh; object: TSceneObject }> = new Map();

  private modelsReady = false;

  // Моделі біомаси - використовуємо централізований список з MapLogic
  private readonly BIOMASS_MODELS = MapLogic.BIOMASS_MODELS;

  private readonly shadowBox = new THREE.Box3();
  private readonly shadowSize = new THREE.Vector3();
  private readonly shadowCenter = new THREE.Vector3();

  private shadowMode: ShadowQuality = 'none';
  private shadowConfigs = new Map<string, ShadowOptions>();

  private computeShadowFootprint(source: THREE.Object3D) {
    source.updateWorldMatrix(true, true)
    this.shadowBox.setFromObject(source)
    this.shadowBox.getSize(this.shadowSize)
    this.shadowCenter.set(0, 0, 0)
    this.shadowBox.getCenter(this.shadowCenter)

    return {
      width: this.shadowSize.x,
      depth: this.shadowSize.z,
      minY: this.shadowBox.min.y,
      centerX: this.shadowCenter.x,
      centerZ: this.shadowCenter.z,
    }
  }

  private applyShadow(
    instanceId: string,
    target: THREE.Object3D,
    _footprint: { width: number; depth: number; minY: number; centerX: number; centerZ: number },
    options?: ShadowOptions
  ) {
    void _footprint;
    this.shadowConfigs.set(instanceId, options ?? {});

    const enableDynamic = this.shadowMode === 'detailed';
    this.setShadowFlags(target, enableDynamic);
    removeBakedShadow(target);
  }

  private setShadowFlags(target: THREE.Object3D, enabled: boolean) {
    target.traverse((child) => {
      if ((child as any).userData?.bakedShadow) return;
      if (child instanceof THREE.Mesh) {
        child.castShadow = enabled;
        child.receiveShadow = enabled;
      }
    });
  }

  public setShadowMode(mode: ShadowQuality): void {
    this.shadowMode = mode;

    for (const instance of this.instances.values()) {
      removeBakedShadow(instance.mesh);
      const footprint = this.computeShadowFootprint(instance.mesh);
      const options = this.shadowConfigs.get(instance.id);
      this.applyShadow(instance.id, instance.mesh, footprint, options);
    }

    for (const [id, { mesh }] of this.pendingFallbacks) {
      removeBakedShadow(mesh);
      const footprint = this.computeShadowFootprint(mesh);
      const options = this.shadowConfigs.get(id);
      this.applyShadow(id, mesh, footprint, options);
    }
  }

  constructor(scene: THREE.Scene) {
    super(scene);
    this.loader = new GLTFLoader();
    this.initializeModels();
  }

  // ----------------------- Loading -----------------------

  private async initializeModels(): Promise<void> {
    try {
      console.log('[BiomassRenderer] Завантаження моделей біомаси...');
      
      const loadPromises = this.BIOMASS_MODELS.map(async (modelPath) => {
        try {
          const gltf = await this.loader.loadAsync(modelPath);
          const clonedScene = gltf.scene.clone();
          
          // Оптимізуємо модель
          clonedScene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });
          
          this.modelCache.set(modelPath, clonedScene);
          console.log(`[BiomassRenderer] Завантажено модель: ${modelPath}`);
        } catch (error) {
          console.error(`[BiomassRenderer] Помилка завантаження ${modelPath}:`, error);
        }
      });
      
      await Promise.all(loadPromises);
      this.modelsReady = true;
      
      // Замінюємо фоллбеки на реальні моделі
      this.replacePendingFallbacks();
      
      console.log('[BiomassRenderer] Всі моделі біомаси завантажені');
    } catch (error) {
      console.error('[BiomassRenderer] Помилка ініціалізації моделей:', error);
    }
  }

  private replacePendingFallbacks(): void {
    for (const [objectId, { mesh, object }] of this.pendingFallbacks) {
      // Видаляємо фоллбек
      if (mesh.parent === this.scene) {
        this.scene.remove(mesh);
      }
      this.meshes.delete(objectId);
      
      // Рендеримо реальну модель
      const newMesh = this.render(object);
      this.instances.set(objectId, {
        id: objectId,
        object,
        mesh: newMesh
      });
    }
    
    this.pendingFallbacks.clear();
  }

  // ----------------------- Public API -----------------------

  render(object: TSceneObject): THREE.Object3D {
    const existing = this.instances.get(object.id);
    if (existing) {
      this.updateInstance(existing);
      return existing.mesh;
    }

    const biomassData: BiomassData = object.data || {};
    const modelPath = biomassData.modelPath || this.BIOMASS_MODELS[0];

    if (!this.modelsReady || !this.modelCache.has(modelPath)) {
      const fallbackMesh = this.createFallbackMesh(biomassData, object);
      this.addMesh(object.id, fallbackMesh);
      this.pendingFallbacks.set(object.id, { mesh: fallbackMesh, object });
      return fallbackMesh;
    }

    // Прибрати фоллбек, якщо був
    if (this.pendingFallbacks.has(object.id)) {
      const { mesh } = this.pendingFallbacks.get(object.id)!;
      if (mesh.parent === this.scene) this.scene.remove(mesh);
      this.pendingFallbacks.delete(object.id);
      this.meshes.delete(object.id);
    }

    // Клонуємо модель з кешу
    const cachedModel = this.modelCache.get(modelPath)!;
    const mesh = cachedModel.clone();

    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    const footprint = this.computeShadowFootprint(mesh);

    // Налаштовуємо позицію, масштаб та обертання
    this.setupMeshTransform(mesh, object);

    this.applyShadow(object.id, mesh, footprint, { intensity: 0.45, softness: 1.25, minSize: 0.35 });
    
    // Додаємо до сцени
    this.addMesh(object.id, mesh);
    
    // Зберігаємо інстанс
    const instance: BiomassInstance = {
      id: object.id,
      object,
      mesh
    };
    
    this.instances.set(object.id, instance);
    
    return mesh;
  }

  update(object: TSceneObject): void {
    const instance = this.instances.get(object.id);
    if (instance) {
      this.updateInstance(instance);
    } else {
      // Якщо інстанс не знайдено, спробуємо оновити через базовий метод
      super.update(object);
    }
  }

  remove(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      this.scene.remove(instance.mesh);
      this.instances.delete(id);
    }

    this.shadowConfigs.delete(id);

    // Видаляємо з базового рендерера
    super.remove(id);
    
    // Видаляємо фоллбек, якщо є
    if (this.pendingFallbacks.has(id)) {
      const { mesh } = this.pendingFallbacks.get(id)!;
      if (mesh.parent === this.scene) {
        this.scene.remove(mesh);
      }
      this.pendingFallbacks.delete(id);
    }
  }

  // ----------------------- Private Methods -----------------------

  private updateInstance(instance: BiomassInstance): void {
    this.setupMeshTransform(instance.mesh, instance.object);
    removeBakedShadow(instance.mesh);
    const footprint = this.computeShadowFootprint(instance.mesh);
    const options = this.shadowConfigs.get(instance.id);
    this.applyShadow(instance.id, instance.mesh, footprint, options);
  }

  private setupMeshTransform(mesh: THREE.Object3D, object: TSceneObject): void {
    // Позиція
    mesh.position.set(
      object.coordinates.x, 
      object.coordinates.y + (object.bottomAnchor ?? 0), 
      object.coordinates.z
    );
    
    // Масштаб
    mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
    
    // Обертання
    mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
  }

  private createFallbackMesh(_biomassData: BiomassData, object: TSceneObject): THREE.Mesh {
    // Створюємо простий фоллбек - зелений куб
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshLambertMaterial({ 
      color: 0x228B22, // Зелений колір біомаси
      transparent: true,
      opacity: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const footprint = this.computeShadowFootprint(mesh);

    // Налаштовуємо позицію
    this.setupMeshTransform(mesh, object);

    this.applyShadow(object.id, mesh, footprint, { intensity: 0.38, softness: 1.3, minSize: 0.3 });

    return mesh;
  }

  // ----------------------- Cleanup -----------------------

  public dispose(): void {
    // Очищаємо інстанси
    for (const [_id, instance] of this.instances) {
      this.scene.remove(instance.mesh);
    }
    this.instances.clear();
    
    // Очищаємо фоллбеки
    for (const [_id, { mesh }] of this.pendingFallbacks) {
      if (mesh.parent === this.scene) {
        this.scene.remove(mesh);
      }
    }
    this.pendingFallbacks.clear();
    
    // Очищаємо кеш моделей
    this.modelCache.clear();
    
    // Викликаємо базовий dispose
    super.dispose();
  }
}
