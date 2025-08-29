import * as THREE from 'three'
import { BaseRenderer, SceneObject } from './BaseRenderer'
import { BoulderRenderer } from './BoulderRenderer'
import { RockRenderer } from './RockRenderer'
import { RoverRenderer } from './RoverRenderer'
import { BuildingRenderer } from './BuildingRenderer'

// import { CloudRenderer } from './CloudRenderer'

import { FireRenderer } from './FireRenderer'
// import { ElectricArcRenderer } from './ArcRenderer'
import { SmokeRenderer } from './SmokeRenderer'
// import { ExplosionRenderer } from './ExplosionRenderer'

export class RendererManager {
    public renderers: Map<string, BaseRenderer> = new Map();
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.initializeRenderers();
    }

    private initializeRenderers(): void {
        // Реєструємо рендерери для різних типів об'єктів
        //this.registerRenderer('cube', new CubeRenderer(this.scene));
        //this.registerRenderer('sphere', new SphereRenderer(this.scene));
        this.registerRenderer('boulder', new BoulderRenderer(this.scene));
        this.registerRenderer('rock', new RockRenderer(this.scene, {
            usePaletteBuckets: true
        })); // Каменюки типу rock з звичайним рендерингом
        this.registerRenderer('rover', new RoverRenderer(this.scene)); // Rover об'єкти
        this.registerRenderer('building', new BuildingRenderer(this.scene)); // Будівлі
        // this.registerRenderer('cloud', new CloudRenderer(this.scene)); // Хмари
        this.registerRenderer('smoke', new SmokeRenderer(this.scene, this.renderer)); // Дим (GPU)
        this.registerRenderer('fire', new FireRenderer(this.scene, this.renderer)); // Вогонь (GPU)
        //this.registerRenderer('explosion', new ExplosionRenderer(this.scene, this.renderer)); // Вибухи (GPU)
        //this.registerRenderer('electric-arc', new ElectricArcRenderer(this.scene));
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

    // Отримуємо рендерер за типом
    getRenderer(type: string): BaseRenderer | null {
        return this.renderers.get(type) || null;
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

    // -------------------------
    // Очищення ресурсів (важливо для HMR!)
    // -------------------------
    public dispose(): void {
        // Очищаємо всі рендерери
        for (const renderer of this.renderers.values()) {
            if (renderer.dispose) {
                renderer.dispose();
            }
        }
        
        // Очищаємо Map
        this.renderers.clear();
    }
}
