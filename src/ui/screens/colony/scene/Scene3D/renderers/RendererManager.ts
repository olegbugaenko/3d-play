import * as THREE from 'three'
import { BaseRenderer } from './BaseRenderer'
import { TSceneObject } from '@logic/systems/scene/scene.types'
import { BoulderRenderer } from './BoulderRenderer'
import { RockRenderer } from './RockRenderer'
import { BiomassRenderer } from './BiomassRenderer'
import { RoverRenderer } from './RoverRenderer'
import { BuildingRenderer } from './BuildingRenderer'

import { CloudRenderer } from './CloudRenderer'

import { FireRenderer } from './FireRenderer'
import { UiLogicBridge } from '@ui/logic/UiLogicBridge'
// import { ElectricArcRenderer } from './ArcRenderer'
import { SmokeRenderer } from './SmokeRenderer'
import { RoadRenderer } from './RoadRenderer'
import { AuroraRenderer } from './environment/AuroraRenderer'
// import { ExplosionRenderer } from './ExplosionRenderer'

export class RendererManager {
    public renderers: Map<string, BaseRenderer> = new Map();
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private bridge: UiLogicBridge | null = null;

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, bridge?: UiLogicBridge) {
        this.scene = scene;
        this.renderer = renderer;
        if (bridge) this.bridge = bridge;
        this.initializeRenderers();
    }

    public setBridge(bridge: UiLogicBridge): void {
        this.bridge = bridge;
        const buildingRenderer = this.renderers.get('building') as any;
        if (buildingRenderer && buildingRenderer.setUiLogicBridge) {
            buildingRenderer.setUiLogicBridge(bridge);
        }

        const roadRenderer = this.renderers.get('road') as any;
        if (roadRenderer && roadRenderer.setUiLogicBridge) {
            roadRenderer.setUiLogicBridge(bridge as any);
        }
    }

    private initializeRenderers(): void {
        // Реєструємо рендерери для різних типів об'єктів
        //this.registerRenderer('cube', new CubeRenderer(this.scene));
        //this.registerRenderer('sphere', new SphereRenderer(this.scene));
        this.registerRenderer('boulder', new BoulderRenderer(this.scene));
        this.registerRenderer('rock', new RockRenderer(this.scene, {
            usePaletteBuckets: true
        })); // Каменюки типу rock з звичайним рендерингом
        this.registerRenderer('biomass', new BiomassRenderer(this.scene)); // Біомаса
        this.registerRenderer('rover', new RoverRenderer(this.scene)); // Rover об'єкти
        const buildingRenderer = new BuildingRenderer(this.scene, this.renderer);
        if (this.bridge && (buildingRenderer as any).setUiLogicBridge) {
            (buildingRenderer as any).setUiLogicBridge(this.bridge);
        }
        this.registerRenderer('building', buildingRenderer); // Будівлі
        this.registerRenderer('cloud', new CloudRenderer(this.scene)); // Хмари
        this.registerRenderer('smoke', new SmokeRenderer(this.scene, this.renderer)); // Дим (GPU)
        this.registerRenderer('fire', new FireRenderer(this.scene, this.renderer)); // Вогонь (GPU)
        const roadRenderer = new RoadRenderer(this.scene, this.renderer);
        if (this.bridge && (roadRenderer as any).setUiLogicBridge) {
            (roadRenderer as any).setUiLogicBridge(this.bridge as any);
        }
        this.registerRenderer('road', roadRenderer); // Дороги
        this.registerRenderer('aurora', new AuroraRenderer(this.scene, this.bridge || undefined)); // Полярне сяйво
        //this.registerRenderer('explosion', new ExplosionRenderer(this.scene, this.renderer)); // Вибухи (GPU)
        //this.registerRenderer('electric-arc', new ElectricArcRenderer(this.scene));
        // Тут можна додати інші рендерери: plane, тощо
    }

    registerRenderer(type: string, renderer: BaseRenderer): void {
        this.renderers.set(type, renderer);
    }

    renderObject(object: TSceneObject): THREE.Object3D | null {
        const renderer = this.renderers.get(object.type);
        if (!renderer) {
            console.warn(`No renderer found for type: ${object.type}`);
            return null;
        }

        return renderer.render(object);
    }

    updateObject(object: TSceneObject): void {
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
