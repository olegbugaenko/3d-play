import * as THREE from 'three';
import { BaseRenderer, SceneObject } from './BaseRenderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface RockData {
    color?: number;
    size?: number;
    smoothness?: number;
    modelPath?: string;
}

export class RockRenderer extends BaseRenderer {
    render(object: SceneObject): THREE.Mesh {
        const existingMesh = this.meshes.get(object.id);
        if (existingMesh) {
            this.scene.remove(existingMesh);
        }

        const rockData: RockData = object.data || {};
        const mesh = this.createRockMesh(rockData, object);
        
        // Додаємо до сцени та зберігаємо
        this.addMesh(object.id, mesh);
        
        return mesh;
    }

    private createRockMesh(data: RockData, object: SceneObject): THREE.Mesh {
        const {
            color = 0x4A4A4A,
            size = 1.0,
            smoothness = 0.6,
            modelPath = '/models/stone.glb'
        } = data;

        // Створюємо тимчасовий fallback меш
        const fallbackGeometry = new THREE.SphereGeometry(size, 8, 8);
        const fallbackMaterial = new THREE.MeshLambertMaterial({
            color: color,
            flatShading: smoothness < 0.5,
            transparent: true,
            opacity: 0.3,
            wireframe: true
        });
        
        const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        fallbackMesh.name = 'fallback';
        
        // Створюємо контейнер для GLB моделі
        const containerMesh = new THREE.Group();
        containerMesh.add(fallbackMesh);
        
        // Завантажуємо GLB модель
        const loader = new GLTFLoader();
        loader.load(
            modelPath,
            (gltf) => {
                // Видаляємо fallback
                const fallback = containerMesh.getObjectByName('fallback');
                if (fallback) {
                    containerMesh.remove(fallback);
                }
                
                // Додаємо GLB модель
                const model = gltf.scene;
                model.scale.setScalar(size);
                
                // Застосовуємо рандомний колір до всіх матеріалів
                model.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat instanceof THREE.Material && 'color' in mat) {
                                    (mat as any).color.setHex(color);
                                }
                            });
                        } else {
                            if ('color' in child.material) {
                                (child.material as any).color.setHex(color);
                            }
                        }
                    }
                });
                
                containerMesh.add(model);
            },
            undefined,
            (error) => {
                console.warn(`Failed to load stone model: ${(error as Error).message}`);
                // Fallback залишається
            }
        );
        
        // Встановлюємо позицію, масштаб та обертання з об'єкта
        containerMesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        containerMesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        containerMesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);

        return containerMesh as any;
    }
}
