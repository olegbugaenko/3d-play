import { Vector3 } from "shared/math.types";
import { OccupancyGridStore } from "./occupancy-grid";
import { TSceneObject } from "../scene.types";

type Cell = { i: number; j: number };

class MinHeap {
  private heap: Array<{ k: number; f: number }> = [];
  push(node: { k: number; f: number }) {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }
  pop(): { k: number; f: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }
  size() { return this.heap.length; }
  private bubbleUp(idx: number) {
    while (idx > 0) {
      const p = (idx - 1) >> 1;
      if (this.heap[p].f <= this.heap[idx].f) break;
      [this.heap[p], this.heap[idx]] = [this.heap[idx], this.heap[p]];
      idx = p;
    }
  }
  private bubbleDown(idx: number) {
    const n = this.heap.length;
    while (true) {
      let l = idx * 2 + 1, r = l + 1, s = idx;
      if (l < n && this.heap[l].f < this.heap[s].f) s = l;
      if (r < n && this.heap[r].f < this.heap[s].f) s = r;
      if (s === idx) break;
      [this.heap[s], this.heap[idx]] = [this.heap[idx], this.heap[s]];
      idx = s;
    }
  }
}

export class PathfindingSystem {
  private DEBUG = false;

  // Тюнінг (можеш підкрутити)
  private readonly OFFROAD_TAX = 0.30;       // +30% часу на не-дорозі
  private readonly CENTER_BONUS = 0.10;      // до +10% швидше на осі дороги
  private readonly MIN_ROAD_COVERAGE = 0.60; // частка дороги для дозволу прямої склейки
  private readonly IMPROVE_FACTOR = 0.995;   // пряма має бути ≥0.5% кращою
  private readonly H_WEIGHT = 0.25;          // занижена евристика (консервативна)

  constructor(public grid: OccupancyGridStore) {
    this.grid = grid;
  }

  // ──────────────────────────────
  //           API helpers
  // ──────────────────────────────

  canStandAtWorld(x: number, z: number, obj: TSceneObject, safety = 0): boolean {
    const { i, j } = this.grid.worldToCell(x, z);
    if (!this.grid.inb(i, j)) return false;
    return this.grid.passable(i, j, obj.obstacleSize ?? 0.5, safety, obj.id);
  }

  // ──────────────────────────────
  //           Дорожні API
  // ──────────────────────────────

  addRoadSegment(
    id: string,
    startX: number, startZ: number,
    endX: number, endZ: number,
    width: number,
    speedBonus = 1.5
  ): void {
    this.grid.addRoadSegment(id, startX, startZ, endX, endZ, width, speedBonus);
  }

  removeRoadSegment(id: string): void {
    this.grid.removeRoad(id);
  }

  clearAllRoads(): void {
    this.grid.clearRoads();
  }

  isRoadAtWorld(x: number, z: number): boolean {
    const { i, j } = this.grid.worldToCell(x, z);
    return this.grid.isRoad(i, j);
  }

  getSpeedBonusAtWorld(x: number, z: number): number {
    const { i, j } = this.grid.worldToCell(x, z);
    return this.grid.getRoadSpeedBonus(i, j);
  }

  getRoadCenterDistanceAtWorld(x: number, z: number): number {
    const { i, j } = this.grid.worldToCell(x, z);
    return this.grid.getRoadCenterDistance(i, j);
  }

  /**
   * Найближча валідна "точка дотику" для СТАТИЧНОЇ цілі.
   */
  public findDockingPointToStatic(
    drone: TSceneObject,
    target: TSceneObject,
    safety = 0.1,
    fullCircle = true
  ): Vector3 | null {
    const g = this.grid;
    const rA = drone.obstacleSize ?? 0.5;
    const rB = target.obstacleSize ?? 0.0;

    const R0 = rA + rB + safety;

    const sx = drone.coordinates.x,  sz = drone.coordinates.z;
    const cx = target.coordinates.x, cz = target.coordinates.z;

    const baseAngle = Math.atan2(sz - cz, sx - cx);
    const arcMeters = Math.max(g.s * 0.5, 0.001);
    const dTheta = Math.min(Math.PI / 6, arcMeters / Math.max(R0, 1e-6));
    const stepsEachSide = Math.ceil((fullCircle ? Math.PI : Math.PI / 2) / dTheta);
    const bumps = [0, g.s * 0.25, g.s * 0.5, g.s * 0.75];

    let best: Vector3 | null = null;
    let bestDist = Infinity;
    let bestEst = Infinity;

    const sCell0 = g.worldToCell(sx, sz);
    const sCell = this.findNearestPassable(sCell0.i, sCell0.j, rA, safety, 40);
    if (!sCell) return null;

    for (let k = 0; k <= stepsEachSide; k++) {
      const offsets = k === 0 ? [0] : [-k, +k];
      for (const sgn of offsets) {
        const theta = baseAngle + sgn * dTheta;
        for (const bump of bumps) {
          const R = R0 + bump;
          const x = cx + Math.cos(theta) * R;
          const z = cz + Math.sin(theta) * R;

          const { i, j } = g.worldToCell(x, z);
          if (!g.inb(i, j)) continue;
          if (!g.passable(i, j, rA, safety, drone.id)) continue;

          const dist = Math.hypot(x - sx, z - sz);
          if (dist + 1e-6 < bestDist) {
            bestDist = dist;
            const los = this.hasLineOfSight(sCell, { i, j }, rA, safety, drone.id);
            bestEst = this.octile(sCell.i, sCell.j, i, j) + (los ? 0 : 0.5);
            best = { x, y: drone.coordinates.y, z };
          } else if (Math.abs(dist - bestDist) <= g.s * 0.1) {
            const los = this.hasLineOfSight(sCell, { i, j }, rA, safety, drone.id);
            const est = this.octile(sCell.i, sCell.j, i, j) + (los ? 0 : 0.5);
            if (est < bestEst) {
              bestEst = est;
              best = { x, y: drone.coordinates.y, z };
            }
          }
          break;
        }
      }
    }
    return best;
  }

  // ──────────────────────────────
  //      Вартість кроку/сегмента
  // ──────────────────────────────

  /** Мультиплікатор часу для клітинки */
  private travelMultiplier(i: number, j: number): number {
    const isRoad = this.grid.isRoad(i, j);
    const speed = this.grid.getRoadSpeedBonus(i, j);      // >= 1.0
    const center = this.grid.getRoadCenterDistance(i, j); // 0..1 (0 = центр)
    const centerBoost = 1.0 + (1.0 - center) * this.CENTER_BONUS;
    const effSpeed = Math.max(1e-6, speed * centerBoost);
    let mult = 1.0 / effSpeed;
    if (!isRoad) mult *= (1.0 + this.OFFROAD_TAX);        // податок поза дорогою
    return mult;
  }

  /** Вартість кроку між сусідніми клітинками */
  private stepTime(ci: number, cj: number, ni: number, nj: number): number {
    const base = (ci !== ni && cj !== nj) ? Math.SQRT2 : 1.0;
    return base * this.travelMultiplier(ni, nj);
  }

  /** Час і частка дороги для прямого сегмента a→b (семпл s/2) */
  private segmentTimeAndRoadRatio(a: Cell, b: Cell, r: number, safety: number): { time: number; roadRatio: number } {
    const c0 = this.grid.cellCenter(a.i, a.j);
    const c1 = this.grid.cellCenter(b.i, b.j);
    const dx = c1.x - c0.x, dy = c1.y - c0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { time: 0, roadRatio: 0 };

    const step = this.grid.s * 0.5;
    const n = Math.max(1, Math.ceil(len / step));
    let t = 0;
    let roadCount = 0;

    for (let s = 1; s <= n; s++) {
      const a01 = s / n;
      const x = c0.x + dx * a01;
      const y = c0.y + dy * a01;
      const { i, j } = this.grid.worldToCell(x, y);
      if (!this.grid.inb(i, j) || !this.grid.passable(i, j, r, safety)) {
        return { time: Number.POSITIVE_INFINITY, roadRatio: 0 };
      }
      t += (len / n) * this.travelMultiplier(i, j);
      if (this.grid.isRoad(i, j)) roadCount++;
    }
    return { time: t, roadRatio: roadCount / n };
  }

  /** Частка дорожніх клітинок уздовж полілайна (за центрами клітинок) */
  private polylineRoadRatio(path: Cell[]): number {
    if (path.length === 0) return 0;
    let cnt = 0;
    for (const c of path) if (this.grid.isRoad(c.i, c.j)) cnt++;
    return cnt / path.length;
  }

  /** Час полілайна (сума stepTime) */
  private polylineTime(path: Cell[]): number {
    if (path.length < 2) return 0;
    let t = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      t += this.stepTime(a.i, a.j, b.i, b.j);
    }
    return t;
  }

  /**
   * Роуд-обізнане LoS-спрощення:
   * - якщо пряма має низьке покриття дорогою, а поточний ланцюжок має дороги — не склеюємо;
   * - якщо доріг ніде немає — поводимося як звичайне LoS по часу.
   */
  private simplifyByLoSRoadAware(path: Cell[], r: number, safety: number): Cell[] {
    if (path.length <= 2) return path.slice();
    const out: Cell[] = [path[0]];
    let anchor = 0;

    for (let k = 2; k < path.length; k++) {
      const seg = this.segmentTimeAndRoadRatio(path[anchor], path[k], r, safety);
      if (!Number.isFinite(seg.time)) {
        out.push(path[k - 1]); anchor = k - 1; continue;
      }
      const polySlice = path.slice(anchor, k + 1);
      const polyT = this.polylineTime(polySlice);
      const polyRoad = this.polylineRoadRatio(polySlice);

      // Якщо дорога присутня у полілайні, але пряма має замало дороги — забороняємо склейку
      if (polyRoad > 0 && seg.roadRatio < this.MIN_ROAD_COVERAGE) {
        out.push(path[k - 1]); anchor = k - 1; continue;
      }

      // Інакше — стандартне порівняння часу з невеликим порогом
      if (seg.time <= polyT * this.IMPROVE_FACTOR) {
        // лишаємо шанс склеїти далі
        continue;
      } else {
        out.push(path[k - 1]); anchor = k - 1;
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  // ──────────────────────────────
  //           Публічний пошук
  // ──────────────────────────────

  findOptimalPath(start: Vector3, end: Vector3, obj: TSceneObject): Vector3[] {
    if (this.DEBUG) {
      console.log(`🔍 findOptimalPath: (${start.x.toFixed(1)}, ${start.z.toFixed(1)}) → (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`);
    }

    const g = this.grid;
    const r = obj.obstacleSize ?? 0.5;
    const safety = 0.05;

    // 1) світ→клітинка + clamp
    let { i: si, j: sj } = g.worldToCell(start.x, start.z);
    let { i: gi, j: gj } = g.worldToCell(end.x, end.z);
    si = Math.max(0, Math.min(g.W - 1, si));
    sj = Math.max(0, Math.min(g.H - 1, sj));
    gi = Math.max(0, Math.min(g.W - 1, gi));
    gj = Math.max(0, Math.min(g.H - 1, gj));

    // 2) нормалізація старт/фініш
    const sCell = this.findNearestPassable(si, sj, r, safety, 40);
    const gCell = this.findNearestPassable(gi, gj, r, safety, 40);
    if (!sCell || !gCell) return [];

    // 3) A*
    const pathCells = this.astarSafe(
      sCell, gCell, r, safety,
      /*allowDiag*/ true,
      /*maxExpand*/ 500_000
    );
    if (pathCells.length === 0) return [];

    // 4) Роуд-обізнане LoS-спрощення
    const simplifiedCells = this.simplifyByLoSRoadAware(pathCells, r, safety);

    const reachedGoal = simplifiedCells.length > 0
      && simplifiedCells[simplifiedCells.length - 1].i === gCell.i
      && simplifiedCells[simplifiedCells.length - 1].j === gCell.j;

    // 5) клітинки → world
    const waypoints: Vector3[] = simplifiedCells.map(({ i, j }) => {
      const c = g.cellCenter(i, j);
      return { x: c.x, y: start.y, z: c.y };
    });

    if (waypoints.length > 0) {
      waypoints[0] = { x: start.x, y: start.y, z: start.z };
      if (reachedGoal) {
        waypoints[waypoints.length - 1] = { x: end.x, y: start.y, z: end.z };
      }
    }

    if (this.DEBUG) {
      console.log(`🗺️ Path ${waypoints.length} wps (simplified, road-aware)`);
    }

    return waypoints;
  }

  // ──────────────────────────────
  //        A* (safe wrapper)
  // ──────────────────────────────

  private astarSafe(
    start: Cell,
    goal: Cell,
    r: number,
    safety: number,
    allowDiag = true,
    maxExpand = 250_000
  ): Cell[] {
    const sCell = this.findNearestPassable(start.i, start.j, r, safety, 40);
    const gCell = this.findNearestPassable(goal.i, goal.j, r, safety, 40);
    if (!sCell || !gCell) return [];

    const buf = 300;
    const minI = Math.max(0, Math.min(sCell.i, gCell.i) - buf);
    const maxI = Math.min(this.grid.W - 1, Math.max(sCell.i, gCell.i) + buf);
    const minJ = Math.max(0, Math.min(sCell.j, gCell.j) - buf);
    const maxJ = Math.min(this.grid.H - 1, Math.max(sCell.j, gCell.j) + buf);

    return this.astarCore(sCell, gCell, r, safety, allowDiag, maxExpand, { minI, maxI, minJ, maxJ });
  }

  // ──────────────────────────────
  //      A* ядро з runId буферами
  // ──────────────────────────────

  private runId = 1;
  private N = 0;
  private Wbuf = 0;
  private Hbuf = 0;
  private gScore!: Float32Array;
  private gSeen!: Uint32Array;
  private parent!: Int32Array;
  private pSeen!: Uint32Array;
  private closed!: Uint32Array;

  private passSeen!: Uint32Array;
  private passBin!: Uint8Array;

  private ensureBuffers() {
    const W = this.grid.W, H = this.grid.H, N = W * H;
    if (N !== this.N) {
      this.N = N; this.Wbuf = W; this.Hbuf = H;
      this.gScore = new Float32Array(N);
      this.gSeen  = new Uint32Array(N);
      this.parent = new Int32Array(N);
      this.pSeen  = new Uint32Array(N);
      this.closed = new Uint32Array(N);
      this.passSeen = new Uint32Array(N);
      this.passBin  = new Uint8Array(N);
    }
    this.runId = (this.runId + 1) >>> 0 || 1;
  }
  private getG(k: number): number {
    return this.gSeen[k] === this.runId ? this.gScore[k] : Infinity;
  }
  private setG(k: number, v: number) {
    this.gSeen[k] = this.runId; this.gScore[k] = v;
  }
  private getParent(k: number): number {
    return this.pSeen[k] === this.runId ? this.parent[k] : -1;
  }
  private setParent(k: number, p: number) {
    this.pSeen[k] = this.runId; this.parent[k] = p;
  }
  private isClosed(k: number): boolean {
    return this.closed[k] === this.runId;
  }
  private setClosed(k: number) {
    this.closed[k] = this.runId;
  }
  private passableMemo(i: number, j: number, r: number, safety: number): boolean {
    const k = i + j * this.grid.W;
    if (this.passSeen[k] !== this.runId) {
      this.passSeen[k] = this.runId;
      this.passBin[k] = this.grid.passable(i, j, r, safety) ? 1 : 0;
    }
    return this.passBin[k] === 1;
  }

  private astarCore(
    start: Cell,
    goal: Cell,
    r: number,
    safety: number,
    allowDiag = true,
    maxExpand = 250_000,
    bounds?: { minI:number; maxI:number; minJ:number; maxJ:number }
  ): Cell[] {
    this.ensureBuffers();
    const W = this.grid.W, H = this.grid.H, idx = (i: number, j: number) => i + j * W;

    const heap = new MinHeap();
    const sk = idx(start.i, start.j);
    const tk = idx(goal.i, goal.j);

    const h0 = this.octile(start.i, start.j, goal.i, goal.j) * this.H_WEIGHT;
    this.setG(sk, 0);
    this.setParent(sk, -1);
    heap.push({ k: sk, f: h0 });

    // Легка «підказка»: кинути в heap найближчі дорожні сусіди (3×3)
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = start.i + di, nj = start.j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        if (!this.grid.isRoad(ni, nj)) continue;
        if (!this.passableMemo(ni, nj, r, safety)) continue;
        const nk = idx(ni, nj);
        const gCost = this.stepTime(start.i, start.j, ni, nj);
        const h = this.octile(ni, nj, goal.i, goal.j) * this.H_WEIGHT;
        if (gCost < this.getG(nk)) {
          this.setG(nk, gCost);
          this.setParent(nk, sk);
          heap.push({ k: nk, f: gCost + h + 1e-6 * h });
        }
      }
    }

    let expanded = 0;
    let bestK = sk;
    let bestH = h0;

    const startTs = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const MAX_MS = 24;

    const dirs: Array<[number, number]> = allowDiag
      ? [[-1,0],[0,-1],[1,0],[0,1],[-1,-1],[1,-1],[1,1],[-1,1]]
      : [[-1,0],[0,-1],[1,0],[0,1]];

    while (heap.size()) {
      const cur = heap.pop()!;
      const k = cur.k;
      if (this.isClosed(k)) continue;
      this.setClosed(k);

      if (k === tk) return this.reconstructPathCurrentRun(k, W);
      if (++expanded > maxExpand) break;

      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (now - startTs > MAX_MS) break;

      const ci = k % W;
      const cj = (k / W) | 0;

      for (const [dx, dy] of dirs) {
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;

        if (bounds) {
          if (ni < bounds.minI || ni > bounds.maxI || nj < bounds.minJ || nj > bounds.maxJ) continue;
        }

        // без corner cutting
        if (dx !== 0 && dy !== 0) {
          if (!this.passableMemo(ci + dx, cj, r, safety)) continue;
          if (!this.passableMemo(ci, cj + dy, r, safety)) continue;
        }
        if (!this.passableMemo(ni, nj, r, safety)) continue;

        const nk = idx(ni, nj);
        if (this.isClosed(nk)) continue;

        const step = this.stepTime(ci, cj, ni, nj);
        const tentativeG = this.getG(k) + step;
        if (tentativeG < this.getG(nk)) {
          this.setG(nk, tentativeG);
          this.setParent(nk, k);

          const h = this.octile(ni, nj, goal.i, goal.j) * this.H_WEIGHT;
          if (h < bestH) { bestH = h; bestK = nk; }

          const f = tentativeG + h + 1e-6 * h;
          heap.push({ k: nk, f });
        }
      }
    }

    // best-effort
    return this.reconstructPathCurrentRun(bestK, W);
  }

  private reconstructPathCurrentRun(k: number, W: number): Cell[] {
    const out: Cell[] = [];
    const GUARD = this.N + 5;
    let steps = 0;
    while (k !== -1 && steps++ < GUARD) {
      out.push({ i: k % W, j: (k / W) | 0 });
      if (this.pSeen[k] === this.runId) {
        k = this.parent[k];
      } else {
        k = -1;
      }
    }
    out.reverse();
    return out;
  }

  private octile(i0: number, j0: number, i1: number, j1: number): number {
    const dx = Math.abs(i1 - i0), dy = Math.abs(j1 - j0);
    const m = Math.min(dx, dy);
    return (dx + dy) + (Math.SQRT2 - 2) * m;
  }

  // ──────────────────────────────
  //   Найближча прохідна клітинка
  // ──────────────────────────────

  private findNearestPassable(i: number, j: number, r: number, safety: number, maxRadiusCells = 30): Cell | null {
    if (this.grid.inb(i, j) && this.grid.passable(i, j, r, safety)) return { i, j };
    for (let R = 1; R <= maxRadiusCells; R++) {
      const i0 = Math.max(0, i - R), i1 = Math.min(this.grid.W - 1, i + R);
      const j0 = Math.max(0, j - R), j1 = Math.min(this.grid.H - 1, j + R);
      for (let x = i0; x <= i1; x++) {
        if (this.grid.passable(x, j0, r, safety)) return { i: x, j: j0 };
        if (this.grid.passable(x, j1, r, safety)) return { i: x, j: j1 };
      }
      for (let y = j0 + 1; y <= j1 - 1; y++) {
        if (this.grid.passable(i0, y, r, safety)) return { i: i0, j: y };
        if (this.grid.passable(i1, y, r, safety)) return { i: i1, j: y };
      }
    }
    return null;
  }

  // ──────────────────────────────
  //         LoS / візуалізації
  // ──────────────────────────────

  private hasLineOfSight(a: Cell, b: Cell, r: number, safety: number, excludeId?: string): boolean {
    const c0 = this.grid.cellCenter(a.i, a.j);
    const c1 = this.grid.cellCenter(b.i, b.j);
    const dx = c1.x - c0.x, dy = c1.y - c0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    const step = this.grid.s * 0.5;
    const n = Math.ceil(len / step);
    for (let t = 0; t <= n; t++) {
      const ax = c0.x + (dx * t) / n;
      const ay = c0.y + (dy * t) / n;
      const { i, j } = this.grid.worldToCell(ax, ay);
      if (!this.grid.inb(i, j) || !this.grid.passable(i, j, r, safety, excludeId)) return false;
    }
    return true;
  }

  /**
   * Перевіряє, чи є пряма видимість/прохідність між двома світовими точками
   * для АГЕНТА (радіус береться з obstacleSize, а id — для exclude).
   *
   * @param start world-позиція старту (x,z беруться)
   * @param end   world-позиція фінішу (x,z беруться)
   * @param obj   агент (джерело радіуса та excludeId)
   * @param safety додатковий “запас” до радіуса
   * @param snapToPassable якщо true — привʼязати обидві точки до найближчих
   *                       прохідних клітинок (рекомендується)
   */
  public hasLineOfSightWorldForObj(
    start: { x: number; z: number },
    end:   { x: number; z: number },
    r: number,
    safety = 0.05,
    snapToPassable = true
  ): boolean {
    return this.hasLineOfSightWorld(start.x, start.z, end.x, end.z, r, safety, undefined, snapToPassable);
  }

  /**
   * Базова перевірка в світових координатах з явним радіусом.
   * Використовує існуючий hasLineOfSight( Cell, Cell, r, safety, excludeId ).
   *
   * @param ax,az, bx,bz  світові координати відрізка
   * @param r              радіус агента
   * @param safety         запас до радіуса
   * @param excludeId      (опц.) id, який слід ігнорувати в динаміці
   * @param snapToPassable якщо true — шукати найближчі прохідні клітини для кінців
   */
  public hasLineOfSightWorld(
    ax: number, az: number,
    bx: number, bz: number,
    r: number,
    safety = 0.05,
    excludeId?: string,
    snapToPassable = true
  ): boolean {
    const g = this.grid;

    // точки повинні бути всередині гріда
    if (!g.pointInGrid(ax, az) || !g.pointInGrid(bx, bz)) return false;


    let a = g.worldToCell(ax, az);
    let b = g.worldToCell(bx, bz);
    

    if (snapToPassable) {
      const aPass = this.findNearestPassable(a.i, a.j, r, safety, 40);
      const bPass = this.findNearestPassable(b.i, b.j, r, safety, 40);
      if (!aPass || !bPass) return false;
      a = aPass; b = bPass;
    }

    return this.hasLineOfSight(a, b, r, safety, excludeId);
  }

  getPassabilityVisualizationData(
    centerX: number,
    centerZ: number,
    radius: number,
    droneObj: TSceneObject,
    safety = 0.05
  ): Array<{x: number, z: number, passable: boolean}> {
    const g = this.grid;
    const r = droneObj.obstacleSize ?? 0.5;

    const centerCell = g.worldToCell(centerX, centerZ);
    const radiusCells = Math.ceil(radius / g.s);

    const result: Array<{x: number, z: number, passable: boolean}> = [];

    for (let di = -radiusCells; di <= radiusCells; di++) {
      for (let dj = -radiusCells; dj <= radiusCells; dj++) {
        const i = centerCell.i + di;
        const j = centerCell.j + dj;

        if (!g.inb(i, j)) continue;

        const worldPos = g.cellCenter(i, j);
        const passable = g.passable(i, j, r, safety, droneObj.id);

        result.push({
          x: worldPos.x,
          z: worldPos.y,
          passable
        });
      }
    }

    return result;
  }

  getRoadsVisualizationData(
    centerX: number,
    centerZ: number,
    radius: number
  ): Array<{x: number, z: number, isRoad: boolean, speedBonus: number}> {
    const g = this.grid;

    const centerCell = g.worldToCell(centerX, centerZ);
    const radiusCells = Math.ceil(radius / g.s);

    const result: Array<{x: number, z: number, isRoad: boolean, speedBonus: number}> = [];

    for (let di = -radiusCells; di <= radiusCells; di++) {
      for (let dj = -radiusCells; dj <= radiusCells; dj++) {
        const i = centerCell.i + di;
        const j = centerCell.j + dj;

        if (!g.inb(i, j)) continue;

        const worldPos = g.cellCenter(i, j);
        const isRoad = g.isRoad(i, j);
        const speedBonus = g.getRoadSpeedBonus(i, j);

        result.push({
          x: worldPos.x,
          z: worldPos.y,
          isRoad,
          speedBonus
        });
      }
    }

    return result;
  }
}
