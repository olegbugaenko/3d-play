import * as THREE from 'three';

export class AreaSelectionRenderer {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private isVisible = false;
  private radius = 5;
  private color = '#00ff88';
  private terrainManager: any = null;

  // Легка “дросель” логіка без setTimeout (дешевше й стабільніше)
  private nextAllowedUpdate = 0;
  private readonly THROTTLE_MS = 50;

  // Тимчасові об’єкти, щоб не алокати щокадру
  private _mouse = new THREE.Vector2();
  private _p = new THREE.Vector3();
  private _dir = new THREE.Vector3();
  private _origin = new THREE.Vector3();

  constructor(scene: THREE.Scene, terrainManager?: any) {
    this.scene = scene;
    this.terrainManager = terrainManager ?? null;
    this.createRingMesh();
  }

  /** Дає змогу оновити TerrainManager пізніше */
  setTerrainManager(terrainManager: any) {
    this.terrainManager = terrainManager;
  }

  /** Створює меш кільця */
  private createRingMesh(): void {
    const geometry = new THREE.RingGeometry(this.radius - 0.1, this.radius + 0.1, 64);
    geometry.rotateX(-Math.PI / 2);

    // ВАЖЛИВО: робимо матеріал “оверлейним”
    const material = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,     // ← ніколи не ховається за рельєфом/моделями
      depthWrite: false,    // ← не псуємо depth-буфер сцени
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;

    // Малювати ОСТАННІМ (на всяк випадок)
    this.mesh.renderOrder = 9999;
    // Якщо бували випадки, коли Frustum неправильно обрізав кільце:
    // this.mesh.frustumCulled = false;

    this.scene.add(this.mesh);
  }

  /** Показує кільце */
  show(radius?: number, color?: string): void {
    if (!this.mesh) return;

    if (radius !== undefined) {
      this.radius = radius;
      this.updateRingGeometry();
    }
    if (color !== undefined) {
      this.color = color;
      this.updateRingMaterial();
    }

    this.isVisible = true;
    this.mesh.visible = true;
  }

  /** Ховає кільце */
  hide(): void {
    if (!this.mesh) return;
    this.isVisible = false;
    this.mesh.visible = false;
  }

  /** Оновлює позицію кільця з простим тротлінгом */
  updatePosition(mouseX: number, mouseY: number, camera: THREE.Camera, raycaster: THREE.Raycaster): void {
    if (!this.isVisible || !this.mesh) return;
    const now = performance.now();
    if (now < this.nextAllowedUpdate) return;
    this.nextAllowedUpdate = now + this.THROTTLE_MS;

    this.performRaycast(mouseX, mouseY, camera, raycaster);
  }

  /** Точний пошук перетину з “висотою” терейну (бистріший і стабільніший за жорсткий крок 0..1000) */
  private performRaycast(mouseX: number, mouseY: number, camera: THREE.Camera, raycaster: THREE.Raycaster): void {
    if (!this.mesh) return;

    // NDC
    this._mouse.x = (mouseX / window.innerWidth) * 2 - 1;
    this._mouse.y = -(mouseY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(this._mouse, camera);

    // Збираємо початок/напрямок (для зручності)
    this._origin.copy((camera as any).position ?? new THREE.Vector3());
    this._dir.copy(raycaster.ray.direction);

    // Якщо немає terrainManager — простий фолбек на y=0
    if (!this.terrainManager) {
      const t = this.intersectWithPlaneY(0, this._origin, this._dir);
      this._p.copy(this._origin).addScaledVector(this._dir, t);
      this.mesh.position.set(this._p.x, 0.1, this._p.z);
      return;
    }

    // Шукаємо t таке, що y(t) = height(x(t), z(t))
    const tHit = this.solveRayVsHeight(this._origin, this._dir, this.terrainManager);
    this._p.copy(this._origin).addScaledVector(this._dir, tHit);
    const h = this.terrainManager.getHeightAt(this._p.x, this._p.z) ?? 0;

    // Трохи підіймаємо, щоб не було з-файтингу з терейном
    this.mesh.position.set(this._p.x, h + 0.05, this._p.z);
  }

  /** Перетин променя з площиною y = h (повертає t) */
  private intersectWithPlaneY(h: number, origin: THREE.Vector3, dir: THREE.Vector3): number {
    const denom = dir.y;
    if (Math.abs(denom) < 1e-5) return 0; // майже паралельно — беремо origin
    return (h - origin.y) / denom;
  }

  /**
   * Пошук кореня f(t)= y(t) - height(x(t),z(t)) за схемою:
   *   1) грубе семплювання 33 кроки на відстані до camera.far (або 1000)
   *   2) якщо знайшли зміну знаку — бісекція 8 ітерацій
   *   3) інакше — t з мінімальною |f(t)|
   */
  private solveRayVsHeight(origin: THREE.Vector3, dir: THREE.Vector3, tm: any): number {
    const maxDist = (typeof (origin as any).camera?.far === 'number') ? (origin as any).camera.far : 1000;
    const steps = 32;
    let tPrev = 0;
    let fPrev = this.fHeight(0, origin, dir, tm);
    let bestT = 0;
    let bestAbs = Math.abs(fPrev);

    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxDist;
      const f = this.fHeight(t, origin, dir, tm);

      const abs = Math.abs(f);
      if (abs < bestAbs) { bestAbs = abs; bestT = t; }

      // Знайшли зміну знаку — робимо бісекцію
      if (fPrev * f <= 0) {
        return this.bisectRoot(tPrev, t, origin, dir, tm);
      }
      tPrev = t;
      fPrev = f;
    }
    // Немає точного кореня — беремо найближчу точку
    return bestT;
  }

  private fHeight(t: number, o: THREE.Vector3, d: THREE.Vector3, tm: any): number {
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    const h = tm.getHeightAt(x, z);
    return y - (h ?? 0);
  }

  private bisectRoot(a: number, b: number, o: THREE.Vector3, d: THREE.Vector3, tm: any): number {
    let lo = a, hi = b;
    for (let i = 0; i < 8; i++) {
      const mid = 0.5 * (lo + hi);
      const fLo = this.fHeight(lo, o, d, tm);
      const fMid = this.fHeight(mid, o, d, tm);
      if (fLo * fMid <= 0) hi = mid;
      else lo = mid;
    }
    return 0.5 * (lo + hi);
  }

  /** Оновлює геометрію кільця (товщина стала, радіус — новий) */
  private updateRingGeometry(): void {
    if (!this.mesh) return;
    const geometry = new THREE.RingGeometry(this.radius - 0.1, this.radius + 0.1, 64);
    geometry.rotateX(-Math.PI / 2);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    // Підстрахуємося від з-файтингу при великих радіусах:
    (this.mesh.material as THREE.Material).polygonOffset = true;
    (this.mesh.material as THREE.Material).polygonOffsetFactor = -1;
    (this.mesh.material as THREE.Material).polygonOffsetUnits = -1;
  }

  /** Оновлює матеріал кільця (не забути зберегти overlay-параметри!) */
  private updateRingMaterial(): void {
    if (!this.mesh) return;
    const old = this.mesh.material as THREE.MeshBasicMaterial;
    const material = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: old.opacity ?? 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    old.dispose();
    this.mesh.material = material;
    this.mesh.renderOrder = 9999;
  }

  update(): void {
    // місце під анімації/пульсації, якщо колись знадобиться
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(mat => mat.dispose());
      } else {
        this.mesh.material.dispose();
      }
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }
}
