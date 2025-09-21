import * as THREE from 'three'
import { TSceneObject } from '@logic/systems/scene/scene.types'
import { HudRegistry } from './hud/HudRegistry'

export abstract class BaseRenderer {
    protected scene: THREE.Scene;
    protected renderer?: THREE.WebGLRenderer;
    protected meshes: Map<string, THREE.Object3D> = new Map();
    protected hudRegistry: HudRegistry;

    constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.hudRegistry = new HudRegistry(scene);
    }

    abstract render(object: TSceneObject): THREE.Object3D;
    
    update(object: TSceneObject): void {
        const mesh = this.meshes.get(object.id);
        if (mesh) {
            // Оновлюємо позицію
            mesh.position.set(object.coordinates.x, object.coordinates.y + (object.bottomAnchor ?? 0), object.coordinates.z);
            
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
            this.hudRegistry.detachFromObjectGraph(mesh);
            this.scene.remove(mesh);
            this.meshes.delete(id);
        }
    }

    protected addMesh(id: string, mesh: THREE.Object3D): void {
        this.meshes.set(id, mesh);
        this.scene.add(mesh);
    }

    // Отримуємо об'єкт за ID
    getMeshById(id: string): THREE.Object3D | null {
        const mesh = this.meshes.get(id) || null;
        // console.log(`BaseRenderer.getMeshById: шукаємо об'єкт ${id} в ${this.constructor.name}, знайдено: ${mesh ? 'так' : 'ні'}`);
        return mesh;
    }

    // -------------------------
    // Очищення ресурсів (важливо для HMR!)
    // -------------------------
    public dispose(): void {
        for (const [_id, mesh] of this.meshes) {
            this.hudRegistry.detachFromObjectGraph(mesh);
            this.scene.remove(mesh);
        }

        this.meshes.clear();
        this.hudRegistry.dispose();
    }
}
