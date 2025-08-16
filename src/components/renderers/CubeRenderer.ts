import * as THREE from 'three'
import { BaseRenderer, SceneObject } from './BaseRenderer'

export class CubeRenderer extends BaseRenderer {
    render(object: SceneObject): THREE.Mesh {
        // Перевіряємо чи вже існує меш для цього об'єкта
        const existingMesh = this.meshes.get(object.id);
        if (existingMesh) {
            this.update(object);
            return existingMesh;
        }

        // Створюємо геометрію куба
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        
        // Створюємо матеріал з кольором з data
        const material = new THREE.MeshLambertMaterial({ 
            color: object.data?.color || 0x00ff00 
        });
        
        // Створюємо меш
        const mesh = new THREE.Mesh(geometry, material);
        
        // Встановлюємо позицію, масштаб та обертання
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        // Додаємо тіні
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Додаємо до сцени та зберігаємо посилання
        this.addMesh(object.id, mesh);
        
        return mesh;
    }
}
