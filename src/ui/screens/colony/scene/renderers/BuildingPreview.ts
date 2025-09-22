import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class BuildingPreview {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private isVisible: boolean = false;
  private gltfLoader: GLTFLoader;
  private loadedModels: Map<string, THREE.Group> = new Map();
  private loadingModels: Set<string> = new Set();
  
  // Стан валідності розміщення та збереження оригінальних матеріалів
  private isPlacementValid: boolean = true;
  private originalMaterials: Map<string, { color: THREE.Color; opacity: number }> = new Map();

  constructor(scene: THREE.Scene, loadingManager?: THREE.LoadingManager) {
    this.scene = scene;
    this.gltfLoader = new GLTFLoader(loadingManager ?? undefined);
  }

  public show(position: { x: number; y: number; z: number }, buildingData: any): void {
    this.hide(); // Приховуємо попередню будівлю


    // Перевіряємо чи є модель для цієї будівлі
    if (buildingData.ui?.modelName) {
      this.loadAndShowModel(position, buildingData);
    } else {
      // Fallback до простої геометрії якщо немає моделі
      this.showSimpleGeometry(position, buildingData);
    }
  }

  public showWithRotation(
    position: { x: number; y: number; z: number }, 
    rotation: THREE.Euler, 
    buildingData: any
  ): void {
    // Спочатку показуємо будівлю
    this.show(position, buildingData);
    
    // Потім встановлюємо орієнтацію
    if (this.mesh && this.isVisible) {
      if (this.mesh instanceof THREE.Mesh) {
        this.mesh.rotation.copy(rotation);
      } else if (this.mesh instanceof THREE.Group) {
        this.mesh.rotation.copy(rotation);
      }
    }
  }

  private loadAndShowModel(position: { x: number; y: number; z: number }, buildingData: any): void {
    const modelPath = buildingData.ui.modelName;
    
    // Перевіряємо чи модель вже завантажена
    if (this.loadedModels.has(modelPath)) {
      this.showLoadedModel(position, buildingData, this.loadedModels.get(modelPath)!);
      return;
    }

    // Завантажуємо модель
    this.gltfLoader.load(
      modelPath,
      (gltf) => {
        this.loadedModels.set(modelPath, gltf.scene);
        this.showLoadedModel(position, buildingData, gltf.scene);
      },
      (progress) => {
      },
      (error) => {
        console.error('BuildingPreview: Error loading model:', error);
        // Fallback до простої геометрії
        this.showSimpleGeometry(position, buildingData);
      }
    );
  }

  private showLoadedModel(position: { x: number; y: number; z: number }, buildingData: any, model: THREE.Group): void {
    // Клонуємо модель щоб не змінювати оригінал
    const clonedModel = model.clone();
    
    // Застосовуємо масштаб та обертання з даних будівлі
    if (buildingData.ui?.defaultScale) {
      clonedModel.scale.set(
        buildingData.ui.defaultScale.x,
        buildingData.ui.defaultScale.y,
        buildingData.ui.defaultScale.z
      );
    }
    
    if (buildingData.ui?.rotationOffset) {
      clonedModel.rotation.set(
        buildingData.ui.rotationOffset.x,
        buildingData.ui.rotationOffset.y,
        buildingData.ui.rotationOffset.z
      );
    }

    // Встановлюємо позицію з урахуванням bottomAnchor
    let adjustedY = position.y;
    if (buildingData.ui?.bottomAnchor !== undefined) {
      adjustedY += buildingData.ui.bottomAnchor;
    }
    clonedModel.position.set(position.x, adjustedY, position.z);

    // Застосовуємо прозорість до всіх матеріалів моделі
    clonedModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => this.makeMaterialTransparent(mat));
        } else {
          this.makeMaterialTransparent(child.material);
        }
      }
    });

    this.mesh = clonedModel;
    this.scene.add(clonedModel);
    this.isVisible = true;
  }

  private makeMaterialTransparent(material: THREE.Material): void {
    material.transparent = true;
    material.opacity = 0.6;
    material.needsUpdate = true;
  }

  private showSimpleGeometry(position: { x: number; y: number; z: number }, buildingData: any): void {
    // Створюємо геометрію на основі даних будівлі
    const geometry = this.createGeometry(buildingData);
    
    // Використовуємо колір з даних будівлі або за замовчуванням зелений
    const color = buildingData.ui?.color ? new THREE.Color(buildingData.ui.color) : new THREE.Color(0x00ff00);
    
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
      wireframe: false,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(position.x, position.y, position.z);
    
    // Застосовуємо масштаб та обертання з даних будівлі
    if (buildingData.ui?.defaultScale) {
      this.mesh.scale.set(
        buildingData.ui.defaultScale.x,
        buildingData.ui.defaultScale.y,
        buildingData.ui.defaultScale.z
      );
    }
    
    if (buildingData.ui?.rotationOffset) {
      this.mesh.rotation.set(
        buildingData.ui.rotationOffset.x,
        buildingData.ui.rotationOffset.y,
        buildingData.ui.rotationOffset.z
      );
    }

    this.scene.add(this.mesh);
    this.isVisible = true;
  }

  public updatePosition(position: { x: number; y: number; z: number }, buildingData?: any): void {
    if (this.mesh && this.isVisible) {
      // Встановлюємо позицію з урахуванням bottomAnchor
      let adjustedY = position.y;
      if (buildingData?.ui?.bottomAnchor !== undefined) {
        adjustedY += buildingData.ui.bottomAnchor;
      }
      
      // this.mesh може бути як Mesh, так і Group
      if (this.mesh instanceof THREE.Mesh) {
        this.mesh.position.set(position.x, adjustedY, position.z);
      } else if (this.mesh instanceof THREE.Group) {
        this.mesh.position.set(position.x, adjustedY, position.z);
      }
    }
  }

  public updatePositionAndRotation(
    position: { x: number; y: number; z: number }, 
    rotation: THREE.Euler, 
    buildingData?: any,
    isValid?: boolean
  ): void {
    if (this.mesh && this.isVisible) {
      // Встановлюємо позицію з урахуванням bottomAnchor
      let adjustedY = position.y;
      if (buildingData?.ui?.bottomAnchor !== undefined) {
        adjustedY += buildingData.ui.bottomAnchor;
      }
      
      // this.mesh може бути як Mesh, так і Group
      if (this.mesh instanceof THREE.Mesh) {
        this.mesh.position.set(position.x, adjustedY, position.z);
        this.mesh.rotation.copy(rotation);
      } else if (this.mesh instanceof THREE.Group) {
        this.mesh.position.set(position.x, adjustedY, position.z);
        this.mesh.rotation.copy(rotation);
      }
      
      // Оновлюємо візуальний стиль на основі валідності розміщення
      if (isValid !== undefined) {
        this.setPlacementValid(isValid);
      }
    }
  }

  public hide(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      
      // Очищаємо ресурси в залежності від типу
      if (this.mesh instanceof THREE.Mesh) {
        this.mesh.geometry.dispose();
        if (this.mesh.material) {
          if (Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(mat => mat.dispose());
          } else {
            this.mesh.material.dispose();
          }
        }
      } else if (this.mesh instanceof THREE.Group) {
        // Для Group потрібно очистити всі дочірні об'єкти
        this.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
      
      this.mesh = null;
    }
    this.isVisible = false;
    
    // Очищаємо збережені матеріали при приховуванні
    this.originalMaterials.clear();
    this.isPlacementValid = true;
  }

  /**
   * Встановлює візуальний стиль на основі валідності розміщення
   */
  private setPlacementValid(isValid: boolean): void {
    if (this.isPlacementValid === isValid) return; // оптимізація - не змінюємо якщо стан не змінився
    
    this.isPlacementValid = isValid;
    
    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          
          materials.forEach((mat, index) => {
            const materialKey = `${child.uuid}_${index}`;
            
            if (isValid) {
              // Повертаємо оригінальний колір (якщо збережений)
              if (this.originalMaterials.has(materialKey)) {
                const originalMat = this.originalMaterials.get(materialKey)!;
                mat.color.copy(originalMat.color);
                mat.opacity = originalMat.opacity;
              }
            } else {
              // Зберігаємо оригінальний колір перед зміною
              if (!this.originalMaterials.has(materialKey)) {
                this.originalMaterials.set(materialKey, {
                  color: mat.color.clone(),
                  opacity: mat.opacity
                });
              }
              
              // Червоний колір для невалідного розміщення
              mat.color.setHex(0xff0000);
              mat.opacity = 0.8; // трохи менш прозорий для кращої видимості
            }
            mat.needsUpdate = true;
          });
        }
      });
    }
  }

  private createGeometry(buildingData: any): THREE.BufferGeometry {
    // За замовчуванням створюємо куб
    let geometry: THREE.BufferGeometry;
    
    // Якщо є дані про геометрію - використовуємо їх
    if (buildingData.ui?.geometry) {
      switch (buildingData.ui.geometry) {
        case 'box':
          geometry = new THREE.BoxGeometry(1, 1, 1);
          break;
        case 'cylinder':
          geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
          break;
        case 'sphere':
          geometry = new THREE.SphereGeometry(0.5, 8, 6);
          break;
        default:
          geometry = new THREE.BoxGeometry(1, 1, 1);
      }
    } else {
      // За замовчуванням куб
      geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    return geometry;
  }

  public dispose(): void {
    this.hide();
    // Очищаємо кеш завантажених моделей
    this.loadedModels.clear();
  }

  // Метод для попереднього завантаження моделей
  public preloadModels(buildingTypes: any[]): void {
    buildingTypes.forEach(buildingType => {
      if (buildingType.ui?.modelName && !this.loadedModels.has(buildingType.ui.modelName) && !this.loadingModels.has(buildingType.ui.modelName)) {
        this.loadingModels.add(buildingType.ui.modelName);
        this.gltfLoader.load(
          buildingType.ui.modelName,
          (gltf) => {
            this.loadedModels.set(buildingType.ui.modelName, gltf.scene);
            this.loadingModels.delete(buildingType.ui.modelName);
          },
          undefined,
          (error) => {
            console.error('BuildingPreview: Error preloading model:', buildingType.ui.modelName, error);
            this.loadingModels.delete(buildingType.ui.modelName);
          }
        );
      }
    });
  }

  // Метод для отримання стану завантаження
  public getLoadingState(): { loaded: number; total: number; loading: string[] } {
    const total = this.loadedModels.size + this.loadingModels.size;
    const loaded = this.loadedModels.size;
    const loading = Array.from(this.loadingModels);
    return { loaded, total, loading };
  }
}
