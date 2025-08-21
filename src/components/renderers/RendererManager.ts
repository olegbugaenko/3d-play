import * as THREE from 'three'
import { BaseRenderer, SceneObject } from './BaseRenderer'
import { CubeRenderer } from './CubeRenderer'
import { SphereRenderer } from './SphereRenderer'
import { BoulderRenderer } from './BoulderRenderer'
import { RockRenderer } from './RockRenderer'
import { RoverRenderer } from './RoverRenderer'
import { InstancedStoneRenderer } from './InstancedStoneRenderer'
import { CloudRenderer } from './CloudRenderer'
import { SmokeRenderer } from './SmokeRenderer'
import { FireRenderer } from './FireRenderer'
import { ElectricArcRenderer } from './ArcRenderer'

export class RendererManager {
    public renderers: Map<string, BaseRenderer> = new Map();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.initializeRenderers();
    }

    private initializeRenderers(): void {
        // Реєструємо рендерери для різних типів об'єктів
        //this.registerRenderer('cube', new CubeRenderer(this.scene));
        //this.registerRenderer('sphere', new SphereRenderer(this.scene));
        //this.registerRenderer('boulder', new BoulderRenderer(this.scene));
        //this.registerRenderer('rock', new InstancedStoneRenderer(this.scene)); // Каменюки типу rock з Instanced Rendering
        //this.registerRenderer('rover', new RoverRenderer(this.scene)); // Rover об'єкти
        //this.registerRenderer('cloud', new CloudRenderer(this.scene)); // Хмари
        // this.registerRenderer('smoke', new SmokeRenderer(this.scene)); // Дим
        //this.registerRenderer('fire', new FireRenderer(this.scene)); // Вогонь
        ///this.registerRenderer('electric-arc', new ElectricArcRenderer(this.scene));
        // Тут можна додати інші рендерери: plane, тощо
    }

    registerRenderer(type: string, renderer: BaseRenderer): void {
        this.renderers.set(type, renderer);
    }

    renderObject(object: SceneObject): THREE.Object3D | null {
        const renderer = this.renderers.get(object.type);
        if (!renderer) {
            console.warn(`No renderer found for type: ${object.type}`);
            return null;
        }

        return renderer.render(object);
    }

    updateObject(object: SceneObject): void {
        const renderer = this.renderers.get(object.type);
        if (renderer) {
            renderer.update(object);
        }
    }

    removeObject(id: string, type: string): void {
        const renderer = this.renderers.get(type);
        if (renderer) {
            renderer.remove(id);
        }
    }

    // Отримуємо об'єкт за ID
    getMeshById(id: string): THREE.Object3D | null {
        // Шукаємо об'єкт у всіх рендерерах
        for (const renderer of this.renderers.values()) {
            const obj = renderer.getMeshById(id);
            if (obj) {
                return obj;
            }
        }
        return null;
    }

    // Очищаємо всі об'єкти при зміні сцени
    clearAll(): void {

    }
}
