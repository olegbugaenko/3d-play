import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface RoverData {
    modelPath?: string;
    scale?: number;
    maxSpeed?: number;
    target?: {
        x: number;
        z: number;
    };
    rotatable?: boolean; // Чи може об'єкт обертатися в напрямку руху
    rotationOffset?: number; // Зміщення кута повороту в радіанах (наприклад, Math.PI/2 для 90 градусів)
}

export class RoverRenderer extends BaseRenderer {
    private loader: GLTFLoader;
    private modelCache: Map<string, THREE.Group> = new Map();

    constructor(scene: THREE.Scene) {
        super(scene);
        this.loader = new GLTFLoader();
    }

    render(object: SceneObject): THREE.Mesh {
        const existingMesh = this.meshes.get(object.id);
        if (existingMesh) {
            this.scene.remove(existingMesh);
            this.meshes.delete(object.id); // Видаляємо з Map
        }

        const roverData: RoverData = object.data || {};
        const modelPath = roverData.modelPath || '/models/playtest-rover.glb';
        
        // Перевіряємо чи модель вже завантажена
        if (this.modelCache.has(modelPath)) {
            console.log(`Використовуємо кешовану модель для rover ${object.id}`);
            const cachedModel = this.modelCache.get(modelPath)!;
            const mesh = this.createRoverMesh(cachedModel, roverData);
            this.setupMesh(mesh, object);
            this.addMesh(object.id, mesh); // Додаємо меш до рендерера
            return mesh;
        }

        // Завантажуємо модель
        this.loader.load(
            modelPath,
            (gltf) => {
                console.log(`Модель rover завантажена успішно для ${object.id}`);
                // Кешуємо модель
                this.modelCache.set(modelPath, gltf.scene);
                
                // Створюємо меш
                const mesh = this.createRoverMesh(gltf.scene, roverData);
                this.setupMesh(mesh, object);
                
                // Замінюємо fallback меш на справжню модель
                const existingMesh = this.meshes.get(object.id);
                if (existingMesh) {
                    this.scene.remove(existingMesh);
                    this.meshes.delete(object.id);
                }
                this.addMesh(object.id, mesh);
            },
            (progress) => {
                console.log(`Loading rover model: ${(progress.loaded / progress.total * 100)}%`);
            },
            (error) => {
                console.error(`Error loading rover model for ${object.id}:`, error);
                console.error('Model path:', modelPath);
                // Створюємо заглушку якщо модель не завантажилася
                const fallbackMesh = this.createFallbackMesh(roverData);
                this.setupMesh(fallbackMesh, object);
                // Не додаємо fallback mesh тут, бо він вже доданий в основному потоці
            }
        );

        // Повертаємо заглушку поки модель завантажується
        console.log(`Створюємо fallback mesh для rover ${object.id} поки модель завантажується`);
        const fallbackMesh = this.createFallbackMesh(roverData);
        this.setupMesh(fallbackMesh, object);
        this.addMesh(object.id, fallbackMesh);
        return fallbackMesh;
    }

    private createRoverMesh(model: THREE.Group, data: RoverData): THREE.Mesh {
        const scale = data.scale || 1.0;
        
        // Клонуємо модель
        const clonedModel = model.clone();
        clonedModel.scale.setScalar(scale);
        
        // Створюємо невидимий меш-контейнер для моделі
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1); // Дуже маленький, майже невидимий
        const material = new THREE.MeshBasicMaterial({ 
            transparent: true, 
            opacity: 0.0, // Повністю прозорий
            visible: false // Повністю невидимий
        });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Додаємо модель як дочірній об'єкт
        mesh.add(clonedModel);
        
        return mesh;
    }

    private createFallbackMesh(data: RoverData): THREE.Mesh {
        const scale = data.scale || 1.0;
        
        // Створюємо заглушку - простий куб (більш прозорий)
        const geometry = new THREE.BoxGeometry(1, 0.5, 1.5);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x444444,
            transparent: true,
            opacity: 0.3, // Більш прозорий
            wireframe: true // Додаємо каркас для кращого розуміння
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(scale);
        
        return mesh;
    }

    private setupMesh(mesh: THREE.Mesh, object: SceneObject): void {
        // Встановлюємо позицію, масштаб та обертання
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        // Додаємо тіні
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }
}
