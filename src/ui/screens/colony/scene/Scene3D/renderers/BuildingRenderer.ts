import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseRenderer, SceneObject } from './BaseRenderer';
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
  resourceHeight: 48, // екранна висота всього HUD у пікселях (фіксуємо)
  minScale: 0.1,
  maxScale: 100.0,
};

// робимо HUD вужчим без втрати різкості: малюємо у центральній частці і кропимо UV
const HUD_SAFE_FRACTION = 0.25; // 25% від повної ширини canvas
const HUD_CROP_X = HUD_SAFE_FRACTION;

// Позиціонування у світі
const HUD_WORLD_Y_OFFSET_FALLBACK = 0.6;
const HUD_WORLD_Z_OFFSET = 0.035; // трохи ближче до камери

// Висоти/ширини елементів у логічних px (до множення на DPR)
const PROGRESS_HEIGHT_PX = 5;   // верхній construction-бар (у HUD)
const ROW_HEIGHT_PX      = 28;  // висота рядка ресурсу
const ICON_SIZE_PX       = 24;

const NAME_MIN_W_PX      = 120; // мін. ширина колонки "Назва"
const BAR_MIN_W_PX       = 50;  // мін. ширина прогрес-бару
const BAR_MAX_W_PX       = 160; // макс. ширина прогрес-бару
const BAR_HEIGHT_PX      = 4;   // висота прогрес-бару

const SIDE_PAD_PX        = 16;  // внутрішні поля у SAFE-області
const GAP_SMALL_PX       = 8;
const GAP_MEDIUM_PX      = 12;
const REQ_COL_W_PX       = 48;  // колонка праворуч "необхідна кількість"

// --- якість канвасу ---
const INTERNAL_SCALE = 2; // супресемплінг 2x для чітких шрифтів

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
  private readonly CANVAS_UPDATE_THROTTLE_MS = 200; // 5 разів на секунду
  private cachedCanvasTexture: THREE.CanvasTexture | null = null;

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    super(scene, renderer);
    (this as any).renderer = renderer;

    // fallback-геометрія/матеріал
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

  // ---------- публічний хелпер для рантайм-зсуву ----------
  public setHudYOffset(objectId: string, y: number) {
    const anchor = this.meshes.get(objectId);
    if (!anchor) return;
    (anchor as any).userData = (anchor as any).userData || {};
    (anchor as any).userData.hudYOffset = y;
  }

  // ---------- Render ----------
  render(object: SceneObject): THREE.Object3D {
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

    // читаємо бажаний зсув HUD по Y
    const userHudOffset = Number(data?.hudOffsetY ?? config?.ui?.hudOffsetY ?? 0);
    (container as any).userData = (container as any).userData || {};
    (container as any).userData.hudYOffset = userHudOffset;

    const isUnderConstruction = !data?.built || data?.level === 0;
    const constructionProgress = THREE.MathUtils.clamp(data?.constructionProgress ?? 0, 0, 1);

    // Fallback одразу
    const fallback = this.createFallbackMesh();
    fallback.name = 'fallback';
    container.add(fallback);

    if (isUnderConstruction) {
      const resourceInfo = this.getBuildingResourceInfo(buildingType, data?.resourcesCollected || {});
      const baseParentScale = this.getBaseParentScale(container);
      const baseY = HUD_WORLD_Y_OFFSET_FALLBACK + userHudOffset;
      this.attachOrUpdateCombinedHUD(container, constructionProgress, resourceInfo, baseY, baseParentScale);
      (container as any).userData.constructionBarY = HUD_WORLD_Y_OFFSET_FALLBACK; // збережемо «базову» без offset
    }

    // якщо немає моделі — повертаємо контейнер із fallback/HUD
    if (!config) return container;
    const modelName = config.ui?.modelName;
    if (!modelName) return container;

    const modelPath = modelName.startsWith('/') ? modelName : `/${modelName}`;
    const applyModel = (src: THREE.Group) => {
      const fb = container.getObjectByName('fallback');
      if (fb) container.remove(fb);

      const model = src.clone(true) as THREE.Group;

      // колір з конфіга
      const color = config.ui?.color;
      if (color) {
        const hex = parseInt(color.replace('#', ''), 16);
        model.traverse((child: any) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m: any) => m?.color?.setHex?.(hex));
            else (child.material as any).color?.setHex?.(hex);
          }
        });
      }

      // недобудова — напівпрозорість
      if (isUnderConstruction) {
        model.traverse((child: any) => {
          if (child.isMesh && child.material) {
            const apply = (m: any) => { m.transparent = true; m.opacity = 0.6; m.toneMapped = false; m.fog = false; };
            Array.isArray(child.material) ? child.material.forEach(apply) : apply(child.material);
          }
        });
      }

      container.add(model);

      if (isUnderConstruction) {
        const bbox = new THREE.Box3().setFromObject(model);
        const h = Math.max(0.001, bbox.max.y - bbox.min.y);
        const baseY = bbox.max.y + 0.15 * h; // «чиста» висота
        (container as any).userData.constructionBarY = baseY; // запам'ятаємо

        const baseParentScale = this.getBaseParentScale(container);
        const resourceInfo = this.getBuildingResourceInfo(buildingType, data?.resourcesCollected || {});
        // передаємо barY + offset
        this.attachOrUpdateCombinedHUD(
          container,
          constructionProgress,
          resourceInfo,
          baseY + userHudOffset,
          baseParentScale
        );
      } else {
        this.removeHUD(container);
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
    anchor: THREE.Object3D,
    constructionProgress: number,
    resourceInfo: ResourceInfo,
    barY: number,               // УЖЕ з урахуванням offset, якщо треба
    baseParentScale: number
  ): void {
    let hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;

    const { texture, aspect, contentHeightWorld } =
      this.buildCombinedCanvasTexture(constructionProgress, resourceInfo);

    // геометрія площини: висота фіксована, ширина = aspect * height, потім кроп по X
    const baseW = contentHeightWorld * aspect;
    const baseH = contentHeightWorld;
    const planeW = baseW * HUD_CROP_X;
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

      // кроп UV по X
      if ((bg.material as THREE.MeshBasicMaterial).map) {
        const map = (bg.material as THREE.MeshBasicMaterial).map!;
        map.wrapS = THREE.ClampToEdgeWrapping;
        map.wrapT = THREE.ClampToEdgeWrapping;
        map.repeat.set(HUD_CROP_X, 1);
        map.offset.set((1 - HUD_CROP_X) * 0.5, 0);
        map.needsUpdate = true;
      }

      hud.add(bg);

      const rendererRef = (this as any).renderer as THREE.WebGLRenderer | undefined;
      (bg as any).onBeforeRender = (_r: any, _s: any, camera: THREE.Camera) => {
        // беремо додатковий зсув із userData (щоб працювало і при зміні в рантаймі)
        const extraY = (anchor as any).userData?.hudYOffset ?? 0;

        // позиція над anchor
        _localOffset.set(0, barY + extraY, 0);
        anchor.updateWorldMatrix(true, false);
        anchor.localToWorld(_worldPos.copy(_localOffset));

        // білбординг
        (camera as THREE.Object3D).getWorldQuaternion(_qCam);
        hud!.quaternion.copy(_qCam);

        // розводка трохи до камери
        (camera as any).getWorldDirection?.(_viewDir) ?? _viewDir.set(0, 0, -1).applyQuaternion(_qCam);
        const pos = _worldPos.clone().addScaledVector(_viewDir, -HUD_WORLD_Z_OFFSET);
        hud!.position.copy(pos);

        // anti-scale
        anchor.getWorldScale(_worldScale);
        const sx = _worldScale.x || 1, sy = _worldScale.y || 1, sz = _worldScale.z || 1;
        const base = 1 / Math.max(baseParentScale, 1e-6);
        const anti = base / Math.max(Math.max(sx, sy), sz);

        // screen-space lock по висоті (снап до цілого px)
        const screenS = this.computeScreenSpaceScale(
          camera, hud!.position, planeH, Math.round(HUD_TARGET_PX.resourceHeight), rendererRef
        );
        const final = anti * screenS;
        hud!.scale.set(final, final, final);
      };

      this.scene.add(hud);
      (anchor as any).userData = (anchor as any).userData || {};
      (anchor as any).userData.combinedHUD = hud;
    } else {
      // оновлення існуючого HUD
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
        mat.map.repeat.set(HUD_CROP_X, 1);
        mat.map.offset.set((1 - HUD_CROP_X) * 0.5, 0);
        mat.map.needsUpdate = true;
      }
    }
  }

  private removeHUD(anchor: THREE.Object3D) {
    const hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;
    if (hud) {
      this.scene.remove(hud);
      (anchor as any).userData.combinedHUD = undefined;
    }
  }

  // ---------- Canvas builder ----------
  private buildCombinedCanvasTexture(
    constructionProgress: number,
    resourceInfo: ResourceInfo
  ): { texture: THREE.CanvasTexture; aspect: number; contentHeightWorld: number } {
    // Throttling для перемальовки канвасу
    const now = Date.now();
    if (now - this.lastCanvasUpdate < this.CANVAS_UPDATE_THROTTLE_MS) {
      return this.getCachedCanvasTexture();
    }
    this.lastCanvasUpdate = now;

    // супресемплінг * POT для чіткості / коректних міпів
    const rendererDpr =
      this.renderer?.getPixelRatio?.() ??
      (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1;
    const dpr = rendererDpr * INTERNAL_SCALE;

    const baseWidth = 1024; // логічні px по ширині (до множення на dpr)
    const widthRaw = Math.round(baseWidth * dpr);

    const rows = Math.max(1, Object.keys(resourceInfo.required).length);
    const pad  = Math.round(12 * dpr);

    const progressH = Math.round(PROGRESS_HEIGHT_PX * dpr);
    const rowH      = Math.round(ROW_HEIGHT_PX * dpr);
    const vGap      = Math.round(10 * dpr);

    const heightRaw = pad + progressH + vGap + rows * rowH + pad;

    // Округляємо до степенів двійки для міпмапів (не змінюємо розкладку контенту всередині)
    const toPOT = (v: number) => THREE.MathUtils.ceilPowerOfTwo(Math.max(2, v));
    const width  = toPOT(widthRaw);
    const height = toPOT(heightRaw);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // фон (малюємо по всій POT-текстурі)
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, width, height);

    // SAFE-область по ширині (рахуємо від widthRaw, щоб контент не «плив»)
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

    // Верхній ПРОГРЕС усередині SAFE
    const progressX = contentLeft;
    const progressW = Math.max(1, contentRight - contentLeft);
    const progressY = pad;

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

    // Рядки ресурсів (також у SAFE)
    const iconSize = px(ICON_SIZE_PX);
    const iconX = contentLeft;

    const reqX = contentRight;         // правий край числа "required"
    const rightLimit = reqX - reqColW; // межа для бару

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
    const startY = progressY + progressH + vGap;

    for (const [resourceId, reqAmt] of Object.entries(resourceInfo.required)) {
      const got = resourceInfo.collected[resourceId] || 0;
      const miss = Math.max(0, reqAmt - got);
      const done = miss === 0;

      const rowCenterY = startY + i * rowH + Math.round(rowH * 0.5);

      // розподіл місця між назвою і баром
      let nameMaxW = Math.round(availableBetween * 0.55);
      let barW     = availableBetween - nameMaxW;

      if (nameMaxW < NAME_MIN_W) { const d = NAME_MIN_W - nameMaxW; nameMaxW += d; barW -= d; }
      if (barW < BAR_MIN_W)       { const d = BAR_MIN_W - barW;     barW += d;     nameMaxW -= d; }
      nameMaxW = Math.max(px(80), nameMaxW);
      barW     = Math.min(BAR_MAX_W, Math.max(BAR_MIN_W, barW));

      const barX = nameX + nameMaxW + gapM;

      // іконка (SVG → Image → drawImage)
      const res = RESOURCES_DB[resourceId as ResourceId];
      const hex = res?.color ?? '#cccccc';
      const iconY = rowCenterY - Math.round(iconSize / 2);
      this.drawResourceIcon(ctx, resourceId, iconX, iconY, iconSize, hex, done);

      // назва
      const name = res?.name ?? resourceId;
      const nameY = rowCenterY + px(1);
      ctx.fillStyle = done ? '#12d06b' : '#ffffff';
      const clippedName = truncateText(name, nameMaxW, nameFont);
      ctx.font = nameFont;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(clippedName, nameX, nameY);

      // прогрес-бар
      const p = reqAmt > 0 ? Math.max(0, Math.min(1, got / reqAmt)) : 1;
      const bY = rowCenterY - Math.round(barH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(barX - px(2), bY - px(2), barW + px(4), barH + px(4));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, bY, barW, barH);
      ctx.fillStyle = done ? '#12d06b' : '#ff4444';
      ctx.fillRect(barX, bY, Math.max(px(6), Math.round(barW * p)), barH);

      // required праворуч
      ctx.font = qtyFont;
      ctx.fillStyle = '#e6e6e6';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText(String(reqAmt), reqX, rowCenterY);

      i++;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true; // POT → міпи ок
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    texture.needsUpdate = true;

    // Оновлюємо кеш
    this.cachedCanvasTexture = texture;

    // aspect беремо від "контентних" розмірів, не POT
    const aspect = widthRaw / heightRaw;
    const contentHeightWorld = 1.0; // довільна world-висота (екранну фіксуємо через screen-lock)

    return { texture, aspect, contentHeightWorld };
  }

  // ---------- Helpers ----------
  /**
   * Повертає кешовану текстуру канвасу
   */
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
      aspect: 1,
      contentHeightWorld: 1
    };
  }

  /**
   * Малює SVG іконку ресурсу на канвасі (і тригерить оновлення текстури)
   */
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
      // малюємо напряму в основний canvas
      ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      URL.revokeObjectURL(url);

      // 🔥 текстура вже створена — позначаємо, що її треба перевантажити
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

    // ORTHO
    if ((camera as any).isOrthographicCamera) {
      const cam = camera as THREE.OrthographicCamera;
      const orthoHeight = Math.max(1e-6, cam.top - cam.bottom);
      const pxPerWorld = viewportH / orthoHeight;
      const currentPx = planeWorldHeight * pxPerWorld;
      const s = Math.round(targetPx) / Math.max(1e-6, currentPx);
      return THREE.MathUtils.clamp(s, HUD_TARGET_PX.minScale, HUD_TARGET_PX.maxScale);
    }

    // PERSPECTIVE
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

  // ---------- Update / Dispose ----------
  public update(object: SceneObject): void {
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

      // базовий barY (без урахування offset)
      const storedBaseY = (anchor as any).userData?.constructionBarY ?? HUD_WORLD_Y_OFFSET_FALLBACK;
      const extraY = (anchor as any).userData?.hudYOffset ?? 0;
      const barY = storedBaseY + extraY;

      if (hud) {
        const { texture, aspect, contentHeightWorld } = this.buildCombinedCanvasTexture(p, info);
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

        if (mat.map) {
          mat.map.wrapS = THREE.ClampToEdgeWrapping;
          mat.map.wrapT = THREE.ClampToEdgeWrapping;
          mat.map.repeat.set(HUD_CROP_X, 1);
          mat.map.offset.set((1 - HUD_CROP_X) * 0.5, 0);
          mat.map.needsUpdate = true;
        }

        // зберігаємо barY у userData, щоб onBeforeRender мав актуальне значення
        (anchor as any).userData.constructionBarY = storedBaseY;
        (anchor as any).userData.hudYOffset = extraY;
      } else {
        this.attachOrUpdateCombinedHUD(anchor, p, info, barY, baseParentScale);
      }
    } else {
      this.removeHUD(anchor);
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

    this.meshes.forEach((mesh) => {
      const hud = (mesh as any).userData?.combinedHUD as THREE.Group | undefined;
      if (hud) this.scene.remove(hud);
    });

    this.meshes.forEach((mesh) => this.scene.remove(mesh));
    this.meshes.clear();

    this.modelCache.clear();
  }
}
