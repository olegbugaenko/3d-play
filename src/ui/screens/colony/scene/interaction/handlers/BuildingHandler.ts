import * as THREE from 'three';
import { InteractionHandler } from '../InteractionHandler';
import { BuildingPreview } from '@ui/screens/colony/scene/renderers/BuildingPreview';
import { RoadPreview } from '@ui/screens/colony/scene/renderers/RoadPreview';
import { orientOnSurfaceEulerXYZ } from '@logic/utils/vector-math';

export class BuildingHandler extends InteractionHandler {
  private buildingPreview: BuildingPreview;
  private roadPreview: RoadPreview;
  private selectedBuildingData: any = null;
  private isInBuildingMode: boolean = false;
  
  // Для покращеного тротлінгу
  private lastUpdateTime = 0;
  private lastWorldPos = new THREE.Vector3();
  private readonly THROTTLE_MS = 16; // ~60 FPS
  private readonly MIN_WORLD_DISTANCE = 0.2; // Мінімальна відстань у світових координатах
  

  // Сегментований режим (дороги, ЛЕПи, тощо)
  private isSegmentedMode: boolean = false;
  private segmentedPath: THREE.Vector3[] = []; // поточний шлях сегментованої будівлі
  
  // Snap до існуючих доріг
  private snapData: { startSnap?: any, endSnap?: any } = {};
  private busyEdges: Set<string> = new Set(); // roadId|segmentIndex|edgeIndex

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    mapLogic: any,
    buildingPreview: BuildingPreview,
    emit?: (event: string, data?: any) => void
  ) {
    super(scene, camera, mapLogic, emit);
    this.buildingPreview = buildingPreview;
    
    // Передаємо terrainManager та buildingsManager в RoadPreview
    const terrainManager = mapLogic?.scene?.getTerrainManager?.();
    const buildingsManager = mapLogic?.buildingsManager;
    this.roadPreview = new RoadPreview(scene, terrainManager, buildingsManager);
  }

  onEnter(): void {
    console.log('Entered building mode');
    this.isInBuildingMode = true;
    // Показуємо превью будівлі в початковій позиції
    if (this.selectedBuildingData) {
      this.buildingPreview.show(
        { x: 0, y: 0, z: 0 }, // Початкова позиція, буде оновлена при руху миші
        this.selectedBuildingData
      );
    }
  }

  onExit(): void {
    console.log('Exited building mode');
    this.isInBuildingMode = false;
    // Приховуємо превью будівлі
    this.buildingPreview.hide();
    // Приховуємо превью дороги
    this.roadPreview.hide();
  }

  onMouseDown(event: MouseEvent): void {
    // В режимі будівництва обробляємо тільки ліву кнопку миші
    console.log('this.isSegmMode: ', this.isSegmentedMode, this.selectedBuildingData, 'isInBuildingMode:', this.isInBuildingMode);
    if (event.button === 0 && this.selectedBuildingData && this.isInBuildingMode) {
      if (this.isSegmentedMode) {
        this.handleSegmentedClick(event); // ПРОСТІШЕ: один клік = один сегмент
      } else {
        this.handleLeftClick(event);
      }
    }
  }

  onMouseMove(event: MouseEvent): void {
    // Оновлюємо позицію превью будівлі при руху миші
    if (this.selectedBuildingData && this.isInBuildingMode) {
      const now = performance.now();
      
      const raycaster = this.getRaycaster(event);
      const tm = this.mapLogic.scene.getTerrainManager();
      
      if (tm) {
        // Спочатку обчислюємо нову позицію
        const newWorldPos = this.performImprovedRaycast(raycaster, tm);

        // Для сегментованого режиму - показуємо превью наступної точки
        if (this.isSegmentedMode) {
          // Шукаємо найближче ребро існуючої дороги
          const nearestEdge = this.mapLogic.buildingsManager.findNearestRoadEdge(
            { x: newWorldPos.x, y: newWorldPos.y, z: newWorldPos.z },
            undefined, // поки що не виключаємо жодну дорогу
            3.0 // радіус пошуку 3м
          );
          
          // Snap логіка: якщо відстань < 1м - snap до центру ребра
          let snapPosition = newWorldPos;
          let currentSnap: any = null;
          
          if (nearestEdge && nearestEdge.distance < 1.0) {
            snapPosition = new THREE.Vector3(
              nearestEdge.edgePoint.x,
              nearestEdge.edgePoint.y,
              nearestEdge.edgePoint.z
            );
            currentSnap = {
              roadId: nearestEdge.roadId,
              segmentIndex: nearestEdge.segmentIndex,
              edgeIndex: nearestEdge.edgeIndex,
              edgeName: nearestEdge.edgeName,
              edgePoint: { x: nearestEdge.edgePoint.x, y: nearestEdge.edgePoint.y, z: nearestEdge.edgePoint.z },
              cursorPoint: { x: newWorldPos.x, y: newWorldPos.y, z: newWorldPos.z }
            };
            console.log(`🧲 SNAP to road edge:`, {
              roadId: nearestEdge.roadId,
              edge: nearestEdge.edgeName,
              distance: nearestEdge.distance.toFixed(2) + 'm'
            });
          } else if (nearestEdge) {
            // При великій кількості логів це гальмує, тому замовчуємо подробиці
          }
          
          // В PREVIEW більше не зберігаємо snap дані, аби не перетирати кліки

          if (this.segmentedPath.length === 0) {
            // БЕЗ сегментів: показуємо стартову точку (з урахуванням snap)
            this.roadPreview.showStartPoint(snapPosition, this.selectedBuildingData);
          } else {
            // Є сегменти: показуємо весь шлях ПЛЮС наступну точку (з урахуванням snap)
            const previewPath = [...this.segmentedPath, snapPosition];
            this.roadPreview.showPath(previewPath, this.selectedBuildingData);
          }
          // НЕ робимо return - панель має оновлюватися!
        }
        
        // Перевіряємо чи зміна позиції суттєва
        const distance = this.lastWorldPos.distanceTo(newWorldPos);
        const isSignificantChange = distance > this.MIN_WORLD_DISTANCE;
        
        // Оновлюємо тільки якщо:
        // 1. Час тротлінгу пройшов І зміна суттєва, АБО
        // 2. Зміна дуже суттєва (більше 1 метра) - тоді ігноруємо тротлінг
        if ((now >= this.lastUpdateTime + this.THROTTLE_MS && isSignificantChange) || distance > 1.0) {
          this.lastUpdateTime = now;
          this.lastWorldPos.copy(newWorldPos);
          
          // Перевіряємо чи можна розмістити будівлю в цій позиції
          const canPlace = this.mapLogic.buildingsManager.canPlaceBuildingAt(
            { x: newWorldPos.x, y: newWorldPos.y, z: newWorldPos.z },
            this.selectedBuildingData.id
          );
          
          // Обчислюємо орієнтацію для вирівнювання до терейну
          const terrainRotation = this.calculateTerrainRotation(newWorldPos, tm);
          
          // Оновлюємо позицію та орієнтацію превью з інформацією про валідність розміщення
          this.buildingPreview.updatePositionAndRotation({
            x: newWorldPos.x,
            y: newWorldPos.y,
            z: newWorldPos.z
          }, terrainRotation, this.selectedBuildingData, canPlace);
        }
      }
    }
  }

  /**
   * Покращений рейкастинг з адаптивним семплюванням для низьких кутів
   */
  private performImprovedRaycast(raycaster: THREE.Raycaster, tm: any): THREE.Vector3 {
    const origin = this.camera.position.clone();
    const dir = raycaster.ray.direction.clone();
    
    // Перевіряємо кут променя до горизонту
    const angleToHorizon = Math.abs(dir.y);
    const isLowAngle = angleToHorizon < 0.5; // Низький кут (менше 17 градусів)
    
    if (isLowAngle) {
      return this.raycastHeightfield(origin, dir, tm) ?? this.performStandardRaycast(origin, dir, tm);
    } else {
      return this.performStandardRaycast(origin, dir, tm);
    }
  }

  /**
   * Спеціалізований рейкастинг для низьких кутів камери
   */
  /**
 * Стійкий перетин променя з heightmap через пошук кореня f(t)=0
 * tm.getHeightAt(x, z): number | undefined  — безперервна (бажано бі-лінійна) інтерполяція
 */
private raycastHeightfield(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  tm: any,
  opts?: {
    tMax?: number;          // макс. дистанція променя
    eps?: number;           // точність по висоті
    maxIters?: number;      // ітерації бісекції
    smoothAlpha?: number;   // 0..1 згладжування хіта
    lastHit?: THREE.Vector3;// попередній хіт (для згладжування)
  }
): THREE.Vector3 | null {
  const tMax = opts?.tMax ?? 2000;
  const eps  = opts?.eps  ?? 1e-4; // ПОКРАЩЕНО: більша точність
  const maxIters = opts?.maxIters ?? 32; // ПОКРАЩЕНО: більше ітерацій

  // Якщо промінь майже вгору — шанс перетину з ґрунтом малий
  if (dir.y >= 0 && origin.y > (tm.maxHeight ?? origin.y)) return null;

  // f(t) = y_ray(t) - h(x(t), z(t))
  const f = (t: number): number => {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const h = tm.getHeightAt(x, z);
    if (h === undefined) return Number.POSITIVE_INFINITY; // поза терейном
    return y - h;
  };

  // 1) Адаптивний брекетинг: шукаємо t0<t1 з f(t0)*f(t1) <= 0
  // Починаймо недалеко від камери
  let t0 = 0;
  let f0 = f(t0);
  if (!isFinite(f0)) return null;

  // крок залежить від кута: чим менший |dir.y|, тим довший крок по t
  const base = 2.0;
  const stepScale = THREE.MathUtils.clamp(40 / Math.max(Math.abs(dir.y), 1e-3), 2, 200);
  let t1 = 0;
  let f1 = f0;
  while (t1 < tMax) {
    // експоненційно збільшуємо крок
    t1 = (t1 === 0) ? stepScale : Math.min(t1 * base, tMax);
    f1 = f(t1);
    if (!isFinite(f1)) { t0 = t1; f0 = f1; continue; }

    // перетин “зверху-вниз” => f переходить через 0
    if (f0 === 0) { /* влучили рівно у поверхню */ break; }
    if (f0 > 0 && f1 <= 0 || f0 < 0 && f1 >= 0) {
      // Маємо брекет [t0, t1]
      break;
    }
    // Інакше зсуваємо вікно
    t0 = t1; f0 = f1;
  }

  if (t1 >= tMax || !isFinite(f1)) {
    // брекет не знайшли — спробуємо м'яку проєкцію на ґрунт як фолбек
    return this.projectToGround?.(origin, dir, tm) ?? null;
  }

  // 2) Звуження інтервалу бісекцією (надійно і без осциляцій)
  let a = Math.min(t0, t1), b = Math.max(t0, t1);
  let fa = f(a), fb = f(b);
  for (let i = 0; i < maxIters; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if (!isFinite(fm)) { a = m; fa = fm; continue; }
    if (Math.abs(fm) < eps || Math.abs(b - a) < 1e-4) {
      // точка перетину
      const hit = new THREE.Vector3(
        origin.x + dir.x * m,
        origin.y + dir.y * m,
        origin.z + dir.z * m
      );
      // додатково вирівнюємо Y точно по терейну (прибирає мікро-дзеркаління)
      const h = tm.getHeightAt(hit.x, hit.z);
      if (h !== undefined) hit.y = h;

      return hit;
    }
    // підтримуємо знак у [a,b]
    if ((fa > 0) === (fm > 0)) { a = m; fa = fm; } else { b = m; fb = fm; }
  }

  // Якщо не зійшлося (дуже рідко) — повернемо найкраще наближення середини
  const m = 0.5 * (a + b);
  const approx = new THREE.Vector3(
    origin.x + dir.x * m,
    origin.y + dir.y * m,
    origin.z + dir.z * m
  );
  const h = tm.getHeightAt(approx.x, approx.z);
  if (h !== undefined) approx.y = h;
  return approx;
}


  /**
   * Стандартний рейкастинг для високих кутів камери
   */
  private performStandardRaycast(origin: THREE.Vector3, dir: THREE.Vector3, tm: any): THREE.Vector3 {
    const maxDist = 1000;
    const step = 2; // ПОКРАЩЕНО: менший крок для більшої точності
    
    let bestPoint = new THREE.Vector3();
    let bestError = Infinity;

    for (let d = 0; d <= maxDist; d += step) {
      const point = origin.clone().add(dir.clone().multiplyScalar(d));
      const height = tm.getHeightAt(point.x, point.z);
      
      if (height !== undefined) {
        const error = Math.abs(point.y - height);
        if (error < bestError) {
          bestError = error;
          bestPoint.set(point.x, height, point.z);
        }
        
        // ПОКРАЩЕНО: якщо знайшли дуже точний хіт - зупиняємося
        if (error < 0.1) {
          break;
        }
      }
    }

    return bestPoint;
  }

  /**
   * Проекція точки на землю для дуже низьких кутів
   */
  private projectToGround(origin: THREE.Vector3, dir: THREE.Vector3, tm: any): THREE.Vector3 | null {
    const searchSteps = 20;
    let bestPoint = new THREE.Vector3();
    let bestDistance = Infinity;

    for (let i = 0; i < searchSteps; i++) {
      const t = (i / searchSteps) * 200;
      const point = origin.clone().add(dir.clone().multiplyScalar(t));
      const height = tm.getHeightAt(point.x, point.z) ?? 0;
      
      const distance = Math.abs(point.y - height);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint.set(point.x, height, point.z);
      }
    }

    return bestDistance < 5 ? bestPoint : null;
  }

  /**
   * Обчислює орієнтацію будівлі відповідно до нормалі терейну
   */
  private calculateTerrainRotation(position: THREE.Vector3, tm: any): THREE.Euler {
    // Отримуємо нормаль терейну в цій точці
    const normal = tm.getNormalAt(position.x, position.z);
    
    if (normal) {
      // Використовуємо існуючу логіку з scene-logic
      // Для будівель поки що не додаємо rotation2D (кут 0)
      const rotation = orientOnSurfaceEulerXYZ(normal, 0);
      
      return new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
    }
    
    // Fallback - без обертання
    return new THREE.Euler(0, 0, 0, 'XYZ');
  }

  onMouseUp(event: MouseEvent): void {
    // Тільки для звичайних будівель
    if (event.button === 0 && !this.isSegmentedMode && this.isInBuildingMode) {
      // Логіка для звичайних будівель якщо потрібна
    }
  }

  onContextMenu(_event: MouseEvent): void {
    // В режимі будівництва правий клік скасовує режим
    if (!this.isInBuildingMode) return; // якщо не в режимі будівництва - ігноруємо
    
    console.log('Right click in building mode - canceling building mode');
    
    if (this.isSegmentedMode && this.segmentedPath.length > 0) {
      // ВИПРАВЛЕНО: видаляємо останній сегмент замість завершення
      this.removeLastSegment();
      return;
    }
    
    // Приховуємо превью будівлі
    this.buildingPreview.hide();
    
    // Скидаємо вибір будівлі
    this.selectedBuildingData = null;
    
    // Повертаємося до режиму вибору
    if (this.emit) {
      this.emit('modeChange', { from: 'building', to: 'selection' });
    }
  }

  setSelectedBuilding(buildingData: any): void {
    this.selectedBuildingData = buildingData;
    console.log('BuildingHandler: Selected building data:', buildingData);
    
    // Визначаємо чи це сегментована будівля (дороги, ЛЕПи тощо)
    this.isSegmentedMode = buildingData?.isSegmented === true;
    console.log('BuildingHandler: Segmented mode:', this.isSegmentedMode);
    
    // Скидаємо стан сегментованого режиму
    this.segmentedPath = [];
    
    // Якщо ми вже в режимі будівництва, показуємо превью одразу
    if (this.selectedBuildingData && !this.isSegmentedMode) {
      // Для звичайних будівель показуємо превью одразу
      this.buildingPreview.show(
        { x: 0, y: 0, z: 0 },
        this.selectedBuildingData
      );
    }
    // Для сегментованих будівель превью буде показано при початку перетягування
  }

  getBuildingState(): { isInBuildingMode: boolean; selectedBuilding: any } {
    return {
      isInBuildingMode: this.isInBuildingMode,
      selectedBuilding: this.selectedBuildingData
    };
  }

  getSegmentedState(): { 
    isSegmentedMode: boolean; 
    segmentedPath: THREE.Vector3[];
    canConfirm: boolean;
  } {
    return {
      isSegmentedMode: this.isSegmentedMode,
      segmentedPath: this.segmentedPath,
      canConfirm: this.canConfirmRoadConstruction()
    };
  }

  private canConfirmRoadConstruction(): boolean {
    if (!this.isSegmentedMode || this.segmentedPath.length < 2) {
      return false;
    }

    // Перевіряємо чи всі сегменти валідні
    const buildingsManager = this.mapLogic?.buildingsManager;
    if (!buildingsManager) return false;

    const simplePath = this.segmentedPath.map(p => ({ x: p.x, y: p.y, z: p.z }));
    return buildingsManager.canBuildRoadAt(simplePath, this.selectedBuildingData?.id || 'basic_road');
  }

  private handleLeftClick(event: MouseEvent): void {
    const raycaster = this.getRaycaster(event);
    const tm = this.mapLogic.scene.getTerrainManager();
    
    if (tm) {
      // Використовуємо той самий покращений рейкастинг що і для превью
      const bestPoint = this.performImprovedRaycast(raycaster, tm);
      
      // Перевіряємо чи можна розмістити будівлю в цій позиції
      const canPlace = this.mapLogic.buildingsManager.canPlaceBuildingAt(
        { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z },
        this.selectedBuildingData.id
      );
      
      if (!canPlace) {
        console.log('Cannot place building here - position is blocked');
        return; // Не розміщуємо будівлю якщо позиція заблокована
      }
      
      // Розміщуємо будівлю
      this.placeBuilding(bestPoint);
    }
  }

  private placeBuilding(position: THREE.Vector3): void {
    if (!this.selectedBuildingData) return;

    // Генеруємо унікальний ID для нової будівлі
    const buildingId = `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Плануємо будівлю (створюємо недобудовану будівлю 0-го рівня)
    const success = this.mapLogic.buildingsManager.planBuilding(
      buildingId,
      this.selectedBuildingData.id,
      { x: position.x, y: position.y, z: position.z }
    );

    if (success) {
      console.log(`Building planned successfully: ${buildingId}`);
      
      // Генеруємо об'єкт на сцені (недобудований)
      this.mapLogic.buildingsManager.generateBuilding(
        this.selectedBuildingData.id,
        { x: position.x, y: position.y, z: position.z },
        0, // 0-й рівень для планованої будівлі
        buildingId // Передаємо instanceId
      );
      
      // Виходимо з режиму будівництва
      this.exitBuildingMode();
    } else {
      console.error('Failed to plan building');
    }
  }

  private exitBuildingMode(): void {
    // Приховуємо превью будівлі
    this.buildingPreview.hide();
    
    // Скидаємо всі стани будівництва
    this.selectedBuildingData = null;
    this.isInBuildingMode = false;
    this.isSegmentedMode = false;
    this.segmentedPath = [];
    
    // Повертаємося до режиму вибору
    if (this.emit) {
      this.emit('modeChange', { from: 'building', to: 'selection' });
    }
  }

  // ──────────────────────────────
  //     Сегментований режим
  // ──────────────────────────────

  private handleSegmentedClick(event: MouseEvent): void {
    const raycaster = this.getRaycaster(event);
    const tm = this.mapLogic.scene.getTerrainManager();
    
    if (!tm) return;
    
    const point = this.performImprovedRaycast(raycaster, tm);
    
    // Шукаємо найближче ребро для snap
    const nearestEdge = this.mapLogic.buildingsManager.findNearestRoadEdge(
      { x: point.x, y: point.y, z: point.z },
      undefined,
      3.0
    );
    
    // Snap логіка: якщо відстань < 1м - використовуємо snap позицію
    let finalPoint = point;
    if (nearestEdge && nearestEdge.distance < 1.0) {
      finalPoint = new THREE.Vector3(
        nearestEdge.edgePoint.x,
        nearestEdge.edgePoint.y,
        nearestEdge.edgePoint.z
      );
      console.log(`🧲 CLICKED with SNAP to road edge ${nearestEdge.edgeName}`);
    }
    
    // Додаємо snap точку до шляху
    this.segmentedPath.push(finalPoint.clone());

    // Фіксуємо snap дані по кліку (не в onMouseMove)
    if (nearestEdge && nearestEdge.distance < 1.0) {
      const clickedSnap = {
        roadId: nearestEdge.roadId,
        segmentIndex: nearestEdge.segmentIndex,
        edgeIndex: nearestEdge.edgeIndex,
        edgeName: nearestEdge.edgeName,
        edgePoint: { x: nearestEdge.edgePoint.x, y: nearestEdge.edgePoint.y, z: nearestEdge.edgePoint.z },
        cursorPoint: { x: point.x, y: point.y, z: point.z }
      };
      if (this.segmentedPath.length === 1) {
        this.snapData.startSnap = clickedSnap;
        this.busyEdges.add(`${nearestEdge.roadId}|${nearestEdge.segmentIndex}|${nearestEdge.edgeIndex}`);
      } else {
        this.snapData.endSnap = clickedSnap;
        this.busyEdges.add(`${nearestEdge.roadId}|${nearestEdge.segmentIndex}|${nearestEdge.edgeIndex}`);
      }
    }
    
    console.log('Added point', this.segmentedPath.length, 'at:', finalPoint);
    console.log('Path points:', this.segmentedPath.map((p, i) => `${i}: (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`));
    
    // Оновлюємо превью
    this.roadPreview.showPath(this.segmentedPath, this.selectedBuildingData);
  }

  private removeLastSegment(): void {
    if (this.segmentedPath.length > 0) {
      this.segmentedPath.pop();
      console.log('Removed last point. Path now has', this.segmentedPath.length, 'points');
      
      if (this.segmentedPath.length > 0) {
        this.roadPreview.showPath(this.segmentedPath, this.selectedBuildingData);
      } else {
        this.roadPreview.hide();
      }
    }
  }



  public finishSegmentedBuilding(): void {
    if (this.segmentedPath.length < 2) {
      console.warn('Cannot create segmented building - need at least 2 points');
      this.cancelSegmentedBuilding();
      return;
    }
    
    console.log('Creating segmented building with path:', this.segmentedPath);
    
    // Перевіряємо чи можна побудувати дорогу
    const buildingsManager = this.mapLogic?.buildingsManager;
    if (!buildingsManager) {
      console.error('BuildingsManager not found');
      this.cancelSegmentedBuilding();
      return;
    }

    const simplePath = this.segmentedPath.map(p => ({ x: p.x, y: p.y, z: p.z }));
    if (!buildingsManager.canBuildRoadAt(simplePath, this.selectedBuildingData?.id || 'basic_road')) {
      console.warn('Cannot build road - invalid path');
      this.cancelSegmentedBuilding();
      return;
    }
    
    // Створюємо дорогу з недобудованими сегментами (з snap даними!)
    const roadId = buildingsManager.createPlannedRoad(
      this.selectedBuildingData.id, 
      simplePath, 
      this.snapData // Передаємо snap дані!
    );
    
    if (roadId) {
      console.log('Successfully created planned road:', roadId);
    } else {
      console.error('Failed to create planned road');
    }
    
    // Скидаємо стан і виходимо з режиму
    this.cancelSegmentedBuilding();
  }

  public cancelSegmentedBuilding(): void {
    this.segmentedPath = [];
    this.isSegmentedMode = false; // скидаємо режим сегментованого будівництва
    this.snapData = {}; // очищаємо snap дані
    this.busyEdges.clear();
    
    // Приховуємо превью дороги
    this.roadPreview.hide();
    
    this.exitBuildingMode();
  }
}
