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
import { SunRenderer } from './environment/SunRenderer'
import { SkyCloudRenderer } from './environment/SkyCloudRenderer'
// import { ExplosionRenderer } from './ExplosionRenderer'

import type { GraphicsSettingsManager, ParticleQuality, ShadowQuality } from '@systems/graphics'

export class RendererManager {
    public renderers: Map<string, BaseRenderer> = new Map();
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private bridge: UiLogicBridge | null = null;
    private graphicsSettings: GraphicsSettingsManager | null = null;
    private graphicsSettingsUnsubscribe: (() => void) | null = null;
    private shadowMode: ShadowQuality | null = null;
    private particleQuality: ParticleQuality | null = null;
    private dustTrailsEnabled: boolean = true;

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, bridge?: UiLogicBridge, loadingManager?: THREE.LoadingManager) {
        this.scene = scene;
        this.renderer = renderer;
        if (bridge) this.bridge = bridge;
        this.loadingManager = loadingManager || null;
        this.initializeRenderers();
    }

    private loadingManager: THREE.LoadingManager | null = null;

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
        const roverRenderer = new RoverRenderer(this.scene);
        if (this.particleQuality) {
            roverRenderer.setParticleQuality(this.particleQuality);
        }
        roverRenderer.setDustTrailsEnabled(this.dustTrailsEnabled);
        this.registerRenderer('rover', roverRenderer); // Rover об'єкти
        const buildingRenderer = new BuildingRenderer(this.scene, this.renderer, this.loadingManager || undefined);
        if (this.bridge && (buildingRenderer as any).setUiLogicBridge) {
            (buildingRenderer as any).setUiLogicBridge(this.bridge);
        }
        if (this.shadowMode) {
            (buildingRenderer as any).setShadowMode?.(this.shadowMode);
        }
        this.registerRenderer('building', buildingRenderer); // Будівлі
        this.registerRenderer('cloud', new CloudRenderer(this.scene)); // Пилові хмари
        this.registerRenderer('sky-cloud', new SkyCloudRenderer(this.scene)); // Небесні хмари
        const smokeRenderer = new SmokeRenderer(this.scene, this.renderer);
        if (this.particleQuality) {
            smokeRenderer.setQuality(this.particleQuality);
        }
        this.registerRenderer('smoke', smokeRenderer); // Дим (GPU)
        const fireRenderer = new FireRenderer(this.scene, this.renderer);
        if (this.particleQuality) {
            fireRenderer.setQuality(this.particleQuality);
        }
        this.registerRenderer('fire', fireRenderer); // Вогонь (GPU)
        this.registerRenderer('sun', new SunRenderer(this.scene));
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
        this.graphicsSettingsUnsubscribe?.();
        this.graphicsSettingsUnsubscribe = null;
        this.graphicsSettings = null;
        // Очищаємо всі рендерери
        for (const renderer of this.renderers.values()) {
            if (renderer.dispose) {
                renderer.dispose();
            }
        }

        // Очищаємо Map
        this.renderers.clear();
    }

    public attachGraphicsSettings(manager: GraphicsSettingsManager): void {
        if (this.graphicsSettings === manager) return;

        this.graphicsSettingsUnsubscribe?.();
        this.graphicsSettings = manager;
        this.graphicsSettingsUnsubscribe = manager.subscribe((state) => {
            this.setShadowMode(state.shadows);
            this.setParticleQuality(state.particles);
            this.setDustTrailsEnabled(state.droneDustTrails);
        });
    }

    public setShadowMode(mode: ShadowQuality): void {
        this.shadowMode = mode;
        const buildingRenderer = this.renderers.get('building') as any;
        buildingRenderer?.setShadowMode?.(mode);
        const biomassRenderer = this.renderers.get('biomass') as any;
        biomassRenderer?.setShadowMode?.(mode);
    }

    public setParticleQuality(quality: ParticleQuality): void {
        this.particleQuality = quality;
        const smokeRenderer = this.renderers.get('smoke') as any;
        smokeRenderer?.setQuality?.(quality);
        const fireRenderer = this.renderers.get('fire') as any;
        fireRenderer?.setQuality?.(quality);
        const roverRenderer = this.renderers.get('rover') as any;
        roverRenderer?.setParticleQuality?.(quality);
    }

    public setDustTrailsEnabled(enabled: boolean): void {
        this.dustTrailsEnabled = enabled;
        const roverRenderer = this.renderers.get('rover') as any;
        roverRenderer?.setDustTrailsEnabled?.(enabled);
    }
}
