import * as THREE from 'three';
import { BaseRenderer } from './BaseRenderer';
import { UiLogicBridge } from '@ui/logic/UiLogicBridge';
import { TSceneObject } from '@logic/systems/scene/scene.types';
import { HudCanvasBuilder, ROAD_HUD_STYLE } from './hud/HudCanvasBuilder';
import type { HudCanvasRequest, HudResourceEntry } from './hud/HudCanvasBuilder';
import { clampScaleByWidth, computeScreenSpaceScale } from './hud/hudMath';
import { ROADS_DB } from '@buildings/buildings-db';
import type { RoadTypeData, RoadTypeId } from '@buildings/buildings.types';

interface RoadSegment {
  startLeft: THREE.Vector3;
  startRight: THREE.Vector3;
  endLeft: THREE.Vector3;
  endRight: THREE.Vector3;
  width: number;
}

interface RoadHudInfo {
  required: Record<string, number>;
  collected: Record<string, number>;
  missing: Record<string, number>;
  progress: number;
  segmentsBuilt: number;
  segmentsTotal: number;
}

const HUD_WORLD_Z_OFFSET = 0.035;
const DEFAULT_ROAD_COLOR = '#8B4513';
const DEFAULT_MATERIAL_KEY = '__default__';
const _hudQuat = new THREE.Quaternion();
const _hudViewDir = new THREE.Vector3();
const _hudWorldPos = new THREE.Vector3();
const _hudLocalOffset = new THREE.Vector3();
const _hudWorldScale = new THREE.Vector3();

export class RoadRenderer extends BaseRenderer {
  private defaultRoadMaterial: THREE.MeshLambertMaterial;
  private defaultPlannedRoadMaterial: THREE.MeshLambertMaterial;
  private textureLoader: THREE.TextureLoader;
  private textureCache: Map<string, THREE.Texture> = new Map();
  private texturePromises: Map<string, Promise<THREE.Texture>> = new Map();
  private builtMaterialCache: Map<string, THREE.MeshLambertMaterial> = new Map();
  private plannedMaterialCache: Map<string, THREE.MeshLambertMaterial> = new Map();
  private roadSegments: Map<string, RoadSegment[]> = new Map();
  private uiLogicBridge: UiLogicBridge | null = null;

  // HUD helpers (mirrors BuildingRenderer pattern)
  private readonly hudStyle = ROAD_HUD_STYLE;
  private readonly hudBuilder: HudCanvasBuilder;
  private hudSignatures: Map<string, string> = new Map();

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    super(scene, renderer);
    this.textureLoader = new THREE.TextureLoader();
    this.defaultRoadMaterial = this.createRoadMaterial();
    this.defaultPlannedRoadMaterial = this.createPlannedRoadMaterial();
    this.hudBuilder = new HudCanvasBuilder(renderer, this.hudStyle);
  }

  public setUiLogicBridge(bridge: UiLogicBridge): void {
    this.uiLogicBridge = bridge;
  }

  private createRoadMaterial(): THREE.MeshLambertMaterial {
    // Базовий матеріал на випадок відсутності текстури
    return new THREE.MeshLambertMaterial({
      color: DEFAULT_ROAD_COLOR,
      transparent: false,
      side: THREE.DoubleSide
    });
  }

  private createPlannedRoadMaterial(): THREE.MeshLambertMaterial {
    // Матеріал для запланованих доріг (напівпрозорий)
    return new THREE.MeshLambertMaterial({
      color: DEFAULT_ROAD_COLOR,
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
    
    const roadTypeId = object.data?.roadTypeId as RoadTypeId | undefined;

    segments.forEach((segment, index) => {
      // Знаходимо батьківський логічний сегмент для цього підсегмента
      const parentIdx = this.findParentLogicalSegmentIndex(segment, logicalLines);
      const parentState = segmentStates[parentIdx];
      // Якщо вся дорога збудована (object.data.built) - всі сегменти вважаються збудованими
      const isSegmentPlanned = (isPlanned || !object.data?.built) && parentState?.buildingState !== 'completed';
      const segmentMesh = this.createSegmentMesh(segment, `${object.id}_segment_${index}`, roadTypeId, isSegmentPlanned);
      roadGroup.add(segmentMesh);
    });

    // Позиція групи залишається 0,0,0 оскільки кожен сегмент має власні координати
    roadGroup.position.set(0, 0, 0);

    this.addMesh(object.id, roadGroup);

    const info = this.buildRoadResourceInfo(object, segments.length);
    const isFullyBuilt = !!object.data?.built;

    if (!info) {
      this.hudRegistry.detachAll(object.id);
      this.hudSignatures.delete(object.id);
      return roadGroup;
    }

    const shouldShowHud =
      !isFullyBuilt &&
      info.segmentsTotal > 0 &&
      (info.progress < 1 || info.segmentsBuilt < info.segmentsTotal);

    if (shouldShowHud) {
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
      const signature = this.createHudSignature(info);
      this.hudSignatures.set(object.id, signature);
      this.attachOrUpdateCombinedHUD(object.id, hudAnchor, info.progress, info, 0.6, 1, { title });
    } else {
      this.hudRegistry.detachAll(object.id);
      this.hudSignatures.delete(object.id);
    }
    return roadGroup;
  }

  private createSegmentMesh(
    segment: RoadSegment,
    name: string,
    roadTypeId?: RoadTypeId,
    isPlanned: boolean = false
  ): THREE.Mesh {
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
    const material = this.getMaterialForRoad(roadTypeId, isPlanned);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;

    return mesh;
  }

  private getMaterialForRoad(roadTypeId: RoadTypeId | undefined, isPlanned: boolean): THREE.MeshLambertMaterial {
    const cache = isPlanned ? this.plannedMaterialCache : this.builtMaterialCache;
    const key = roadTypeId ?? DEFAULT_MATERIAL_KEY;

    let material = cache.get(key);
    if (!material) {
      const base = isPlanned ? this.defaultPlannedRoadMaterial : this.defaultRoadMaterial;
      material = base.clone();
      if (!isPlanned) {
        material.transparent = false;
        material.opacity = 1.0;
        material.depthWrite = true;
        material.depthTest = true;
      }
      this.applyRoadAppearance(material, roadTypeId, isPlanned);
      cache.set(key, material);
    }

    return material;
  }

  private applyRoadAppearance(
    material: THREE.MeshLambertMaterial,
    roadTypeId?: RoadTypeId,
    isPlanned: boolean = false
  ): void {
    const roadType = this.getRoadTypeData(roadTypeId);
    const fallbackColor = roadType?.ui?.color ?? DEFAULT_ROAD_COLOR;
    const texturePath = roadType?.ui?.texture;

    if (texturePath) {
      this.assignTextureToMaterial(material, texturePath, fallbackColor);
    } else {
      material.map = null;
      this.setMaterialColor(material, fallbackColor);
    }

    if (isPlanned) {
      material.transparent = true;
      material.opacity = this.defaultPlannedRoadMaterial.opacity;
    }
  }

  private getRoadTypeData(roadTypeId?: RoadTypeId): RoadTypeData | null {
    if (!roadTypeId) return null;
    return ROADS_DB.get(roadTypeId) ?? null;
  }

  private assignTextureToMaterial(
    material: THREE.MeshLambertMaterial,
    texturePath: string,
    fallbackColor: THREE.ColorRepresentation
  ): void {
    const resolvedPath = this.resolveTexturePath(texturePath);

    if (this.textureCache.has(resolvedPath)) {
      material.map = this.textureCache.get(resolvedPath)!;
      this.setMaterialColor(material, 0xffffff);
      material.needsUpdate = true;
      return;
    }

    this.setMaterialColor(material, fallbackColor);

    this.loadTexture(resolvedPath)
      .then((texture) => {
        if (this.isMaterialDisposed(material)) return;
        material.map = texture;
        this.setMaterialColor(material, 0xffffff);
        material.needsUpdate = true;
      })
      .catch((error) => {
        console.warn(`[RoadRenderer] Failed to load texture '${texturePath}':`, (error as Error)?.message ?? error);
        if (this.isMaterialDisposed(material)) return;
        material.map = null;
        this.setMaterialColor(material, fallbackColor);
      });
  }

  private loadTexture(path: string): Promise<THREE.Texture> {
    if (this.textureCache.has(path)) {
      return Promise.resolve(this.textureCache.get(path)!);
    }

    const existing = this.texturePromises.get(path);
    if (existing) {
      return existing;
    }

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.();
          if (typeof maxAnisotropy === 'number' && maxAnisotropy > 0) {
            texture.anisotropy = maxAnisotropy;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.needsUpdate = true;
          this.textureCache.set(path, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    }).finally(() => {
      this.texturePromises.delete(path);
    });

    this.texturePromises.set(path, promise);
    return promise;
  }

  private resolveTexturePath(path: string): string {
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) {
      return path;
    }
    const normalized = path.replace(/^\.\/+/, '');
    if (normalized.startsWith('/')) {
      return normalized;
    }
    return `/${normalized}`;
  }

  private setMaterialColor(material: THREE.MeshLambertMaterial, color: THREE.ColorRepresentation): void {
    material.color.set(color);
    material.needsUpdate = true;
  }

  private isMaterialDisposed(material: THREE.MeshLambertMaterial): boolean {
    return Boolean((material.userData as Record<string, unknown> | undefined)?.__roadDisposed);
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
    super.update(object);

    const roadGroup = this.meshes.get(object.id) as THREE.Group | undefined;
    if (!roadGroup || !object.data?.roadSegments) {
      return;
    }

    const currentSegments = this.roadSegments.get(object.id);
    const newSegments = object.data.roadSegments;
    const segmentStates = object.data?.segmentStates || [];

    if (!this.segmentsEqual(currentSegments, newSegments) || this.segmentStatesChanged(object.id, segmentStates)) {
      this.remove(object.id);
      this.render(object);
      return;
    }

    const fallbackTotal = Array.isArray(newSegments) ? newSegments.length : 0;
    const info = this.buildRoadResourceInfo(object, fallbackTotal);
    const isFullyBuilt = !!object.data?.built;

    if (!info) {
      this.removeRoadHUD(roadGroup, object.id);
      return;
    }

    const shouldShowHud =
      info.segmentsTotal > 0 &&
      !isFullyBuilt &&
      (info.progress < 1 || info.segmentsBuilt < info.segmentsTotal);

    if (!shouldShowHud) {
      this.removeRoadHUD(roadGroup, object.id);
      return;
    }

    const first = (newSegments as RoadSegment[])[0];
    if (!first) {
      this.removeRoadHUD(roadGroup, object.id);
      return;
    }

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

    const signature = this.createHudSignature(info);
    const prevSignature = this.hudSignatures.get(object.id);
    const hasHud = Boolean((hudAnchor as any).userData?.combinedHUD);

    if (hasHud && prevSignature === signature) {
      return;
    }

    this.hudSignatures.set(object.id, signature);
    const title = `Segments: ${info.segmentsBuilt}/${info.segmentsTotal}`;
    this.attachOrUpdateCombinedHUD(object.id, hudAnchor, info.progress, info, 0.6, 1, { title });
  }

  public override remove(id: string): void {
    super.remove(id);
    this.roadSegments.delete(id);
    this.lastSegmentStates.delete(id);
    this.hudSignatures.delete(id);
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
  }

  /**
   * Очищає всі дороги
   */
  public clearAllRoads(): void {
    for (const roadId of Array.from(this.roadSegments.keys())) {
      this.remove(roadId);
    }
    this.roadSegments.clear();
    this.lastSegmentStates.clear();
    this.hudSignatures.clear();
  }

  public dispose(): void {
    this.roadSegments.clear();
    this.lastSegmentStates.clear();
    this.hudSignatures.clear();
    this.hudBuilder.dispose();

    super.dispose();

    const markDisposed = (material: THREE.MeshLambertMaterial) => {
      material.userData = { ...(material.userData ?? {}), __roadDisposed: true };
    };

    for (const material of this.builtMaterialCache.values()) {
      markDisposed(material);
      material.dispose();
    }
    this.builtMaterialCache.clear();

    for (const material of this.plannedMaterialCache.values()) {
      markDisposed(material);
      material.dispose();
    }
    this.plannedMaterialCache.clear();

    markDisposed(this.defaultRoadMaterial);
    this.defaultRoadMaterial.dispose();
    markDisposed(this.defaultPlannedRoadMaterial);
    this.defaultPlannedRoadMaterial.dispose();

    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
    this.texturePromises.clear();
  }

  // ---------- Combined HUD (mirrors BuildingRenderer) ----------
  private attachOrUpdateCombinedHUD(
    ownerId: string,
    anchor: THREE.Object3D,
    constructionProgress: number,
    resourceInfo: { required: Record<string, number>; collected: Record<string, number>; missing: Record<string, number>; progress: number; segmentsBuilt: number; segmentsTotal: number; },
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

        _hudLocalOffset.set(0, barY + extraY, 0);
        anchor.updateWorldMatrix(true, false);
        anchor.localToWorld(_hudWorldPos.copy(_hudLocalOffset));

        (camera as THREE.Object3D).getWorldQuaternion(_hudQuat);
        hud!.quaternion.copy(_hudQuat);

        (camera as any).getWorldDirection?.(_hudViewDir) ?? _hudViewDir.set(0, 0, -1).applyQuaternion(_hudQuat);
        hud!.position.copy(_hudWorldPos).addScaledVector(_hudViewDir, -HUD_WORLD_Z_OFFSET);

        anchor.getWorldScale(_hudWorldScale);
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

  private removeRoadHUD(group: THREE.Object3D, roadId: string): void {
    const hudAnchor = group.getObjectByName('hudAnchor') as THREE.Object3D | null;
    if (hudAnchor) {
      this.hudRegistry.detachFromAnchor(hudAnchor);
    }
    this.hudSignatures.delete(roadId);
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
    info: RoadHudInfo,
    options?: { showProgress?: boolean; title?: string }
  ): HudCanvasRequest {
    const ids = new Set<string>([
      ...Object.keys(info.required || {}),
      ...Object.keys(info.collected || {}),
    ]);

    const resources: HudResourceEntry[] = Array.from(ids).map((id) => ({
      id,
      required: info.required[id] ?? 0,
      collected: info.collected[id] ?? 0,
    }));

    const showProgress = options?.showProgress !== false;

    return {
      title: options?.title,
      progress: showProgress ? THREE.MathUtils.clamp(progress ?? info.progress ?? 0, 0, 1) : 0,
      showProgress,
      resources,
    };
  }

  // Build HUD resource info by combining segment states with optional manager aggregates
  private buildRoadResourceInfo(object: TSceneObject, fallbackSegmentsTotal = 0): RoadHudInfo | null {
    const segmentStates = (object.data?.segmentStates as any[]) ?? [];
    const aggregates = this.uiLogicBridge?.getRoadAggregates(object.id) ?? null;

    if (!segmentStates.length && !aggregates) {
      return null;
    }

    const requiredTotals: Record<string, number> = {};
    const deliveredTotals: Record<string, number> = {};
    let segmentsBuiltFromStates = 0;
    let segmentsTotal = segmentStates.length;
    let totalEffort = 0;
    let completedEffort = 0;

    for (const state of segmentStates) {
      if (!state) continue;

      const builtFlag = state.buildingState === 'completed' || state.built === true;
      const progressFlag = typeof state.constructionProgress === 'number' && state.constructionProgress >= 1;
      if (builtFlag || progressFlag) {
        segmentsBuiltFromStates += 1;
      }

      const rawEffort = Number((state as any).constructionEffort ?? (state as any).length ?? 0);
      const segmentEffort = rawEffort > 0 ? rawEffort : Math.max(Number((state as any).length) || 0, 1);
      totalEffort += segmentEffort;
      const segmentProgress = builtFlag
        ? 1
        : typeof state.constructionProgress === 'number'
          ? THREE.MathUtils.clamp(state.constructionProgress, 0, 1)
          : 0;
      completedEffort += segmentEffort * segmentProgress;

      const required = state.requiredResources ?? {};
      for (const [resource, amount] of Object.entries(required)) {
        const reqVal = Math.max(0, Number(amount) || 0);
        requiredTotals[resource] = (requiredTotals[resource] ?? 0) + reqVal;
      }

      const delivered = state.deliveredResources ?? {};
      for (const [resource, amount] of Object.entries(delivered)) {
        const deliveredVal = Math.max(0, Number(amount) || 0);
        deliveredTotals[resource] = (deliveredTotals[resource] ?? 0) + deliveredVal;
      }
    }

    if (aggregates) {
      segmentsTotal = Math.max(segmentsTotal, aggregates.totalSegments ?? 0);
      segmentsBuiltFromStates = Math.max(segmentsBuiltFromStates, aggregates.builtSegments ?? 0);

      for (const [resource, amount] of Object.entries(aggregates.totalRequired ?? {})) {
        const reqVal = Math.max(0, Number(amount) || 0);
        requiredTotals[resource] = Math.max(requiredTotals[resource] ?? 0, reqVal);
      }

      for (const [resource, amount] of Object.entries(aggregates.totalDelivered ?? {})) {
        const deliveredVal = Math.max(0, Number(amount) || 0);
        deliveredTotals[resource] = Math.max(deliveredTotals[resource] ?? 0, deliveredVal);
      }
    }

    segmentsTotal = Math.max(segmentsTotal, fallbackSegmentsTotal);

    if (segmentsTotal === 0) {
      return null;
    }

    const required: Record<string, number> = {};
    const collected: Record<string, number> = {};
    const missing: Record<string, number> = {};
    let totalRequired = 0;
    let totalCollected = 0;

    const resourceKeys = new Set<string>([
      ...Object.keys(requiredTotals),
      ...Object.keys(deliveredTotals)
    ]);

    for (const resource of resourceKeys) {
      const requiredRaw = requiredTotals[resource] ?? 0;
      const deliveredRaw = deliveredTotals[resource] ?? 0;
      const reqVal = Math.max(0, Math.round(requiredRaw));
      const deliveredVal = Math.max(0, Math.round(deliveredRaw));

      if (reqVal === 0 && deliveredVal === 0) {
        continue;
      }

      required[resource] = reqVal;
      const clamped = Math.min(reqVal, deliveredVal);
      collected[resource] = clamped;
      totalRequired += reqVal;
      totalCollected += clamped;

      if (clamped < reqVal) {
        missing[resource] = reqVal - clamped;
      }
    }

    const resourceProgress = totalRequired > 0 ? Math.min(1, totalCollected / totalRequired) : 0;

    let progress: number;
    if (totalEffort > 0) {
      progress = Math.min(1, completedEffort / totalEffort);
    } else if (aggregates) {
      const totalSegs = Math.max(segmentsTotal, aggregates.totalSegments ?? 0);
      const builtSegs = Math.max(segmentsBuiltFromStates, aggregates.builtSegments ?? 0);
      progress = totalSegs > 0 ? Math.min(1, builtSegs / totalSegs) : 0;
    } else {
      progress = resourceProgress;
    }

    return {
      required,
      collected,
      missing,
      progress,
      segmentsBuilt: Math.min(segmentsBuiltFromStates, segmentsTotal),
      segmentsTotal
    };
  }

  private createHudSignature(info: RoadHudInfo): string {
    const resources = Object.keys(info.required).sort();
    const resourcePart = resources
      .map((resource) => `${resource}:${info.required[resource]}:${info.collected[resource] ?? 0}`)
      .join(',');

    return [
      `p:${info.progress.toFixed(4)}`,
      `seg:${info.segmentsBuilt}/${info.segmentsTotal}`,
      `res:${resourcePart}`
    ].join('|');
  }
}
