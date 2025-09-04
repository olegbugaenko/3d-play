import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';
import { BUILDINGS_DB } from '@logic/modules/buildings/buildings-db';

export class BuildingRenderer extends BaseRenderer {
    private geometry: THREE.BoxGeometry;
    private material: THREE.MeshBasicMaterial;
    private loader: GLTFLoader;
    private modelCache: Map<string, THREE.Group> = new Map();

    constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
        super(scene, renderer);
        
        // Створюємо геометрію та матеріал для fallback будівель
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffff00, // Жовтий колір
            transparent: true,
            opacity: 0.8,
            depthTest: true,
            depthWrite: true
        });

        this.loader = new GLTFLoader();
    }

    render(object: SceneObject): THREE.Object3D {
        // Отримуємо дані будівлі з БД
        const buildingData = object.data;
        const buildingType = buildingData?.typeId || buildingData?.buildingType || 'storage';
        const buildingConfig = BUILDINGS_DB.get(buildingType);
        
        if (!buildingConfig) {
            console.warn(`Building type ${buildingType} not found in database`);
            return this.createFallbackMesh(object);
        }

        // Перевіряємо чи є модель для цього типу будівлі
        const modelName = buildingConfig.ui?.modelName;
        if (!modelName) {
            console.warn(`No model specified for building type ${buildingType}`);
            return this.createFallbackMesh(object);
        }

        // Створюємо контейнер для будівлі
        const containerMesh = new THREE.Group();
        
        // Встановлюємо позицію, масштаб та обертання контейнера з об'єкта
        // Додаємо botomAnchor для зміщення по осі Y
        const bottomAnchor = buildingConfig.ui?.botomAnchor || 0;
        containerMesh.position.set(
            object.coordinates.x, 
            object.coordinates.y + bottomAnchor, 
            object.coordinates.z
        );
        containerMesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        containerMesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        this.addMesh(object.id, containerMesh);

        // Створюємо fallback меш
        const fallbackMesh = this.createFallbackMesh(object);
        fallbackMesh.name = 'fallback';
        containerMesh.add(fallbackMesh);

        // Завантажуємо 3D модель
        const modelPath = modelName.startsWith('/') ? modelName : `/${modelName}`;
        this.loader.load(
            modelPath,
            (gltf) => {
                // Видаляємо fallback
                const fallback = containerMesh.getObjectByName('fallback');
                if (fallback) {
                    containerMesh.remove(fallback);
                }
                
                // Додаємо GLB модель
                const model = gltf.scene;
                
                // Застосовуємо масштаб з конфігурації (об'єкт масштаб застосується до контейнера)
                const configScale = buildingConfig.ui?.defaultScale || { x: 1, y: 1, z: 1 };
                model.scale.set(configScale.x, configScale.y, configScale.z);
                
                // Застосовуємо тільки додаткове обертання з конфігурації
                // Основне обертання вже застосоване до контейнера
                const configRotation = buildingConfig.ui?.rotationOffset || { x: 0, y: 0, z: 0 };
                model.rotation.set(configRotation.x, configRotation.y, configRotation.z);
                
                // Застосовуємо колір з конфігурації (якщо вказано)
                const color = buildingConfig.ui?.color;
                if (color) {
                    const hexColor = parseInt(color.replace('#', '0x'));
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh && child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => {
                                    if (mat instanceof THREE.Material && 'color' in mat) {
                                        (mat as any).color.setHex(hexColor);
                                    }
                                });
                            } else {
                                if ('color' in child.material) {
                                    (child.material as any).color.setHex(hexColor);
                                }
                            }
                        }
                    });
                }
                
                containerMesh.add(model);
            },
            undefined,
            (error) => {
                console.warn(`Failed to load building model ${modelPath}: ${(error as Error).message}`);
                // Fallback залишається
            }
        );

        return containerMesh;
    }

    private createFallbackMesh(object: SceneObject): THREE.Mesh {
        const mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Fallback меш буде розташований відносно контейнера, тому позиція 0,0,0
        mesh.position.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mesh.rotation.set(0, 0, 0);
        
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
        
        // Очищаємо кеш моделей
        this.modelCache.clear();
    }
}
