import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { UiLogicBridge } from '@ui/logic/UiLogicBridge';
import { BaseRenderer } from './BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { BUILDINGS_DB } from '@logic/modules/buildings/buildings-db';
import type { BuildingTypeId } from '@logic/modules/buildings/buildings.types';
import { ResourceRequest } from '@logic/modules/resources/resource-types';
import { HudCanvasBuilder, BUILDING_HUD_STYLE } from './hud/HudCanvasBuilder';
import type { HudCanvasRequest, HudResourceEntry } from './hud/HudCanvasBuilder';
import { clampScaleByWidth, computeScreenSpaceScale } from './hud/hudMath';
import { removeBakedShadow } from './utils/bakedShadows';
import type { ShadowQuality } from '@systems/graphics';

// ---------- TMP ----------
const _qCam = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _localOffset = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
// ---------- Screen-space таргети ----------
// Позиціонування у світі
const HUD_WORLD_Y_OFFSET_FALLBACK = 0.6;
const HUD_WORLD_Z_OFFSET = 0.035;

// --------- Типи ---------
type ResourceInfo = {
  required: ResourceRequest;
  collected: Record<string, number>;
  missing: ResourceRequest;
  progress: number;
};

type ShadowOptions = { intensity?: number; softness?: number; minSize?: number; offset?: number };

export class BuildingRenderer extends BaseRenderer {
  private geometry: THREE.BoxGeometry;
  private material: THREE.MeshBasicMaterial;
  private loader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();
  private readonly hudStyle = BUILDING_HUD_STYLE;
  private readonly hudBuilder: HudCanvasBuilder;

  private uiLogicBridge: UiLogicBridge | null = null; // Bridge to logic for storage info

  private shadowMode: ShadowQuality = 'none';
  private shadowSources = new WeakMap<THREE.Object3D, { source: THREE.Object3D; options?: ShadowOptions }>();

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer, loadingManager?: THREE.LoadingManager) {
    super(scene, renderer);

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
      fog: false,
    });

    this.loader = new GLTFLoader(loadingManager ?? undefined);
    this.hudBuilder = new HudCanvasBuilder(renderer, this.hudStyle);
  }

  public setShadowMode(mode: ShadowQuality): void {
    this.shadowMode = mode;
    for (const container of this.meshes.values()) {
      this.reapplyStoredShadow(container);
    }
  }

  private reapplyStoredShadow(container: THREE.Object3D): void {
    const stored = this.shadowSources.get(container);
    if (stored) {
      this.applyShadowPreset(container, stored.source, stored.options);
      return;
    }

    const fallbackSource = this.findShadowSource(container);
    if (fallbackSource) {
      this.applyShadowPreset(container, fallbackSource, undefined);
    } else {
      this.setContainerShadowFlags(container, this.shadowMode === 'detailed');
      removeBakedShadow(container);
    }
  }

  private applyShadowPreset(container: THREE.Object3D, source: THREE.Object3D, options?: ShadowOptions): void {
    this.shadowSources.set(container, { source, options });

    const enableDynamic = this.shadowMode === 'detailed';
    this.setContainerShadowFlags(container, enableDynamic);
    removeBakedShadow(container);
  }

  private setContainerShadowFlags(container: THREE.Object3D, enabled: boolean): void {
    this.forEachShadowMesh(container, (mesh) => {
      mesh.castShadow = enabled;
      mesh.receiveShadow = enabled;
    });
  }

  private forEachShadowMesh(root: THREE.Object3D, handler: (mesh: THREE.Mesh) => void): void {
    root.traverse((child) => {
      if ((child as any).userData?.bakedShadow) return;
      if (child.name === 'combinedHUD') return;
      if ((child as THREE.Mesh).isMesh) {
        handler(child as THREE.Mesh);
      }
    });
  }

  private findShadowSource(container: THREE.Object3D): THREE.Object3D | null {
    const queue: THREE.Object3D[] = [...container.children];
    while (queue.length > 0) {
      const child = queue.shift()!;
      if ((child as any).userData?.bakedShadow) continue;
      if (child.name === 'combinedHUD') continue;
      if ((child as THREE.Mesh).isMesh || child.children.length > 0) {
        return child;
      }
      queue.push(...child.children);
    }
    return null;
  }

  /**
   * Set UI↔Logic bridge
   */
  public setUiLogicBridge(bridge: UiLogicBridge): void {
    this.uiLogicBridge = bridge;
  }

  public setHudYOffset(objectId: string, y: number) {
    const anchor = this.meshes.get(objectId);
    if (!anchor) return;
    (anchor as any).userData = (anchor as any).userData || {};
    (anchor as any).userData.hudYOffset = y;
  }

  // --- допоміжне: санітизація PBR ---
  private sanitizePBR(child: any, isUnderConstruction: boolean) {
    const apply = (m: any) => {
      // для готових будівель прибираємо типові «приглушувачі»
      if (!isUnderConstruction) {
        if (m.transparent) m.transparent = false;
        if (typeof m.opacity === 'number' && m.opacity < 1) m.opacity = 1.0;
        if ('toneMapped' in m) m.toneMapped = true;

        // якщо є альбедо-текстура — колір має бути чисто білий (без множення)
        if (m.map && m.color?.isColor) m.color.set(0xffffff);

        // іноді експортери включають vertex colors → множення на альбедо
        if (m.vertexColors === true) m.vertexColors = false;

        // надто агресивна AO або відсутній uv2 → глобально затемнює
        if (m.aoMap) {
          const hasUv2 = !!child.geometry?.attributes?.uv2;
          if (!hasUv2) m.aoMapIntensity = 0;
        }
      } else {
        m.transparent = true;
        m.opacity = 0.6;
        m.toneMapped = false;
        m.fog = false;
      }
    };

    if (Array.isArray(child.material)) child.material.forEach(apply);
    else apply(child.material);
  }

  render(object: TSceneObject): THREE.Object3D {
    const data: any = object.data || {};
    const buildingType = (data?.typeId || data?.buildingType || 'storage') as BuildingTypeId;
    const config = BUILDINGS_DB.get(buildingType);

    // контейнер-якір
    const container = new THREE.Group();
    const bottomAnchor = config?.ui?.bottomAnchor || 0;
    container.position.set(
      object.coordinates.x,
      object.coordinates.y + bottomAnchor,
      object.coordinates.z
    );
    container.scale.set(object.scale.x, object.scale.y, object.scale.z);
    container.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);

    this.addMesh(object.id, container);

    // HUD offset
    const userHudOffset = Number(data?.hudOffsetY ?? (config?.ui as any)?.hudOffsetY ?? 0);
    (container as any).userData = (container as any).userData || {};
    (container as any).userData.hudYOffset = userHudOffset;

    const isUnderConstruction = !data?.built || data?.level === 0;
    const constructionProgress = THREE.MathUtils.clamp(data?.constructionProgress ?? 0, 0, 1);

    // Fallback
    const fallbackColor = config?.ui?.color;
    const fallback = this.createFallbackMesh(fallbackColor);
    fallback.name = 'fallback';
    container.add(fallback);
    this.applyShadowPreset(container, fallback, { intensity: 0.25, softness: 1.15, minSize: 0.6 });

    if (isUnderConstruction) {
      const resourceInfo = this.getBuildingResourceInfo(buildingType, data?.resourcesCollected || {});
      const baseParentScale = this.getBaseParentScale(container);
      const baseY = HUD_WORLD_Y_OFFSET_FALLBACK + userHudOffset;
      const title = config?.name ? `${config.name}` : (object.id || 'building');
      this.attachOrUpdateCombinedHUD(object.id, container, constructionProgress, resourceInfo, baseY, baseParentScale, { title });
      (container as any).userData.constructionBarY = HUD_WORLD_Y_OFFSET_FALLBACK;
    } else {
      // Storage HUD via combined HUD without progress bar
      const hasInternalStorage = this.buildingHasInternalStorage(object.id, config);
      if (hasInternalStorage && this.uiLogicBridge) {
        const storageInfo = this.uiLogicBridge.getBuildingStorageInfo(object.id);
        if (storageInfo) {
          const baseParentScale = this.getBaseParentScale(container);
          const baseY = HUD_WORLD_Y_OFFSET_FALLBACK + userHudOffset;
          const resInfo = this.storageToResourceInfo(storageInfo);
          const title = config?.name ? `${config.name}` : (object.id || 'building');
          this.attachOrUpdateCombinedHUD(object.id, container, 0, resInfo, baseY, baseParentScale, { showProgress: false, disableCache: true, title });
        }
      } else {
        this.removeHUD(container);
      }
    }

    // якщо немає моделі — повертаємо контейнер
    if (!config) return container;
    const modelName = config.ui?.modelName;
    if (!modelName) return container;

    const modelPath = modelName.startsWith('/') ? modelName : `/${modelName}`;

    const applyModel = (src: THREE.Group) => {
      const fb = container.getObjectByName('fallback');
      if (fb) container.remove(fb);

      // Клон сцени
      const model = src.clone(true) as THREE.Group;

      // ГЛИБОКО клонувати матеріали
      model.traverse((child: any) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((m: any) => (m?.clone ? m.clone() : m));
          } else if (child.material?.clone) {
            child.material = child.material.clone();
          }

          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      // Санітизуємо PBR
      model.traverse((child: any) => {
        if (child.isMesh && child.material) this.sanitizePBR(child, isUnderConstruction);
      });

      const shadowIntensity = isUnderConstruction ? 0.32 : 0.55;
      const shadowSoftness = isUnderConstruction ? 1.1 : 1.35;
      this.applyShadowPreset(container, model, { intensity: shadowIntensity, softness: shadowSoftness, minSize: 0.6 });
      container.add(model);

      if (isUnderConstruction) {
        const bbox = new THREE.Box3().setFromObject(model);
        const h = Math.max(0.001, bbox.max.y - bbox.min.y);
        const baseY = bbox.max.y + 0.15 * h;
        (container as any).userData.constructionBarY = baseY;

        const baseParentScale = this.getBaseParentScale(container);
        const resourceInfo = this.getBuildingResourceInfo(buildingType, data?.resourcesCollected || {});
        this.attachOrUpdateCombinedHUD(
          object.id,
          container,
          constructionProgress,
          resourceInfo,
          baseY + userHudOffset,
          baseParentScale
        );
      } else {
        // Storage HUD via combined HUD without progress bar (with model height)
        const hasInternalStorage = this.buildingHasInternalStorage(object.id, config);
        if (hasInternalStorage && this.uiLogicBridge) {
          const storageInfo = this.uiLogicBridge.getBuildingStorageInfo(object.id);
          if (storageInfo) {
            const bbox = new THREE.Box3().setFromObject(model);
            const h = Math.max(0.001, bbox.max.y - bbox.min.y);
            const baseY = bbox.max.y + 0.15 * h;
            const baseParentScale = this.getBaseParentScale(container);
            const resInfo = this.storageToResourceInfo(storageInfo);
            const title = config?.name ? `${config.name}` : (object.id || 'building');
            this.attachOrUpdateCombinedHUD(object.id, container, 0, resInfo, baseY + userHudOffset, baseParentScale, { showProgress: false, disableCache: true, title });
          }
        } else {
          this.removeHUD(container);
        }
      }
    };

    if (this.modelCache.has(modelPath)) {
      applyModel(this.modelCache.get(modelPath)!);
    } else {
      this.loader.load(
        modelPath,
        (gltf) => { this.modelCache.set(modelPath, gltf.scene); applyModel(gltf.scene); },
        undefined,
        (err) => { console.warn('Failed to load building model:', (err as Error).message); }
      );
    }

    return container;
  }

  // ---------- Combined HUD ----------
  private attachOrUpdateCombinedHUD(
    ownerId: string,
    anchor: THREE.Object3D,
    constructionProgress: number,
    resourceInfo: ResourceInfo,
    barY: number,
    baseParentScale: number,
    options?: { showProgress?: boolean; disableCache?: boolean; title?: string }
  ): void {
    const request = this.createHudRequest(constructionProgress, resourceInfo, {
      showProgress: options?.showProgress,
      title: options?.title,
    });

    const { texture, aspect, contentHeightWorld, cropX } = this.hudBuilder.build(request, {
      disableCache: options?.disableCache,
    });

    const planeH = contentHeightWorld;
    const planeW = contentHeightWorld * aspect * cropX;

    let hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;

    if (!hud) {
      hud = new THREE.Group();
      hud.name = 'combinedHUD';
      hud.renderOrder = 1100;
      hud.frustumCulled = false;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
        depthTest: false,
        depthWrite: false,
      });

      const bg = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), material);
      bg.name = 'hudPlane';
      bg.frustumCulled = false;
      this.applyHudTextureCrop(material, cropX);

      const rendererRef = this.renderer;
      (bg as any).onBeforeRender = (_r: any, _s: any, camera: THREE.Camera) => {
        const extraY = (anchor as any).userData?.hudYOffset ?? 0;

        _localOffset.set(0, barY + extraY, 0);
        anchor.updateWorldMatrix(true, false);
        anchor.localToWorld(_worldPos.copy(_localOffset));

        (camera as THREE.Object3D).getWorldQuaternion(_qCam);
        hud!.quaternion.copy(_qCam);

        (camera as any).getWorldDirection?.(_viewDir) ?? _viewDir.set(0, 0, -1).applyQuaternion(_qCam);
        hud!.position.copy(_worldPos).addScaledVector(_viewDir, -HUD_WORLD_Z_OFFSET);

        anchor.getWorldScale(_worldScale);
        const base = 1 / Math.max(baseParentScale, 1e-6);
        const planeAspect = planeW / Math.max(1e-6, planeH);

        const screenScale = computeScreenSpaceScale(
          camera,
          hud!.position,
          planeH,
          this.hudStyle.targetHeightPx,
          rendererRef,
          this.hudStyle.minScale,
          this.hudStyle.maxScale
        );

        let final = base * screenScale;
        final = clampScaleByWidth(final, planeAspect, this.hudStyle.targetHeightPx, this.hudStyle.maxWidthPx);

        hud!.scale.set(final, final, final);
        hud!.updateMatrixWorld(true);
      };

      hud.add(bg);
      this.hudRegistry.register(ownerId, anchor, hud);
    } else {
      const bg = hud.getObjectByName('hudPlane') as THREE.Mesh;
      const mat = bg.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.map = texture;
      mat.needsUpdate = true;

      const geo = bg.geometry as THREE.PlaneGeometry;
      const params = geo.parameters;
      if (params.width !== planeW || params.height !== planeH) {
        bg.geometry.dispose();
        bg.geometry = new THREE.PlaneGeometry(planeW, planeH);
      }

      this.applyHudTextureCrop(mat, cropX);
    }
  }

  private removeHUD(anchor: THREE.Object3D) {
    this.hudRegistry.detachFromAnchor(anchor);
  }

  private applyHudTextureCrop(material: THREE.MeshBasicMaterial, cropX: number): void {
    const map = material.map;
    if (!map) return;

    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.repeat.set(cropX, 1);
    map.offset.set((1 - cropX) * 0.5, 0);
    map.needsUpdate = true;
  }

  private createHudRequest(
    progress: number,
    resourceInfo: ResourceInfo,
    options?: { showProgress?: boolean; title?: string }
  ): HudCanvasRequest {
    const ids = new Set<string>([
      ...Object.keys(resourceInfo.required || {}),
      ...Object.keys(resourceInfo.collected || {}),
    ]);

    const resources: HudResourceEntry[] = Array.from(ids).map((id) => ({
      id,
      required: resourceInfo.required[id] ?? 0,
      collected: resourceInfo.collected[id] ?? 0,
    }));

    const showProgress = options?.showProgress !== false;

    return {
      title: options?.title,
      progress: showProgress ? THREE.MathUtils.clamp(progress, 0, 1) : 0,
      showProgress,
      resources,
    };
  }

  private getBuildingResourceInfo(
    buildingType: BuildingTypeId,
    resourcesCollected: Record<string, number> = {}
  ): ResourceInfo {
    const buildingConfig = BUILDINGS_DB.get(buildingType);
    if (!buildingConfig) return { required: {}, collected: {}, missing: {}, progress: 0 };

    const required = buildingConfig.cost(1);
    const collected = { ...resourcesCollected };
    const missing: ResourceRequest = {};

    let totalReq = 0, totalGot = 0;
    for (const [id, amt] of Object.entries(required)) {
      totalReq += amt;
      const got = collected[id] || 0;
      totalGot += Math.min(got, amt);
      if (got < amt) missing[id] = amt - got;
    }

    const progress = totalReq > 0 ? totalGot / totalReq : 1;
    return { required, collected, missing, progress };
  }

  private storageToResourceInfo(storage: Record<string, { current: number; capacity: number }>): ResourceInfo {
    const required: ResourceRequest = {} as any;
    const collected: Record<string, number> = {};
    for (const [resId, s] of Object.entries(storage)) {
      required[resId] = s.capacity; // use effective capacity from logic
      collected[resId] = Math.round(s.current * 10) / 10;
    }
    const missing: ResourceRequest = {} as any;
    for (const [id, cap] of Object.entries(required)) {
      const got = collected[id] || 0;
      missing[id] = Math.max(0, cap - got);
    }
    return { required, collected, missing, progress: 0 };
  }

  private getBaseParentScale(anchor: THREE.Object3D): number {
    return Math.max(1e-6, Math.max(anchor.scale.x, anchor.scale.y, anchor.scale.z));
  }

  public update(object: TSceneObject): void {
    super.update(object);
    const anchor = this.meshes.get(object.id);
    if (!anchor) return;

    const data: any = object.data || {};
    const isUnderConstruction = !data?.built || data?.level === 0;
    const p = THREE.MathUtils.clamp(data?.constructionProgress ?? 0, 0, 1);

    const hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;

    if (isUnderConstruction) {
      const buildingType = (data?.typeId || data?.buildingType || 'storage') as BuildingTypeId;
      const info = this.getBuildingResourceInfo(buildingType, data?.resourcesCollected || {});
      const baseParentScale = this.getBaseParentScale(anchor);

      const storedBaseY = (anchor as any).userData?.constructionBarY ?? HUD_WORLD_Y_OFFSET_FALLBACK;
      const extraY = (anchor as any).userData?.hudYOffset ?? 0;
      const barY = storedBaseY + extraY;

      if (hud) {
        const request = this.createHudRequest(p, info);
        const { texture, aspect, contentHeightWorld, cropX } = this.hudBuilder.build(request, { disableCache: true });
        const bg = hud.getObjectByName('hudPlane') as THREE.Mesh;
        const mat = bg.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.map = texture;
        mat.needsUpdate = true;

        const planeH = contentHeightWorld;
        const planeW = contentHeightWorld * aspect * cropX;

        const geo = bg.geometry as THREE.PlaneGeometry;
        const params = geo.parameters;
        if (params.width !== planeW || params.height !== planeH) {
          bg.geometry.dispose();
          bg.geometry = new THREE.PlaneGeometry(planeW, planeH);
        }

        this.applyHudTextureCrop(mat, cropX);

        (anchor as any).userData.constructionBarY = storedBaseY;
        (anchor as any).userData.hudYOffset = extraY;
      } else {
        this.attachOrUpdateCombinedHUD(object.id, anchor, p, info, barY, baseParentScale);
      }
    } else {
      // Built building: render storage HUD if internal storage present
      const buildingType = (data?.typeId || data?.buildingType || 'storage') as BuildingTypeId;
      const config = BUILDINGS_DB.get(buildingType);
      const hasInternal = this.buildingHasInternalStorage(object.id, config);
      if (hasInternal && this.uiLogicBridge) {
        const storageInfo = this.uiLogicBridge.getBuildingStorageInfo(object.id);
        if (storageInfo) {
          const resInfo = this.storageToResourceInfo(storageInfo);
          const baseParentScale = this.getBaseParentScale(anchor);
          const storedBaseY = (anchor as any).userData?.constructionBarY ?? HUD_WORLD_Y_OFFSET_FALLBACK;
          const extraY = (anchor as any).userData?.hudYOffset ?? 0;
          const barY = storedBaseY + extraY;

          const title = config?.name ? `${config.name}` : (object.id || 'building');
          if (hud) {
            const request = this.createHudRequest(0, resInfo, { showProgress: false, title });
            const { texture, aspect, contentHeightWorld, cropX } =
              this.hudBuilder.build(request, { disableCache: true });
            const bg = hud.getObjectByName('hudPlane') as THREE.Mesh;
            const mat = bg.material as THREE.MeshBasicMaterial;
            mat.map?.dispose();
            mat.map = texture;
            mat.needsUpdate = true;

            const planeH = contentHeightWorld;
            const planeW = contentHeightWorld * aspect * cropX;

            const geo = bg.geometry as THREE.PlaneGeometry;
            const params = geo.parameters;
            if (params.width !== planeW || params.height !== planeH) {
              bg.geometry.dispose();
              bg.geometry = new THREE.PlaneGeometry(planeW, planeH);
            }

            this.applyHudTextureCrop(mat, cropX);

            (anchor as any).userData.constructionBarY = storedBaseY;
            (anchor as any).userData.hudYOffset = extraY;
          } else {
            this.attachOrUpdateCombinedHUD(object.id, anchor, 0, resInfo, barY, baseParentScale, { showProgress: false, disableCache: true, title });
          }
        } else {
          this.removeHUD(anchor);
        }
      } else {
        this.removeHUD(anchor);
      }
    }
  }

  private createFallbackMesh(color?: string): THREE.Mesh {
    const material = this.material.clone();
    if (color && material.color) {
      const value = color.startsWith('#') ? color : `#${color}`;
      material.color.set(value);
    }
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.position.set(0, 0, 0);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.modelCache.clear();
    this.hudBuilder.dispose();

    super.dispose();
  }

  // ========== Storage HUD Methods ==========
  
  /**
   * Check if building has internal storage based on its type
   */
  private buildingHasInternalStorage(_objectId: string, buildingConfig: any): boolean {
    return buildingConfig?.data?.internalStorageConfig !== undefined;
  }
  
  // Removed old storage-only canvas method (now unified)
}
