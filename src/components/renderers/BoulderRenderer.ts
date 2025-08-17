import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface BoulderData {
    color?: number;
    size?: number;
    roughness?: number;
    segments?: number;
}

export class BoulderRenderer extends BaseRenderer {
    render(object: SceneObject): THREE.Mesh {
        const existingMesh = this.meshes.get(object.id);
        if (existingMesh) {
            this.scene.remove(existingMesh);
        }

        const boulderData: BoulderData = object.data || {};
        const mesh = this.createBoulderMesh(boulderData);
        
        // Встановлюємо позицію, масштаб та обертання
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        // Додаємо до сцени та зберігаємо
        this.addMesh(object.id, mesh);
        
        return mesh;
    }

    private createBoulderMesh(data: BoulderData): THREE.Mesh {
        const {
            color = 0x8B7355, // Кольор каменю
            size = 1.0,
            roughness = 0.3
        } = data;

        // Створюємо базову геометрію (icosphere для більш природної форми)
        const geometry = new THREE.IcosahedronGeometry(size, 1);
        
        // Додаємо випадкові деформації для природності
        const positions = geometry.attributes.position;
        const originalPositions = positions.array.slice();
        
        for (let i = 0; i < positions.count; i++) {
            const x = originalPositions[i * 3];
            const y = originalPositions[i * 3 + 1];
            const z = originalPositions[i * 3 + 2];
            
            // Додаємо випадкові зміни до кожної вершини
            const noiseX = (Math.random() - 0.5) * roughness * size;
            const noiseY = (Math.random() - 0.5) * roughness * size;
            const noiseZ = (Math.random() - 0.5) * roughness * size;
            
            positions.setXYZ(i, x + noiseX, y + noiseY, z + noiseZ);
        }
        
        // Оновлюємо геометрію
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // Створюємо матеріал з текстурою
        const material = new THREE.MeshLambertMaterial({
            color: color,
            flatShading: true, // Плоске затушування для більш "каменевого" вигляду
            transparent: false,
            opacity: 1.0
        });

        // Додаємо випадкове обертання для різноманітності
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        return mesh;
    }
}
