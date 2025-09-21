import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { UiLogicBridge } from '@ui/logic/UiLogicBridge';
import { BaseRenderer } from './BaseRenderer';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { BUILDINGS_DB } from '@logic/modules/buildings/buildings-db';
import { ResourceRequest } from '@logic/modules/resources/resource-types';
import { RESOURCES_DB, ResourceId } from '@logic/modules/resources/resources-db';
import { ResourceIcons } from './ResourceIcons';

// ---------- TMP ----------
const _qCam = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _localOffset = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _viewDir = new THREE.Vector3();

// ---------- Screen-space таргети ----------
const HUD_TARGET_PX = {
  resourceHeight: 48,
  minScale: 0.1,
  maxScale: 100.0,
  maxWidth: 320,
};

const HUD_SAFE_FRACTION = 0.25;
const HUD_CROP_X = HUD_SAFE_FRACTION;

// Позиціонування у світі
const HUD_WORLD_Y_OFFSET_FALLBACK = 0.6;
const HUD_WORLD_Z_OFFSET = 0.035;

// Висоти/ширини елементів у логічних px
const PROGRESS_HEIGHT_PX = 5;
const ROW_HEIGHT_PX      = 28;
const ICON_SIZE_PX       = 24;

const NAME_MIN_W_PX      = 120;
const BAR_MIN_W_PX       = 50;
const BAR_MAX_W_PX       = 160;
const BAR_HEIGHT_PX      = 4;

const SIDE_PAD_PX        = 16;
const GAP_SMALL_PX       = 8;
const GAP_MEDIUM_PX      = 12;
const REQ_COL_W_PX       = 48;

const INTERNAL_SCALE = 2;

// --------- Типи ---------
type ResourceInfo = {
  required: ResourceRequest;
  collected: Record<string, number>;
  missing: ResourceRequest;
  progress: number;
};

export class BuildingRenderer extends BaseRenderer {
  private geometry: THREE.BoxGeometry;
  private material: THREE.MeshBasicMaterial;
  private loader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();
  private lastCanvasUpdate: number = 0;
  private readonly CANVAS_UPDATE_THROTTLE_MS = 200;
  private cachedCanvasTexture: THREE.CanvasTexture | null = null;

  private lastAspect = 1;
  private lastContentHeightWorld = 1;
  
  private uiLogicBridge: UiLogicBridge | null = null; // Bridge to logic for storage info

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    super(scene, renderer);
    (this as any).renderer = renderer;

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

    this.loader = new GLTFLoader();
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
    const buildingType = data?.typeId || data?.buildingType || 'storage';
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
    const fallback = this.createFallbackMesh();
    fallback.name = 'fallback';
    container.add(fallback);

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
        }
      });

      // колір з конфіга (НЕ тінтити, якщо є map)
      const color = config?.ui?.color;
      if (color) {
        const hex = parseInt(color.replace('#', ''), 16);
        model.traverse((child: any) => {
          if (child.isMesh && child.material) {
            const tint = (m: any) => { if (!m.map && m.color?.setHex) m.color.setHex(hex); };
            Array.isArray(child.material) ? child.material.forEach(tint) : tint(child.material);
          }
        });
      }

      // Санітизуємо PBR
      model.traverse((child: any) => {
        if (child.isMesh && child.material) this.sanitizePBR(child, isUnderConstruction);
      });

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
    let hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;

    const { texture, aspect, contentHeightWorld } =
      this.buildCombinedCanvasTexture(constructionProgress, resourceInfo, options);

    const baseW = contentHeightWorld * aspect;
    const baseH = contentHeightWorld;
    const cropX = HUD_CROP_X;
    const planeW = baseW * cropX;
    const planeH = baseH;

    if (!hud) {
      hud = new THREE.Group();
      hud.name = 'combinedHUD';
      hud.renderOrder = 1100;
      hud.frustumCulled = false;

      const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(planeW, planeH),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
          depthTest: false,
          depthWrite: false,
        })
      );
      bg.name = 'hudPlane';

      if ((bg.material as THREE.MeshBasicMaterial).map) {
        const map = (bg.material as THREE.MeshBasicMaterial).map!;
        map.wrapS = THREE.ClampToEdgeWrapping;
        map.wrapT = THREE.ClampToEdgeWrapping;
        map.repeat.set(cropX, 1);
        map.offset.set((1 - cropX) * 0.5, 0);
        map.needsUpdate = true;
      }

      hud.add(bg);

      const rendererRef = (this as any).renderer as THREE.WebGLRenderer | undefined;
      (bg as any).onBeforeRender = (_r: any, _s: any, camera: THREE.Camera) => {
        const extraY = (anchor as any).userData?.hudYOffset ?? 0;

        _localOffset.set(0, barY + extraY, 0);
        anchor.updateWorldMatrix(true, false);
        anchor.localToWorld(_worldPos.copy(_localOffset));

        (camera as THREE.Object3D).getWorldQuaternion(_qCam);
        hud!.quaternion.copy(_qCam);

        (camera as any).getWorldDirection?.(_viewDir) ?? _viewDir.set(0, 0, -1).applyQuaternion(_qCam);
        const pos = _worldPos.clone().addScaledVector(_viewDir, -HUD_WORLD_Z_OFFSET);
        hud!.position.copy(pos);

        anchor.getWorldScale(_worldScale);
        const sx = _worldScale.x || 1, sy = _worldScale.y || 1, sz = _worldScale.z || 1;
        const base = 1 / Math.max(baseParentScale, 1e-6);
        // const anti = base / Math.max(Math.max(sx, sy), sz); // Коментуємо антискейл

        const screenS = this.computeScreenSpaceScale(
          camera, hud!.position, planeH, Math.round(HUD_TARGET_PX.resourceHeight), rendererRef
        );

        // Використовуємо тільки screen-space scale без компенсації скейлу моделі
        let final = base * screenS;
        if (rendererRef) {
          const pxScale = this.computeWidthClampScale(
            camera,
            hud!.position,
            planeH,
            Math.round(HUD_TARGET_PX.resourceHeight),
            planeW / planeH,
            HUD_TARGET_PX.maxWidth,
            rendererRef
          );
          final = Math.min(final, pxScale);
        }
        hud!.scale.set(final, final, final);
      };

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

      if (mat.map) {
        mat.map.wrapS = THREE.ClampToEdgeWrapping;
        mat.map.wrapT = THREE.ClampToEdgeWrapping;
        mat.map.repeat.set(cropX, 1);
        mat.map.offset.set((1 - cropX) * 0.5, 0);
        mat.needsUpdate = true;
      }
    }
  }

  private removeHUD(anchor: THREE.Object3D) {
    this.hudRegistry.detachFromAnchor(anchor);
  }

  // ---------- Canvas builder ----------
  private buildCombinedCanvasTexture(
    constructionProgress: number,
    resourceInfo: ResourceInfo,
    options?: { showProgress?: boolean; disableCache?: boolean; title?: string }
  ): { texture: THREE.CanvasTexture; aspect: number; contentHeightWorld: number } {
    const showProgress = options?.showProgress !== false;
    const now = Date.now();
    if (!options?.disableCache && now - this.lastCanvasUpdate < this.CANVAS_UPDATE_THROTTLE_MS) {
      const { texture } = this.getCachedCanvasTexture();
      return { texture, aspect: this.lastAspect, contentHeightWorld: this.lastContentHeightWorld };
    }
    this.lastCanvasUpdate = now;

    const rendererDpr =
      this.renderer?.getPixelRatio?.() ??
      (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1;
    const dpr = rendererDpr * INTERNAL_SCALE;

    const baseWidth = 1024;
    const widthRaw = Math.round(baseWidth * dpr);

    const rows = Math.max(1, Object.keys(resourceInfo.required).length);
    const pad  = Math.round(12 * dpr);

    const progressH = showProgress ? Math.round(PROGRESS_HEIGHT_PX * dpr) : 0;
    const rowH      = Math.round(ROW_HEIGHT_PX * dpr);
    const vGap      = Math.round(10 * dpr);

    const titleH = options?.title ? Math.round(20 * dpr) : 0;
    const heightRaw = pad + titleH + (titleH ? vGap : 0) + progressH + (showProgress ? vGap : 0) + rows * rowH + pad;

    const toPOT = (v: number) => THREE.MathUtils.ceilPowerOfTwo(Math.max(2, v));
    const width  = toPOT(widthRaw);
    const height = toPOT(heightRaw);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, width, height);

    const safeW = Math.round(widthRaw * HUD_SAFE_FRACTION);
    const safeX = Math.round((widthRaw - safeW) * 0.5);
    const safeRight = safeX + safeW;

    const px = (val: number) => Math.round(val * dpr);
    const sidePad = px(SIDE_PAD_PX);
    const gapS = px(GAP_SMALL_PX);
    const gapM = px(GAP_MEDIUM_PX);
    const reqColW = px(REQ_COL_W_PX);

    const contentLeft  = safeX + sidePad;
    const contentRight = safeRight - sidePad;

    let cursorTop = pad;

    if (options?.title) {
      ctx.font = `${px(16)}px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const titleX = contentLeft;
      ctx.fillText(options.title, titleX, cursorTop);
      cursorTop += titleH + vGap;
    }

    if (showProgress) {
      const progressX = contentLeft;
      const progressW = Math.max(1, contentRight - contentLeft);
      const progressY = cursorTop;

      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(progressX - px(2), progressY - px(2), progressW + px(4), progressH + px(4));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(progressX, progressY, progressW, progressH);
      ctx.fillStyle = '#12d06b';
      ctx.fillRect(
        progressX,
        progressY,
        Math.max(px(6), Math.round(progressW * THREE.MathUtils.clamp(constructionProgress, 0, 1))),
        progressH
      );
    }

    const iconSize = px(ICON_SIZE_PX);
    const iconX = contentLeft;

    const reqX = contentRight;
    const rightLimit = reqX - reqColW;

    const nameX = iconX + iconSize + gapS;

    const availableBetween = Math.max(0, rightLimit - nameX - gapM);
    const NAME_MIN_W = px(NAME_MIN_W_PX);
    const BAR_MIN_W  = px(BAR_MIN_W_PX);
    const BAR_MAX_W  = px(BAR_MAX_W_PX);
    const barH       = px(BAR_HEIGHT_PX);

    const ellipsis = '…';
    const truncateText = (text: string, maxW: number, font: string) => {
      ctx.font = font;
      if (maxW <= 0) return ellipsis;
      if (ctx.measureText(text).width <= maxW) return text;
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = ((lo + hi) / 2) | 0;
        const s = text.slice(0, mid) + ellipsis;
        if (ctx.measureText(s).width <= maxW) lo = mid + 1; else hi = mid;
      }
      return text.slice(0, Math.max(0, lo - 1)) + ellipsis;
    };

    const nameFont = `${px(18)}px Inter, Arial, sans-serif`;
    const qtyFont  = `${px(16)}px Inter, Arial, sans-serif`;

    let i = 0;
    const startY = cursorTop + progressH + (showProgress ? vGap : 0);

    for (const [resourceId, reqAmt] of Object.entries(resourceInfo.required)) {
      const got = resourceInfo.collected[resourceId] || 0;
      const miss = Math.max(0, reqAmt - got);
      const done = miss === 0;

      const rowCenterY = startY + i * rowH + Math.round(rowH * 0.5);

      let nameMaxW = Math.round(availableBetween * 0.55);
      let barW     = availableBetween - nameMaxW;

      if (nameMaxW < NAME_MIN_W) { const d = NAME_MIN_W - nameMaxW; nameMaxW += d; barW -= d; }
      if (barW < BAR_MIN_W)       { const d = BAR_MIN_W - barW;     barW += d;     nameMaxW -= d; }
      nameMaxW = Math.max(px(80), nameMaxW);
      barW     = Math.min(BAR_MAX_W, Math.max(BAR_MIN_W, barW));

      const barX = nameX + nameMaxW + gapM;

      const res = RESOURCES_DB[resourceId as ResourceId];
      const hex = res?.color ?? '#cccccc';
      const iconY = rowCenterY - Math.round(iconSize / 2);
      this.drawResourceIcon(ctx, resourceId, iconX, iconY, iconSize, hex, done);

      const name = res?.name ?? resourceId;
      const nameY = rowCenterY + px(1);
      ctx.fillStyle = done ? '#12d06b' : '#ffffff';
      const clippedName = truncateText(name, nameMaxW, nameFont);
      ctx.font = nameFont;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(clippedName, nameX, nameY);

      const p = reqAmt > 0 ? Math.max(0, Math.min(1, got / reqAmt)) : 1;
      const bY = rowCenterY - Math.round(barH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(barX - px(2), bY - px(2), barW + px(4), barH + px(4));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, bY, barW, barH);
      ctx.fillStyle = done ? '#12d06b' : '#ff4444';
      ctx.fillRect(barX, bY, Math.max(px(6), Math.round(barW * p)), barH);

      ctx.font = qtyFont;
      ctx.fillStyle = '#e6e6e6';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText(String(reqAmt), reqX, rowCenterY);

      i++;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    texture.needsUpdate = true;

    this.cachedCanvasTexture = texture;

    const aspect = widthRaw / heightRaw;
    const contentHeightWorld = 1.0;

    this.lastAspect = aspect;
    this.lastContentHeightWorld = contentHeightWorld;

    return { texture, aspect, contentHeightWorld };
  }

  // ---------- Helpers ----------
  private getCachedCanvasTexture(): { texture: THREE.CanvasTexture; aspect: number; contentHeightWorld: number } {
    if (!this.cachedCanvasTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      this.cachedCanvasTexture = tex;
    }
    return {
      texture: this.cachedCanvasTexture,
      aspect: this.lastAspect,
      contentHeightWorld: this.lastContentHeightWorld
    };
  }

  private drawResourceIcon(
    ctx: CanvasRenderingContext2D,
    resourceId: string,
    x: number,
    y: number,
    size: number,
    color: string,
    isComplete: boolean = false
  ): void {
    const iconColor = isComplete ? '#12d06b' : color;
    const svgString = ResourceIcons.getIconForResource(resourceId, iconColor);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      URL.revokeObjectURL(url);
      if (this.cachedCanvasTexture) {
        this.cachedCanvasTexture.needsUpdate = true;
      }
    };

    img.src = url;
  }

  private getBuildingResourceInfo(
    buildingType: string,
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

  private computeScreenSpaceScale(
    camera: THREE.Camera,
    worldPos: THREE.Vector3,
    planeWorldHeight: number,
    targetPx: number,
    renderer?: THREE.WebGLRenderer
  ): number {
    const size = renderer?.getSize(new THREE.Vector2());
    const dpr =
      renderer?.getPixelRatio?.() ??
      (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1;
    const viewportH =
      (size?.y ?? (typeof window !== 'undefined' ? window.innerHeight : 800)) * dpr;

    if ((camera as any).isOrthographicCamera) {
      const cam = camera as THREE.OrthographicCamera;
      const orthoHeight = Math.max(1e-6, cam.top - cam.bottom);
      const pxPerWorld = viewportH / orthoHeight;
      const currentPx = planeWorldHeight * pxPerWorld;
      const s = Math.round(targetPx) / Math.max(1e-6, currentPx);
      return THREE.MathUtils.clamp(s, HUD_TARGET_PX.minScale, HUD_TARGET_PX.maxScale);
    }

    if ((camera as any).isPerspectiveCamera) {
      (camera as THREE.Object3D).getWorldPosition(_camPos);
      const d = _camPos.distanceTo(worldPos);
      const cam = camera as THREE.PerspectiveCamera;
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
      const denom = Math.max(1e-6, 2 * d * tan);
      const heightToPixels = viewportH / denom;
      const s = Math.round(targetPx) / Math.max(1e-6, planeWorldHeight * heightToPixels);
      return THREE.MathUtils.clamp(s, HUD_TARGET_PX.minScale, HUD_TARGET_PX.maxScale);
    }

    return 1;
  }

  private computeWidthClampScale(
    camera: THREE.Camera,
    worldPos: THREE.Vector3,
    planeWorldHeight: number,
    targetHeightPx: number,
    aspect: number,
    maxWidthPx: number,
    renderer: THREE.WebGLRenderer
  ): number {
    // Compute current pixels per world unit using height, then derive width in px and clamp
    const baseScale = this.computeScreenSpaceScale(
      camera,
      worldPos,
      planeWorldHeight,
      targetHeightPx,
      renderer
    );
    // Predicted width in pixels if we used baseScale
    const predictedWidthPx = targetHeightPx * aspect;
    if (predictedWidthPx <= 0) return baseScale;
    const widthClamp = Math.max(1e-6, maxWidthPx / predictedWidthPx);
    return Math.min(baseScale, widthClamp * baseScale);
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
      const buildingType = data?.typeId || data?.buildingType || 'storage';
      const info = this.getBuildingResourceInfo(buildingType, data?.resourcesCollected || {});
      const baseParentScale = this.getBaseParentScale(anchor);

      const storedBaseY = (anchor as any).userData?.constructionBarY ?? HUD_WORLD_Y_OFFSET_FALLBACK;
      const extraY = (anchor as any).userData?.hudYOffset ?? 0;
      const barY = storedBaseY + extraY;
      
      if (hud) {
        const { texture, aspect, contentHeightWorld } = this.buildCombinedCanvasTexture(p, info, { disableCache: true });
        const bg = hud.getObjectByName('hudPlane') as THREE.Mesh;
        const mat = bg.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.map = texture;
        mat.needsUpdate = true;

        const baseW = contentHeightWorld * aspect;
        const planeW = baseW * HUD_CROP_X;
        const planeH = contentHeightWorld;

        const geo = bg.geometry as THREE.PlaneGeometry;
        const params = geo.parameters;
        if (params.width !== planeW || params.height !== planeH) {
          bg.geometry.dispose();
          bg.geometry = new THREE.PlaneGeometry(planeW, planeH);
        }

        // ВАЖЛИВО: повторно застосовуємо обрізання карти після заміни texture
        if (mat.map) {
          mat.map.wrapS = THREE.ClampToEdgeWrapping;
          mat.map.wrapT = THREE.ClampToEdgeWrapping;
          mat.map.repeat.set(HUD_CROP_X, 1);
          mat.map.offset.set((1 - HUD_CROP_X) * 0.5, 0);
          mat.needsUpdate = true;
        }

        (anchor as any).userData.constructionBarY = storedBaseY;
        (anchor as any).userData.hudYOffset = extraY;
      } else {
        this.attachOrUpdateCombinedHUD(object.id, anchor, p, info, barY, baseParentScale);
      }
    } else {
      // Built building: render storage HUD if internal storage present
      const buildingType = data?.typeId || data?.buildingType || 'storage';
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
            const { texture, aspect, contentHeightWorld } =
              this.buildCombinedCanvasTexture(0, resInfo, { showProgress: false, disableCache: true, title });
            const bg = hud.getObjectByName('hudPlane') as THREE.Mesh;
            const mat = bg.material as THREE.MeshBasicMaterial;
            mat.map?.dispose();
            mat.map = texture;
            mat.needsUpdate = true;

            const baseW = contentHeightWorld * aspect;
            const planeW = baseW * HUD_CROP_X;
            const planeH = contentHeightWorld;

            const geo = bg.geometry as THREE.PlaneGeometry;
            const params = geo.parameters;
            if (params.width !== planeW || params.height !== planeH) {
              bg.geometry.dispose();
              bg.geometry = new THREE.PlaneGeometry(planeW, planeH);
            }

            // ВАЖЛИВО: це було відсутнє — саме воно й ламало скейл на частині будівель
            if (mat.map) {
              mat.map.wrapS = THREE.ClampToEdgeWrapping;
              mat.map.wrapT = THREE.ClampToEdgeWrapping;
              mat.map.repeat.set(HUD_CROP_X, 1);
              mat.map.offset.set((1 - HUD_CROP_X) * 0.5, 0);
              mat.needsUpdate = true;
            }

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

  private createFallbackMesh(): THREE.Mesh {
    const material = this.material.clone();
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.position.set(0, 0, 0);
    return mesh;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.modelCache.clear();

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
