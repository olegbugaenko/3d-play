import * as THREE from 'three';
import { BaseRenderer } from './BaseRenderer';
import { UiLogicBridge } from '@ui/logic/UiLogicBridge';
import { TSceneObject } from '@logic/systems/scene/scene.types';

interface RoadSegment {
  startLeft: THREE.Vector3;
  startRight: THREE.Vector3;
  endLeft: THREE.Vector3;
  endRight: THREE.Vector3;
  width: number;
}

export class RoadRenderer extends BaseRenderer {
  private roadMaterial: THREE.Material;
  private plannedRoadMaterial: THREE.Material;
  private roadSegments: Map<string, RoadSegment[]> = new Map();
  private uiLogicBridge: UiLogicBridge | null = null;

  // HUD helpers (mirrors BuildingRenderer pattern)
  private cachedCanvasTexture: THREE.CanvasTexture | null = null;
  private lastAspect = 1;
  private lastContentHeightWorld = 1;

  // For roads use full canvas width to avoid left cropping
  private readonly HUD_SAFE_FRACTION = 1.0;
  private readonly HUD_CROP_X = 1.0;
  private readonly HUD_WORLD_Z_OFFSET = 0.035;

  private readonly PROGRESS_HEIGHT_PX = 5;
  private readonly ROW_HEIGHT_PX = 28;
  private readonly ICON_SIZE_PX = 24;
  private readonly BAR_MIN_W_PX = 50;
  private readonly BAR_HEIGHT_PX = 4;
  private readonly SIDE_PAD_PX = 16;
  private readonly GAP_SMALL_PX = 8;
  private readonly GAP_MEDIUM_PX = 12;

  private readonly HUD_TARGET_PX = { resourceHeight: 84, minScale: 0.1, maxScale: 100.0, maxWidth: 280 } as const;
    private readonly NAME_MIN_W_PX = 110;
    private readonly BAR_MAX_W_PX = 120;
    private readonly REQ_COL_W_PX = 42;
    private readonly INTERNAL_SCALE = 2;

  constructor(scene: THREE.Scene) {
    super(scene);
    this.roadMaterial = this.createRoadMaterial();
    this.plannedRoadMaterial = this.createPlannedRoadMaterial();
  }

  public setUiLogicBridge(bridge: UiLogicBridge): void {
    this.uiLogicBridge = bridge;
  }

  private createRoadMaterial(): THREE.Material {
    // Поки що простий матеріал з коричневим кольором
    // Пізніше замінимо на текстуру
    return new THREE.MeshLambertMaterial({
      color: 0x8B4513, // коричневий колір
      transparent: false,
      side: THREE.DoubleSide
    });
  }

  private createPlannedRoadMaterial(): THREE.Material {
    // Матеріал для запланованих доріг (напівпрозорий)
    return new THREE.MeshLambertMaterial({
      color: 0x8B4513, // той же коричневий колір
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5 // напівпрозорість
    });
  }

  render(object: TSceneObject): THREE.Object3D {
    // console.log('RoadRender: ', object);
    // Перевіряємо чи це дорога
    if (!object.data?.roadSegments || !Array.isArray(object.data.roadSegments)) {
      console.warn(`RoadRenderer: object ${object.id} doesn't have road segments data`);
      return new THREE.Object3D();
    }

    const roadGroup = new THREE.Group();
    roadGroup.name = `road-${object.id}`;

    // Конвертуємо дані сегментів у формат RoadSegment
    const rawSegments = object.data.roadSegments;
    const segments: RoadSegment[] = rawSegments.map((seg: any) => ({
      startLeft: new THREE.Vector3(seg.startLeft.x, seg.startLeft.y, seg.startLeft.z),
      startRight: new THREE.Vector3(seg.startRight.x, seg.startRight.y, seg.startRight.z),
      endLeft: new THREE.Vector3(seg.endLeft.x, seg.endLeft.y, seg.endLeft.z),
      endRight: new THREE.Vector3(seg.endRight.x, seg.endRight.y, seg.endRight.z),
      width: seg.width
    }));
    
    this.roadSegments.set(object.id, segments);

    // Створюємо геометрію для кожного сегменту
    const isPlanned = object.data?.plannedOnly || false;
    const segmentStates = object.data?.segmentStates || [];
    const logicalLines = (segmentStates as any[]).map((s: any) => ({
      a: new THREE.Vector3(s.startPoint?.x ?? 0, s.startPoint?.y ?? 0, s.startPoint?.z ?? 0),
      b: new THREE.Vector3(s.endPoint?.x ?? 0, s.endPoint?.y ?? 0, s.endPoint?.z ?? 0)
    }));
    
    segments.forEach((segment, index) => {
      // Знаходимо батьківський логічний сегмент для цього підсегмента
      const parentIdx = this.findParentLogicalSegmentIndex(segment, logicalLines);
      const parentState = segmentStates[parentIdx];
      // Якщо вся дорога збудована (object.data.built) - всі сегменти вважаються збудованими
      const isSegmentPlanned = (isPlanned || !object.data?.built) && parentState?.buildingState !== 'completed';
      console.log(`Road: ${object.id}`, isPlanned, object.data?.built, parentState, isSegmentPlanned);
      const segmentMesh = this.createSegmentMesh(segment, `${object.id}_segment_${index}`, isSegmentPlanned);
      roadGroup.add(segmentMesh);
    });

    // Позиція групи залишається 0,0,0 оскільки кожен сегмент має власні координати
    roadGroup.position.set(0, 0, 0);

    this.addMesh(object.id, roadGroup);

    // HUD над центром ПЕРШОГО сегмента
    if (this.uiLogicBridge) {
      const info = this.getRoadResourceInfo(object.id);
      if (info && info.segmentsBuilt < info.segmentsTotal) {
        // Обчислюємо anchor з першого сегмента
        const first = segments[0];
        const c0 = new THREE.Vector3().addVectors(first.startLeft, first.startRight).multiplyScalar(0.5);
        const c1 = new THREE.Vector3().addVectors(first.endLeft, first.endRight).multiplyScalar(0.5);
        const head = new THREE.Vector3().addVectors(c0, c1).multiplyScalar(0.5);
        let hudAnchor = roadGroup.getObjectByName('hudAnchor') as THREE.Object3D | null;
        if (!hudAnchor) {
          hudAnchor = new THREE.Object3D();
          hudAnchor.name = 'hudAnchor';
          roadGroup.add(hudAnchor);
        }
        hudAnchor.position.copy(head);
        const title = `Segments: ${info.segmentsBuilt}/${info.segmentsTotal}`;
        this.attachOrUpdateCombinedHUD(hudAnchor, info.progress, info, 0.6, 1, { title });
      } else {
        console.log(`[RoadRenderer.render] Not showing HUD for road ${object.id} - all segments completed`);
      }
    }
    return roadGroup;
  }

  private createSegmentMesh(segment: RoadSegment, name: string, isPlanned: boolean = false): THREE.Mesh {
    const { startLeft, startRight, endLeft, endRight } = segment;
    
    // Створюємо геометрію з 4 вершин
    const geometry = new THREE.BufferGeometry();
    
    // Визначаємо вершини (порядок важливий для правильних нормалей)
    const vertices = new Float32Array([
      // Трикутник 1: startLeft -> startRight -> endLeft
      startLeft.x, startLeft.y, startLeft.z,
      startRight.x, startRight.y, startRight.z,
      endLeft.x, endLeft.y, endLeft.z,
      
      // Трикутник 2: startRight -> endRight -> endLeft
      startRight.x, startRight.y, startRight.z,
      endRight.x, endRight.y, endRight.z,
      endLeft.x, endLeft.y, endLeft.z,
    ]);
    
    // Текстурні координати
    const uvs = new Float32Array([
      // Трикутник 1
      0.0, 0.0,   // startLeft
      1.0, 0.0,   // startRight
      0.0, 1.0,   // endLeft
      
      // Трикутник 2
      1.0, 0.0,   // startRight
      1.0, 1.0,   // endRight
      0.0, 1.0,   // endLeft
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    // Автоматично обчислюємо нормалі
    geometry.computeVertexNormals();
    
    // Створюємо меш з відповідним матеріалом
    let material: THREE.Material;
    if (isPlanned) {
      material = this.plannedRoadMaterial;
    } else {
      // Гарантовано непрозорий матеріал для завершених сегментів
      const base = this.roadMaterial as THREE.MeshLambertMaterial;
      const opaque = base.clone();
      opaque.transparent = false;
      opaque.opacity = 1.0;
      opaque.depthWrite = true;
      opaque.depthTest = true;
      opaque.needsUpdate = true;
      material = opaque;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;

    console.log('createSegmentMesh called: ', isPlanned);
    
    return mesh;
  }

  // Визначає індекс логічного сегмента (startPoint-endPoint) для підсегмента за мінімальною сумою відстаней до лінії
  private findParentLogicalSegmentIndex(sub: RoadSegment, lines: { a: THREE.Vector3; b: THREE.Vector3 }[]): number {
    if (!lines.length) return 0;
    // Центр підсегмента
    const c0 = new THREE.Vector3().addVectors(sub.startLeft, sub.startRight).multiplyScalar(0.5);
    const c1 = new THREE.Vector3().addVectors(sub.endLeft, sub.endRight).multiplyScalar(0.5);
    const mid = new THREE.Vector3().addVectors(c0, c1).multiplyScalar(0.5);

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < lines.length; i++) {
      const d = this.pointToSegmentDistance(mid, lines[i].a, lines[i].b);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  }

  private pointToSegmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    const proj = new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
    return proj.distanceTo(p);
  }


  update(object: TSceneObject): void {
    // Базове оновлення позиції від BaseRenderer
    super.update(object);
    
    // Додаткова логіка оновлення дороги якщо потрібно
    const roadGroup = this.meshes.get(object.id);
    if (roadGroup && object.data?.roadSegments) {
      // Якщо сегменти змінилися - перебудовуємо дорогу
      const currentSegments = this.roadSegments.get(object.id);
      const newSegments = object.data.roadSegments;
      const segmentStates = object.data?.segmentStates || [];
        if (!this.segmentsEqual(currentSegments, newSegments) || this.segmentStatesChanged(object.id, segmentStates)) {
          this.remove(object.id);
          this.render(object);
          console.log('Re-render: ', object, !!this.uiLogicBridge);
        }

      // Оновлюємо HUD
      if (this.uiLogicBridge) {
        const info = this.getRoadResourceInfo(object.id);
        console.log(`[RoadRenderer.update] Road ${object.id} HUD check:`, {
          hasInfo: !!info,
          segmentsBuilt: info?.segmentsBuilt,
          segmentsTotal: info?.segmentsTotal,
          shouldShowHUD: info && info.segmentsBuilt < info.segmentsTotal
        });
        if (info && info.segmentsBuilt < info.segmentsTotal) {
          // Anchor до першого сегмента
          const first = (newSegments as RoadSegment[])[0];
          const c0 = new THREE.Vector3().addVectors(first.startLeft, first.startRight).multiplyScalar(0.5);
          const c1 = new THREE.Vector3().addVectors(first.endLeft, first.endRight).multiplyScalar(0.5);
          const head = new THREE.Vector3().addVectors(c0, c1).multiplyScalar(0.5);
          let hudAnchor = roadGroup.getObjectByName('hudAnchor') as THREE.Object3D | null;
          if (!hudAnchor) { hudAnchor = new THREE.Object3D(); hudAnchor.name = 'hudAnchor'; roadGroup.add(hudAnchor); }
          hudAnchor.position.copy(head);
          const title = `Segments: ${info.segmentsBuilt}/${info.segmentsTotal}`;
          this.attachOrUpdateCombinedHUD(hudAnchor, info.progress, info, 0.6, 1, { title });
        } else {
          console.log(`[RoadRenderer.update] Removing HUD for road ${object.id} - all segments completed`);
          const hudAnchor = roadGroup.getObjectByName('hudAnchor') as THREE.Object3D | null;
          if (hudAnchor) {
            this.removeHUD(hudAnchor);
          }
        }
      }
    }
  }

  private segmentsEqual(segments1?: RoadSegment[], segments2?: RoadSegment[]): boolean {
    if (!segments1 || !segments2) return false;
    if (segments1.length !== segments2.length) return false;
    
    return segments1.every((seg1, index) => {
      const seg2 = segments2[index];
      return seg1.startLeft.equals(seg2.startLeft) && 
             seg1.startRight.equals(seg2.startRight) &&
             seg1.endLeft.equals(seg2.endLeft) && 
             seg1.endRight.equals(seg2.endRight) && 
             seg1.width === seg2.width;
    });
  }

  // Кеш для відстеження останнього стану сегментів
  private lastSegmentStates = new Map<string, any[]>();

  private segmentStatesChanged(roadId: string, newStates: any[]): boolean {
    const lastStates = this.lastSegmentStates.get(roadId);
    
    if (!lastStates) {
      this.lastSegmentStates.set(roadId, newStates.map(s => ({ ...s })));
      return true;
    }
    
    if (lastStates.length !== newStates.length) {
      this.lastSegmentStates.set(roadId, newStates.map(s => ({ ...s })));
      return true;
    }
    
    const hasChanged = lastStates.some((lastState, index) => {
      const newState = newStates[index];
      return lastState?.buildingState !== newState?.buildingState || 
             lastState?.constructionProgress !== newState?.constructionProgress;
    });

    console.log('hasChanged: ', hasChanged, newStates.map((s,i) => `${i}:${s.id}:${s.buildingState}`).toString(), lastStates.map((s,i) => `${i}:${s.id}:${s.buildingState}`).toString());
    
    // ВАЖЛИВО: оновлюємо кеш ТІЛЬКИ якщо є зміни
    if (hasChanged) {
      this.lastSegmentStates.set(roadId, newStates.map(s => ({ ...s })));
    }
    
    return hasChanged;
  }

  /**
   * Видаляє дорогу за ID
   */
  public removeRoad(roadId: string): void {
    this.remove(roadId);
    this.roadSegments.delete(roadId);
    this.lastSegmentStates.delete(roadId);
  }

  /**
   * Очищає всі дороги
   */
  public clearAllRoads(): void {
    for (const roadId of this.roadSegments.keys()) {
      this.remove(roadId);
    }
    this.roadSegments.clear();
  }

  public dispose(): void {
    super.dispose();
    this.roadSegments.clear();
    
    // Очищаємо матеріали
    if (this.roadMaterial) {
      this.roadMaterial.dispose();
    }
    if (this.plannedRoadMaterial) {
      this.plannedRoadMaterial.dispose();
    }
  }

  // ---------- Combined HUD (mirrors BuildingRenderer) ----------
  private attachOrUpdateCombinedHUD(
    anchor: THREE.Object3D,
    constructionProgress: number,
    resourceInfo: { required: Record<string, number>; collected: Record<string, number>; missing: Record<string, number>; progress: number; segmentsBuilt: number; segmentsTotal: number; },
    barY: number,
    baseParentScale: number,
    options?: { showProgress?: boolean; disableCache?: boolean; title?: string }
  ): void {
    let hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;
    const { texture, aspect, contentHeightWorld } = this.buildCombinedCanvasTexture(constructionProgress, resourceInfo, options);
    const baseW = contentHeightWorld * aspect;
    const baseH = contentHeightWorld;
    const cropX = this.HUD_CROP_X;
    const planeW = baseW * cropX;
    const planeH = baseH;

    if (!hud) {
      hud = new THREE.Group();
      hud.name = 'combinedHUD';
      hud.renderOrder = 1100;
      hud.frustumCulled = false;
      const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(planeW, planeH),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1.0, side: THREE.DoubleSide, toneMapped: false, fog: false, depthTest: false, depthWrite: false })
      );
      bg.name = 'hudPlane';
      if ((bg.material as THREE.MeshBasicMaterial).map) {
        const map = (bg.material as THREE.MeshBasicMaterial).map!;
        map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
        map.repeat.set(cropX, 1); map.offset.set((1 - cropX) * 0.5, 0); map.needsUpdate = true;
      }
      hud.add(bg);

      const rendererRef = (this as any).renderer as THREE.WebGLRenderer | undefined;
      const _qCam = new THREE.Quaternion();
      const _viewDir = new THREE.Vector3();
      const _worldPos = new THREE.Vector3();
      const _localOffset = new THREE.Vector3();
      const _worldScale = new THREE.Vector3();

      (bg as any).onBeforeRender = (_r: any, _s: any, camera: THREE.Camera) => {
        const extraY = (anchor as any).userData?.hudYOffset ?? 0;
        _localOffset.set(0, barY + extraY, 0);
        anchor.updateWorldMatrix(true, false);
        anchor.localToWorld(_worldPos.copy(_localOffset));
        (camera as any).getWorldQuaternion?.(_qCam) ?? _qCam.identity();
        hud!.quaternion.copy(_qCam);
        (camera as any).getWorldDirection?.(_viewDir) ?? _viewDir.set(0, 0, -1).applyQuaternion(_qCam);
        const pos = _worldPos.clone().addScaledVector(_viewDir, -this.HUD_WORLD_Z_OFFSET);
        hud!.position.copy(pos);

        anchor.getWorldScale(_worldScale);
        const base = 1 / Math.max(baseParentScale, 1e-6);
        const screenS = this.computeScreenSpaceScale(camera, hud!.position, planeH, Math.round(this.HUD_TARGET_PX.resourceHeight), rendererRef);
        let final = base * screenS;
        if (rendererRef) {
          const pxScale = this.computeWidthClampScale(camera, hud!.position, planeH, Math.round(this.HUD_TARGET_PX.resourceHeight), planeW / planeH, this.HUD_TARGET_PX.maxWidth, rendererRef);
          final = Math.min(final, pxScale);
        }
        hud!.scale.set(final, final, final);
      };

      this.scene.add(hud);
      (anchor as any).userData = (anchor as any).userData || {};
      (anchor as any).userData.combinedHUD = hud;
    } else {
      const bg = hud.getObjectByName('hudPlane') as THREE.Mesh;
      const mat = bg.material as THREE.MeshBasicMaterial;
      mat.map?.dispose(); mat.map = texture; mat.needsUpdate = true;
      const geo = bg.geometry as THREE.PlaneGeometry;
      const params = geo.parameters;
      if (params.width !== planeW || params.height !== planeH) {
        bg.geometry.dispose(); bg.geometry = new THREE.PlaneGeometry(planeW, planeH);
      }
      if (mat.map) { mat.map.wrapS = THREE.ClampToEdgeWrapping; mat.map.wrapT = THREE.ClampToEdgeWrapping; mat.map.repeat.set(cropX, 1); mat.map.offset.set((1 - cropX) * 0.5, 0); mat.needsUpdate = true; }
    }
  }

  private removeHUD(anchor: THREE.Object3D): void {
    const hud = (anchor as any).userData?.combinedHUD as THREE.Group | undefined;
    console.log(`[RoadRenderer.removeHUD] Anchor:`, anchor.name, `HUD found:`, !!hud);
    if (hud) { 
      // Видаляємо HUD зі сцени
      this.scene.remove(hud);
      
      // Також робимо невидимим на всякий випадок
      hud.visible = false;
      
      // Очищаємо всі дочірні об'єкти HUD
      hud.clear();
      
      // Видаляємо матеріали та геометрії
      hud.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      
      // Очищаємо посилання
      (anchor as any).userData.combinedHUD = undefined;
      console.log(`[RoadRenderer.removeHUD] HUD removed from scene and disposed`);
    }
  }

  
  private buildCombinedCanvasTexture(
    constructionProgress: number,
    resourceInfo: { required: Record<string, number>; collected: Record<string, number>; missing: Record<string, number>; progress: number; segmentsBuilt: number; segmentsTotal: number; },
    options?: { showProgress?: boolean; disableCache?: boolean; title?: string }
  ): { texture: THREE.CanvasTexture; aspect: number; contentHeightWorld: number } {
    const showProgress = options?.showProgress !== false;
  
    const now = Date.now();
    if (!options?.disableCache && now - (this as any).lastCanvasUpdate < 200) {
      const { texture } = this.getCachedCanvasTexture();
      return { texture, aspect: this.lastAspect, contentHeightWorld: this.lastContentHeightWorld };
    }
    (this as any).lastCanvasUpdate = now;
  
    // БІЛЬШИЙ ТАРГЕТНИЙ РОЗМІР + без *1.5 (який зменшував ефективний розмір після clamp)
    const rendererDpr = (this as any).renderer?.getPixelRatio?.() ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1;
    const dpr = rendererDpr * this.INTERNAL_SCALE;
  
    // UI розміри в CSS-пікселях (до множення на dpr)
    const TITLE_PX = 18;
    const NAME_PX  = 20;
    const QTY_PX   = 18;
    const ROW_H    = this.ROW_HEIGHT_PX;      // 28
    const PROG_H   = this.PROGRESS_HEIGHT_PX; // 5
  
    // Функція "px → dev px"
    const px = (v: number) => Math.round(v * dpr);
  
    const rows = Math.max(1, Object.keys(resourceInfo.required).length);
    const pad = px(12);
    const vGap = px(10);
    const sidePad = px(this.SIDE_PAD_PX);   // 16
    const gapS = px(this.GAP_SMALL_PX);     // 8
    const gapM = px(this.GAP_MEDIUM_PX);    // 12
    const iconSize = px(this.ICON_SIZE_PX); // 24
    const reqColW = px(this.REQ_COL_W_PX);  // 42
    const barH = px(this.BAR_HEIGHT_PX + 2);
    const titleH = options?.title ? px(TITLE_PX + 2) : 0;
    const progressH = showProgress ? px(PROG_H) : 0;
  
    // ---------- PASS 1: вимірюємо текст, рахуємо мінімально потрібну ширину ----------
    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d')!;
    sctx.textBaseline = 'alphabetic';
    sctx.font = `${px(NAME_PX)}px Inter, Arial, sans-serif`;
  
    let longestNamePx = 0;
    for (const name of Object.keys(resourceInfo.required)) {
      longestNamePx = Math.max(longestNamePx, Math.ceil(sctx.measureText(name).width));
    }
  
    const NAME_MIN_W = px(this.NAME_MIN_W_PX);      // 110*dpr
    const NAME_MAX_W = px(220);                     // жорстка “стеля”, щоб не роздувати HUD
    let nameColW = Math.max(NAME_MIN_W, Math.min(longestNamePx, NAME_MAX_W));
  
    const BAR_MIN_W = px(this.BAR_MIN_W_PX);        // 50*dpr
    const BAR_MAX_W = px(this.BAR_MAX_W_PX);        // 120*dpr
    const barW = Math.max(BAR_MIN_W, Math.min(BAR_MAX_W, px(120)));
  
    // Загальна ширина контенту без урахування safe-fraction/crop
    const contentW =
      sidePad + iconSize + gapS + nameColW + gapM + barW + gapM + reqColW + sidePad;
  
    // Висота контенту
    const progressBlock = showProgress ? (progressH + vGap) : 0;
    const titleBlock = titleH ? (titleH + vGap) : 0;
    const heightRaw = pad + titleBlock + progressBlock + rows * px(ROW_H) + pad;
  
    // Робимо невеличкий буфер по ширині, але без гігантського 1224
    const widthRaw = Math.max(px(420), contentW);
  
    // Підженемо під power-of-two (з теґом кріспності)
    const toPOT = (v: number) => THREE.MathUtils.ceilPowerOfTwo(Math.max(2, v));
    const width  = toPOT(widthRaw);
    const height = toPOT(heightRaw);
  
    // ---------- PASS 2: малюємо реальний канвас ----------
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
  
    // Фон
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, width, height);
  
    // Content bounds
    const safeX = 0; // ми малюємо рівно під ширину контенту
    const contentLeft = safeX + sidePad;
    const contentRight = safeX + widthRaw - sidePad;
  
    // Тексти
    const nameFont = `${px(NAME_PX)}px Inter, Arial, sans-serif`;
    const qtyFont  = `${px(QTY_PX)}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
  
    // Заголовок
    let cursorTop = pad;
    if (options?.title) {
      ctx.font = `${px(TITLE_PX)}px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(options.title, contentLeft, cursorTop + px(2));
      cursorTop += titleH + vGap;
    }
  
    // Прогрес
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
        Math.max(px(6), Math.round(progressW * THREE.MathUtils.clamp(resourceInfo.progress, 0, 1))),
        progressH
      );
      cursorTop += progressH + vGap;
    }
  
    // Колонки
    const iconX = contentLeft;
    const nameX = iconX + iconSize + gapS;
    const barX  = nameX + nameColW + gapM;
    const reqX  = contentRight; // правий стовпчик чисел
  
    // Рядки ресурсів
    let i = 0;
    for (const [resourceId, reqAmt] of Object.entries(resourceInfo.required)) {
      const rowCenterY = cursorTop + i * px(ROW_H) + Math.round(px(ROW_H) * 0.5);
  
      // Назва
      ctx.font = nameFont;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(resourceId, nameX, rowCenterY + px(1));
  
      // Бар
      const got = resourceInfo.collected[resourceId] || 0;
      const done = (reqAmt <= got);
      const p = reqAmt > 0 ? Math.max(0, Math.min(1, got / reqAmt)) : 1;
      const bY = rowCenterY - Math.round(barH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(barX - px(2), bY - px(2), barW + px(4), barH + px(4));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, bY, barW, barH);
      ctx.fillStyle = done ? '#12d06b' : '#ff4444';
      ctx.fillRect(barX, bY, Math.max(px(6), Math.round(barW * p)), barH);
  
      // Кількість
      ctx.font = qtyFont;
      ctx.fillStyle = '#e6e6e6';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(reqAmt)), reqX, rowCenterY);
  
      i++;
    }
  
    // Текстура
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = (this as any).renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    texture.needsUpdate = true;
  
    this.cachedCanvasTexture = texture;
  
    // Менше aspect → менше шансів потрапити під width-clamp
    const aspect = widthRaw / heightRaw;
    const contentHeightWorld = 1.0;
    this.lastAspect = aspect;
    this.lastContentHeightWorld = contentHeightWorld;
  
    return { texture, aspect, contentHeightWorld };
  }
  

  private getCachedCanvasTexture(): { texture: THREE.CanvasTexture; aspect: number; contentHeightWorld: number } {
    if (!this.cachedCanvasTexture) {
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2; const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; this.cachedCanvasTexture = tex;
    }
    return { texture: this.cachedCanvasTexture, aspect: this.lastAspect, contentHeightWorld: this.lastContentHeightWorld };
  }

  private computeScreenSpaceScale(camera: THREE.Camera, worldPos: THREE.Vector3, planeWorldHeight: number, targetPx: number, renderer?: THREE.WebGLRenderer): number {
    const size = renderer?.getSize(new THREE.Vector2()); const dpr = renderer?.getPixelRatio?.() ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1; const viewportH = (size?.y ?? (typeof window !== 'undefined' ? window.innerHeight : 800)) * dpr;
    if ((camera as any).isOrthographicCamera) { const cam = camera as THREE.OrthographicCamera; const orthoHeight = Math.max(1e-6, cam.top - cam.bottom); const pxPerWorld = viewportH / orthoHeight; const currentPx = planeWorldHeight * pxPerWorld; const s = Math.round(targetPx) / Math.max(1e-6, currentPx); return THREE.MathUtils.clamp(s, this.HUD_TARGET_PX.minScale, this.HUD_TARGET_PX.maxScale); }
    if ((camera as any).isPerspectiveCamera) { const _camPos = new THREE.Vector3(); (camera as THREE.Object3D).getWorldPosition(_camPos); const d = _camPos.distanceTo(worldPos); const cam = camera as THREE.PerspectiveCamera; const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5); const denom = Math.max(1e-6, 2 * d * tan); const heightToPixels = viewportH / denom; const s = Math.round(targetPx) / Math.max(1e-6, planeWorldHeight * heightToPixels); return THREE.MathUtils.clamp(s, this.HUD_TARGET_PX.minScale, this.HUD_TARGET_PX.maxScale); }
    return 1;
  }

  private computeWidthClampScale(camera: THREE.Camera, worldPos: THREE.Vector3, planeWorldHeight: number, targetHeightPx: number, aspect: number, maxWidthPx: number, renderer: THREE.WebGLRenderer): number {
    const baseScale = this.computeScreenSpaceScale(camera, worldPos, planeWorldHeight, targetHeightPx, renderer);
    const predictedWidthPx = targetHeightPx * aspect; if (predictedWidthPx <= 0) return baseScale; const widthClamp = Math.max(1e-6, maxWidthPx / predictedWidthPx); return Math.min(baseScale, widthClamp * baseScale);
  }

  // Convert road aggregates to ResourceInfo-like shape
  private getRoadResourceInfo(roadId: string): { required: Record<string, number>; collected: Record<string, number>; missing: Record<string, number>; progress: number; segmentsBuilt: number; segmentsTotal: number; } | null {
    if (!this.uiLogicBridge) return null;
    const aggr = this.uiLogicBridge.getRoadAggregates(roadId);
    if (!aggr) return null;
    
    // DEBUG: Логуємо що повертає getRoadAggregates
    console.log(`[RoadRenderer.getRoadResourceInfo] Road ${roadId}:`, {
      builtSegments: aggr.builtSegments,
      totalSegments: aggr.totalSegments,
      totalRequired: aggr.totalRequired,
      totalDelivered: aggr.totalDelivered
    });
    const required = { ...aggr.totalRequired };
    const collected = { ...aggr.totalDelivered };
    const missing: Record<string, number> = {};
    let sumReq = 0, sumGot = 0;
    for (const [k, v] of Object.entries(required)) { const got = collected[k] || 0; sumReq += v; sumGot += Math.min(v, got); if (got < v) missing[k] = v - got; }
    const progress = sumReq > 0 ? sumGot / sumReq : 0;
    return { required, collected, missing, progress, segmentsBuilt: aggr.builtSegments, segmentsTotal: aggr.totalSegments };
  }
}
