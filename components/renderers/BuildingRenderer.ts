import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export class BuildingRenderer extends BaseRenderer {
    private geometry: THREE.BoxGeometry;
    private material: THREE.MeshBasicMaterial;

    constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
        super(scene, renderer);
        
        // Створюємо геометрію та матеріал для будівель
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffff00, // Жовтий колір
            transparent: true,
            opacity: 0.8,
            depthTest: true,
            depthWrite: true
        });
    }

    render(object: SceneObject): THREE.Object3D {
        // Створюємо меш для будівлі
        const mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Встановлюємо позицію, масштаб та обертання
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        // Додаємо меш до сцени та зберігаємо посилання
        this.addMesh(object.id, mesh);
        
        return mesh;
    }

    // Очищення ресурсів
    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
        
        // Очищаємо всі меші
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
        });
        this.meshes.clear();
    }
}
