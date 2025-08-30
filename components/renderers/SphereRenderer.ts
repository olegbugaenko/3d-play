import * as THREE from 'three'
import { BaseRenderer, SceneObject } from './BaseRenderer'

export class SphereRenderer extends BaseRenderer {
    render(object: SceneObject): THREE.Object3D {
        // Перевіряємо чи вже існує меш для цього об'єкта
        const existingMesh = this.meshes.get(object.id);
        if (existingMesh) {
            this.update(object);
            return existingMesh;
        }

        // Створюємо геометрію сфери
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        
        // Створюємо матеріал з кольором з data
        const material = new THREE.MeshLambertMaterial({ 
            color: object.data?.color || 0xff0000 
        });
        
        // Створюємо меш
        const mesh = new THREE.Mesh(geometry, material);
        
        // Встановлюємо позицію, масштаб та обертання
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        // Додаємо тіні
        // TEMPORARILY DISABLED SHADOWS FOR FPS TESTING
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        
        // Додаємо до сцени та зберігаємо посилання
        this.addMesh(object.id, mesh);
        
        return mesh;
    }
}
