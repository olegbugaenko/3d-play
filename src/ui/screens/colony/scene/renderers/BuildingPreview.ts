import * as THREE from 'three';

export class BuildingPreview {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private isVisible: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public show(position: { x: number; y: number; z: number }, buildingData: any): void {
    this.hide(); // Приховуємо попередню будівлю

    // Створюємо геометрію на основі даних будівлі
    const geometry = this.createGeometry(buildingData);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Зелений колір для превью
      transparent: true,
      opacity: 0.5,
      wireframe: false
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

  public updatePosition(position: { x: number; y: number; z: number }): void {
    if (this.mesh && this.isVisible) {
      this.mesh.position.set(position.x, position.y, position.z);
    }
  }

  public hide(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    this.isVisible = false;
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
  }
}
