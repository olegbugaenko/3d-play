import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';

export interface StoneData {
    modelPath?: string;
    color?: number;
    size?: number;
    smoothness?: number;
}

export interface StoneInstance {
    id: string;
    position: THREE.Vector3;
    scale: THREE.Vector3;
    rotation: THREE.Euler;
    color: number;
    visible: boolean;
}

export class InstancedStoneRenderer extends BaseRenderer {
    private loader: GLTFLoader;
    private modelCache: Map<string, THREE.Group> = new Map();
    private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
    private instanceData: Map<string, Map<string, StoneInstance>> = new Map();
    private maxInstances = 1000; // Максимальна кількість екземплярів на меш

    constructor(scene: THREE.Scene) {
        super(scene);
        this.loader = new GLTFLoader();
    }

    render(object: SceneObject): THREE.Mesh {
        const stoneData: StoneData = object.data || {};
        const modelPath = stoneData.modelPath || '/models/stone2.glb';
        
        // Distance-based culling - не рендеримо об'єкти поза 200 одиниць
        const camera = this.scene.children.find(child => child.type === 'PerspectiveCamera') as THREE.Camera;
        if (camera) {
            const distance = camera.position.distanceTo(new THREE.Vector3(object.coordinates.x, object.coordinates.y, object.coordinates.z));
            if (distance > 100) {
                // Створюємо невидимий меш для об'єктів поза межами видимості
                const invisibleMesh = new THREE.Mesh();
                invisibleMesh.visible = false;
                this.addMesh(object.id, invisibleMesh);
                return invisibleMesh;
            }
        }
        
        // Створюємо або отримуємо InstancedMesh для цієї моделі
        let instancedMesh = this.instancedMeshes.get(modelPath);
        let instanceData = this.instanceData.get(modelPath);
        
        if (!instancedMesh || !instanceData) {
            // Створюємо новий InstancedMesh (синхронно)
            this.createFallbackInstancedMesh(modelPath);
            instancedMesh = this.instancedMeshes.get(modelPath)!;
            instanceData = this.instanceData.get(modelPath)!;
            
            // Асинхронно завантажуємо модель
            this.loadModelAsync(modelPath);
        }

        // Додаємо екземпляр
        const instance = this.addInstance(modelPath, object, stoneData);
        
        // Створюємо заглушку для сумісності з BaseRenderer
        const dummyMesh = new THREE.Mesh();
        dummyMesh.userData = { instanceId: instance.id, modelPath };
        
        // Додаємо заглушку до BaseRenderer для сумісності
        this.addMesh(object.id, dummyMesh);
        
        return dummyMesh;
    }

    private async loadModelAsync(modelPath: string): Promise<void> {
        // Перевіряємо чи модель вже завантажена
        if (this.modelCache.has(modelPath)) {
            this.createInstancedMeshFromModel(modelPath, this.modelCache.get(modelPath)!);
            return;
        }

        // Завантажуємо модель
        try {
            const gltf = await this.loadModel(modelPath);
            this.modelCache.set(modelPath, gltf.scene);
            this.createInstancedMeshFromModel(modelPath, gltf.scene);
        } catch (error) {
            console.error(`Failed to load model ${modelPath}:`, error);
            // Заглушка вже створена, тому просто логуємо помилку
        }
    }

    private createInstancedMeshFromModel(modelPath: string, model: THREE.Group): void {
        // Створюємо геометрію з моделі
        const geometry = this.extractGeometryFromModel(model);
        
        // Створюємо матеріал
        const material = new THREE.MeshLambertMaterial({ 
            color: 0x8B4513,
            transparent: true,
            opacity: 0.9
        });

        // Створюємо InstancedMesh
        const instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = false;

        this.instancedMeshes.set(modelPath, instancedMesh);
        this.instanceData.set(modelPath, new Map());
        this.scene.add(instancedMesh);
        
        console.log(`Created InstancedMesh for ${modelPath} with max ${this.maxInstances} instances`);
    }

    private createFallbackInstancedMesh(modelPath: string): void {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ 
            color: 0x8B4513,
            transparent: true,
            opacity: 0.9
        });

        const instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = false;

        this.instancedMeshes.set(modelPath, instancedMesh);
        this.instanceData.set(modelPath, new Map());
        this.scene.add(instancedMesh);
        
        console.log(`Created fallback InstancedMesh for ${modelPath} with max ${this.maxInstances} instances`);
    }

    private extractGeometryFromModel(model: THREE.Group): THREE.BufferGeometry {
        // Простий спосіб отримати геометрію з GLB моделі
        const geometries: THREE.BufferGeometry[] = [];
        
        model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry) {
                geometries.push(child.geometry);
            }
        });

        if (geometries.length === 0) {
            return new THREE.BoxGeometry(1, 1, 1);
        }

        // Поки що використовуємо першу геометрію
        // TODO: Реалізувати об'єднання геометрій через BufferGeometryUtils
        return geometries[0];
    }

    private loadModel(path: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.loader.load(path, resolve, undefined, reject);
        });
    }

    private addInstance(modelPath: string, object: SceneObject, stoneData: StoneData): StoneInstance {
        const instanceData = this.instanceData.get(modelPath)!;
        const instancedMesh = this.instancedMeshes.get(modelPath)!;
        
        // Знаходимо вільний індекс
        let instanceIndex = -1;
        for (let i = 0; i < this.maxInstances; i++) {
            if (!Array.from(instanceData.values()).some(inst => inst.id === `${object.id}_${i}`)) {
                instanceIndex = i;
                break;
            }
        }

        if (instanceIndex === -1) {
            console.warn(`No free instance slots for ${modelPath}`);
            // Створюємо заглушку
            return this.createFallbackInstance(object, stoneData);
        }

        // Створюємо екземпляр
        const instance: StoneInstance = {
            id: `${object.id}_${instanceIndex}`,
            position: new THREE.Vector3(object.coordinates.x, object.coordinates.y, object.coordinates.z),
            scale: new THREE.Vector3(object.scale.x, object.scale.y, object.scale.z),
            rotation: new THREE.Euler(object.rotation.x, object.rotation.y, object.rotation.z),
            color: stoneData.color || 0x8B4513,
            visible: true
        };

        // Оновлюємо матрицю трансформації
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion().setFromEuler(instance.rotation);
        matrix.compose(instance.position, quaternion, instance.scale);
        instancedMesh.setMatrixAt(instanceIndex, matrix);

        // Оновлюємо колір
        instancedMesh.setColorAt(instanceIndex, new THREE.Color(instance.color));

        // Зберігаємо дані екземпляра
        instanceData.set(instance.id, instance);

        // Позначаємо що потрібно оновити
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        // console.log(`Added stone instance ${instance.id} to ${modelPath} at index ${instanceIndex}`);
        return instance;
    }

    // Метод для оновлення scale на основі відстані до камери
    private updateInstanceScale(instance: StoneInstance, camera: THREE.Camera): void {
        const distanceToCamera = camera.position.distanceTo(instance.position);
        const maxDistance = 100;
        const minScale = 0.1; // Мінімальний масштаб для далеких об'єктів
        
        if (distanceToCamera > maxDistance) {
            // Зменшуємо масштаб для далеких об'єктів
            const scaleFactor = Math.max(minScale, 1 - (distanceToCamera - maxDistance) / maxDistance);
            instance.scale.multiplyScalar(scaleFactor);
        }
    }

    private createFallbackInstance(object: SceneObject, stoneData: StoneData): StoneInstance {
        // Створюємо звичайний меш як заглушку
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ 
            color: stoneData.color || 0x8B4513 
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
        mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
        mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        
        this.scene.add(mesh);
        
        return {
            id: object.id,
            position: mesh.position,
            scale: mesh.scale,
            rotation: mesh.rotation,
            color: stoneData.color || 0x8B4513,
            visible: true
        };
    }

    update(object: SceneObject): void {
        // Оновлення для InstancedMesh не потрібне, оскільки всі дані вже в instanceMatrix
    }

    remove(id: string): void {
        // Знаходимо та видаляємо екземпляр з усіх InstancedMesh
        for (const [modelPath, instanceData] of this.instanceData) {
            const instance = Array.from(instanceData.values()).find(inst => inst.id === id);
            if (instance) {
                instanceData.delete(instance.id);
                // Можна також зробити екземпляр невидимим, встановивши scale в 0
                console.log(`Removed instance ${id} from ${modelPath}`);
                break;
            }
        }
    }

    // Метод для оновлення видимості екземплярів на основі frustum culling та distance
    updateInstanceVisibility(camera: THREE.Camera): void {
        for (const [modelPath, instancedMesh] of this.instancedMeshes) {
            const instanceData = this.instanceData.get(modelPath);
            if (!instanceData) continue;

            // Простий frustum culling - можна покращити
            const frustum = new THREE.Frustum();
            frustum.setFromProjectionMatrix(
                new THREE.Matrix4().multiplyMatrices(
                    camera.projectionMatrix,
                    camera.matrixWorldInverse
                )
            );

            let visibleCount = 0;
            const maxDistance = 100; // Максимальна відстань для видимості каменів (не рендеримо поза террейном)
            
            for (const [instanceId, instance] of instanceData) {
                if (!instance.visible) continue;
                
                // Перевіряємо чи в frustum
                if (!frustum.containsPoint(instance.position)) continue;
                
                // Перевіряємо відстань до камери
                const distanceToCamera = camera.position.distanceTo(instance.position);
                if (distanceToCamera > maxDistance) continue;
                
                visibleCount++;
            }

            // Оновлюємо кількість видимих екземплярів
            instancedMesh.count = visibleCount;
        }
    }
}
