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
  constructor(public grid: OccupancyGridStore) {
    this.grid = grid;
  }

  // ──────────────────────────────
  //           API helpers
  // ──────────────────────────────

  canStandAtWorld(x: number, z: number, obj: TSceneObject, safety = 0): boolean {
    const { i, j } = this.grid.worldToCell(x, z);
    if (!this.grid.inb(i, j)) return false;
    return this.grid.passable(i, j, obj.obstacleSize ?? 0.5, safety);
  }

  /**
   * Найближча валідна "точка дотику" для СТАТИЧНОЇ цілі (без A*).
   * Повертає world-позицію (x,y,z) або null.
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

    // дуга ≈ 0.5 клітинки
    const arcMeters = Math.max(g.s * 0.5, 0.001);
    const dTheta = Math.min(Math.PI / 6, arcMeters / Math.max(R0, 1e-6));
    const stepsEachSide = Math.ceil((fullCircle ? Math.PI : Math.PI / 2) / dTheta);

    // Радіальні бампи (компенсація дискретизації)
    const bumps = [0, g.s * 0.25, g.s * 0.5, g.s * 0.75];

    let best: Vector3 | null = null;
    let bestDist2 = Infinity;

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
          if (!g.passable(i, j, rA, safety)) continue;

          const d2 = (x - sx) * (x - sx) + (z - sz) * (z - sz);
          if (d2 < bestDist2) {
            bestDist2 = d2;
            best = { x, y: drone.coordinates.y, z };
          }
          break; // цей кут дав валідну точку — далі bump не пробуємо
        }
      }
    }
    return best;
  }

  /**
   * Знаходить оптимальний шлях у 2D (XZ) для агента obj.
   * Повертає масив world-waypoints (x,y,z). y = start.y.
   */
  findOptimalPath(start: Vector3, end: Vector3, obj: TSceneObject): Vector3[] {
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

    // 2.5) ранній LoS-­шорткат
    if (this.hasLineOfSight(sCell, gCell, r, safety)) {
      const p1 = g.cellCenter(gCell.i, gCell.j);
      return [
        { x: start.x, y: start.y, z: start.z },
        { x: p1.x,   y: start.y,  z: p1.y   },
        { x: end.x,  y: start.y,  z: end.z  },
      ];
    }

    // 3) A* (best-effort, без corner cutting на діагоналях)
    const pathCells = this.astarSafe(
      sCell, gCell, r, safety,
      /*allowDiag*/ true,
      /*maxExpand*/ 250_000 // обмеження, щоб не “заливати” всю мапу
    );
    if (pathCells.length === 0) return [];

    // 4) LoS string-pull (спрощення)
    const simplifiedCells = this.simplifyByLoS(pathCells, r, safety);

    // 5) клітинки → world
    const waypoints: Vector3[] = simplifiedCells.map(({ i, j }) => {
      const c = g.cellCenter(i, j);
      return { x: c.x, y: start.y, z: c.y };
    });

    if (waypoints.length > 0) {
      waypoints[0] = { x: start.x, y: start.y, z: start.z };
      waypoints[waypoints.length - 1] = { x: end.x, y: start.y, z: end.z };
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

    // Вікно пошуку: прямокутник навколо [start..goal] з буфером
    const buf = 300; // клітинок запасу
    const minI = Math.max(0, Math.min(sCell.i, gCell.i) - buf);
    const maxI = Math.min(this.grid.W - 1, Math.max(sCell.i, gCell.i) + buf);
    const minJ = Math.max(0, Math.min(sCell.j, gCell.j) - buf);
    const maxJ = Math.min(this.grid.H - 1, Math.max(sCell.j, gCell.j) + buf);

    return this.astarCore(sCell, gCell, r, safety, allowDiag, maxExpand, { minI, maxI, minJ, maxJ });
  }

  // ──────────────────────────────
  //      A* ядро з runId буферами
  // ──────────────────────────────

  // runId-буфери (реюз, без великих fill)
  private runId = 1;
  private N = 0;
  private Wbuf = 0;
  private Hbuf = 0;
  private gScore!: Float32Array;
  private gSeen!: Uint32Array;
  private parent!: Int32Array;
  private pSeen!: Uint32Array;
  private closed!: Uint32Array;

  // Опційна мемоїзація passable на один запуск
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
    // новий запуск (уникаємо 0)
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

    const h0 = this.octile(start.i, start.j, goal.i, goal.j);
    this.setG(sk, 0);
    this.setParent(sk, -1); // корінь ланцюга у цьому run
    heap.push({ k: sk, f: h0 });

    const dirs: Array<[number, number, number]> = allowDiag
      ? [[1,0,1],[0,1,1],[-1,0,1],[0,-1,1],[1,1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2]]
      : [[1,0,1],[0,1,1],[-1,0,1],[0,-1,1]];

    let expanded = 0;

    // best-effort вузол — найменша евристика
    let bestK = sk;
    let bestH = h0;

    // невеликий таймбокс, щоб не фризити кадр
    const startTs = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const MAX_MS = 12;

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

      for (const [dx, dy, stepCost] of dirs) {
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;

        // вікно пошуку
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

        const tentativeG = this.getG(k) + stepCost;
        if (tentativeG < this.getG(nk)) {
          this.setG(nk, tentativeG);
          this.setParent(nk, k);

          const h = this.octile(ni, nj, goal.i, goal.j);
          if (h < bestH) { bestH = h; bestK = nk; }

          const f = tentativeG + h + 1e-6 * h; // легкий tie-break
          heap.push({ k: nk, f });
        }
      }
    }

    // best-effort
    return this.reconstructPathCurrentRun(bestK, W);
  }

  private reconstructPathCurrentRun(k: number, W: number): Cell[] {
    const out: Cell[] = [];
    const GUARD = this.N + 5; // safety
    let steps = 0;
    while (k !== -1 && steps++ < GUARD) {
      out.push({ i: k % W, j: (k / W) | 0 });
      // читаємо parent ТІЛЬКИ якщо він виставлений у цьому runId
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
    // D=1, D2=sqrt(2): h = (dx+dy) + (sqrt(2)-2)*min(dx,dy)
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
      // верх/низ
      for (let x = i0; x <= i1; x++) {
        if (this.grid.passable(x, j0, r, safety)) return { i: x, j: j0 };
        if (this.grid.passable(x, j1, r, safety)) return { i: x, j: j1 };
      }
      // ліво/право
      for (let y = j0 + 1; y <= j1 - 1; y++) {
        if (this.grid.passable(i0, y, r, safety)) return { i: i0, j: y };
        if (this.grid.passable(i1, y, r, safety)) return { i: i1, j: y };
      }
    }
    return null;
  }

  // ──────────────────────────────
  //         LoS string-pull
  // ──────────────────────────────

  private simplifyByLoS(path: Cell[], r: number, safety: number): Cell[] {
    if (path.length <= 2) return path.slice();
    const out: Cell[] = [path[0]];
    let anchor = 0;
    for (let k = 2; k < path.length; k++) {
      if (!this.hasLineOfSight(path[anchor], path[k], r, safety)) {
        out.push(path[k - 1]);
        anchor = k - 1;
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  /**
   * Перевірка видимості між клітинками (центр↔центр) через дискретне семплювання.
   * Крок семплу — половина розміру клітинки.
   */
  private hasLineOfSight(a: Cell, b: Cell, r: number, safety: number): boolean {
    const c0 = this.grid.cellCenter(a.i, a.j); // {x, y} де y — твій Z
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
      if (!this.grid.inb(i, j) || !this.grid.passable(i, j, r, safety)) return false;
    }
    return true;
  }
}
