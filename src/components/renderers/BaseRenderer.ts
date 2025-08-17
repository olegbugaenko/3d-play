import * as THREE from 'three'

export interface SceneObject {
    id: string;
    type: string;
    coordinates: {
        x: number;
        y: number;
        z: number;
    };
    scale: {
        x: number;
        y: number;
        z: number;
    };
    rotation: {
        x: number;
        y: number;
        z: number;
    };
    data: any;
    tags?: string[]; // Теги для швидкого доступу та фільтрації
}

export abstract class BaseRenderer {
    protected scene: THREE.Scene;
    protected meshes: Map<string, THREE.Mesh> = new Map();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    abstract render(object: SceneObject): THREE.Mesh;
    
    update(object: SceneObject): void {
        const mesh = this.meshes.get(object.id);
        if (mesh) {
            // Оновлюємо позицію
            mesh.position.set(object.coordinates.x, object.coordinates.y, object.coordinates.z);
            
            // Оновлюємо масштаб
            mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
            
            // Оновлюємо обертання
            mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
            
            //console.log(`Updated ${object.id} to position (${object.coordinates.x.toFixed(2)}, ${object.coordinates.y.toFixed(2)}, ${object.coordinates.z.toFixed(2)})`);
        } else {
            //console.warn(`Mesh not found for object ${object.id}`, this.meshes);
        }
    }

    remove(id: string): void {
        const mesh = this.meshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this.meshes.delete(id);
        }
    }

    protected addMesh(id: string, mesh: THREE.Mesh): void {
        console.log(`BaseRenderer.addMesh: додаємо меш ${id} до рендерера ${this.constructor.name}`);
        this.meshes.set(id, mesh);
        this.scene.add(mesh);
        console.log(`BaseRenderer.addMesh: тепер у рендерера ${this.constructor.name} є ${this.meshes.size} мешів`);
    }

    // Отримуємо меш за ID
    getMeshById(id: string): THREE.Mesh | null {
        const mesh = this.meshes.get(id) || null;
        console.log(`BaseRenderer.getMeshById: шукаємо меш ${id} в ${this.constructor.name}, знайдено: ${mesh ? 'так' : 'ні'}`);
        return mesh;
    }
}
