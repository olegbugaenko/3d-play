import * as THREE from 'three';
import { InteractionHandler } from '../InteractionHandler';
import { BuildingPreview } from '@ui/screens/colony/scene/renderers/BuildingPreview';
import { orientOnSurfaceEulerXYZ } from '@logic/utils/vector-math';

export class BuildingHandler extends InteractionHandler {
  private buildingPreview: BuildingPreview;
  private selectedBuildingData: any = null;
  private isInBuildingMode: boolean = false;
  
  // Для покращеного тротлінгу
  private lastUpdateTime = 0;
  private lastWorldPos = new THREE.Vector3();
  private readonly THROTTLE_MS = 16; // ~60 FPS
  private readonly MIN_WORLD_DISTANCE = 0.2; // Мінімальна відстань у світових координатах

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    mapLogic: any,
    buildingPreview: BuildingPreview
  ) {
    super(scene, camera, mapLogic);
    this.buildingPreview = buildingPreview;
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
  }

  onMouseDown(event: MouseEvent): void {
    // В режимі будівництва обробляємо тільки ліву кнопку миші
    if (event.button === 0 && this.selectedBuildingData) {
      this.handleLeftClick(event);
    }
  }

  onMouseMove(event: MouseEvent): void {
    // Оновлюємо позицію превью будівлі при руху миші
    if (this.selectedBuildingData) {
      const now = performance.now();
      
      const raycaster = this.getRaycaster(event);
      const tm = this.mapLogic.scene.getTerrainManager();
      
      if (tm) {
        // Спочатку обчислюємо нову позицію
        const newWorldPos = this.performImprovedRaycast(raycaster, tm);
        
        // Перевіряємо чи зміна позиції суттєва
        const distance = this.lastWorldPos.distanceTo(newWorldPos);
        const isSignificantChange = distance > this.MIN_WORLD_DISTANCE;
        
        // Оновлюємо тільки якщо:
        // 1. Час тротлінгу пройшов І зміна суттєва, АБО
        // 2. Зміна дуже суттєва (більше 1 метра) - тоді ігноруємо тротлінг
        if ((now >= this.lastUpdateTime + this.THROTTLE_MS && isSignificantChange) || distance > 1.0) {
          this.lastUpdateTime = now;
          this.lastWorldPos.copy(newWorldPos);
          
          // Обчислюємо орієнтацію для вирівнювання до терейну
          const terrainRotation = this.calculateTerrainRotation(newWorldPos, tm);
          
          // Оновлюємо позицію та орієнтацію превью
          this.buildingPreview.updatePositionAndRotation({
            x: newWorldPos.x,
            y: newWorldPos.y,
            z: newWorldPos.z
          }, terrainRotation, this.selectedBuildingData);
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
  const eps  = opts?.eps  ?? 1e-3;
  const maxIters = opts?.maxIters ?? 24;

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

      // 3) Анти-джиттер: згладжування від кадру до кадру
      if (opts?.lastHit && opts?.smoothAlpha !== undefined) {
        hit.lerp(opts.lastHit, THREE.MathUtils.clamp(1 - opts.smoothAlpha, 0, 0.95));
      }
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
    const step = 10;
    
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

  onMouseUp(_event: MouseEvent): void {
    // В режимі будівництва не обробляємо mouseup
  }

  onContextMenu(_event: MouseEvent): void {
    // В режимі будівництва правий клік скасовує режим
    console.log('Right click in building mode - canceling building mode');
    
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
    
    // Якщо ми вже в режимі будівництва, показуємо превью одразу
    if (this.selectedBuildingData) {
      // Початкова позиція без орієнтації - буде оновлена при руху миші
      this.buildingPreview.show(
        { x: 0, y: 0, z: 0 },
        this.selectedBuildingData
      );
    }
  }

  getBuildingState(): { isInBuildingMode: boolean; selectedBuilding: any } {
    return {
      isInBuildingMode: this.isInBuildingMode,
      selectedBuilding: this.selectedBuildingData
    };
  }

  private handleLeftClick(event: MouseEvent): void {
    const raycaster = this.getRaycaster(event);
    const tm = this.mapLogic.scene.getTerrainManager();
    
    if (tm) {
      // Використовуємо той самий покращений рейкастинг що і для превью
      const bestPoint = this.performImprovedRaycast(raycaster, tm);
      
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
    
    // Скидаємо вибір будівлі
    this.selectedBuildingData = null;
    this.isInBuildingMode = false;
    
    // Повертаємося до режиму вибору
    if (this.emit) {
      this.emit('modeChange', { from: 'building', to: 'selection' });
    }
  }
}
