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

  canStandAtWorld(x: number, z: number, obj: TSceneObject, safety = 0): boolean {
    const { i, j } = this.grid.worldToCell(x, z);
    if (!this.grid.inb(i, j)) return false;
    // Використовує clearance + динаміку (raw index / hybrid) усередині
    return this.grid.passable(i, j, obj.obstacleSize ?? 0.5, safety);
  }
  public findDockingPointToStatic(
    drone: TSceneObject,
    target: TSceneObject,
    safety = 0.1,
    fullCircle = true
  ): Vector3 | null {
    const g = this.grid;
    const rA = drone.obstacleSize ?? 0.5;
    const rB = target.obstacleSize ?? 0.0;
  
    // Базовий радіус кільця
    const R0 = rA + rB + safety;
  
    const sx = drone.coordinates.x,  sz = drone.coordinates.z;
    const cx = target.coordinates.x, cz = target.coordinates.z;
  
    const baseAngle = Math.atan2(sz - cz, sx - cx);
  
    // Крок по куту: дуга ≈ 0.5 клітинки
    const arcMeters = Math.max(g.s * 0.5, 0.001);
    const dTheta = Math.min(Math.PI / 6, arcMeters / Math.max(R0, 1e-6));
    const stepsEachSide = Math.ceil((fullCircle ? Math.PI : Math.PI / 2) / dTheta);
  
    // Радіальні бампи (компенсація дискретизації)
    const bumps = [0, g.s * 0.25, g.s * 0.5]; // спробуємо 0, +0.125м, +0.25м при s=0.5
  
    let best: Vector3 | null = null;
    let bestDist2 = Infinity;
  
    for (let k = 0; k <= stepsEachSide; k++) {
      const offsets = k === 0 ? [0] : [-k, +k];
      for (const sgn of offsets) {
        const theta = baseAngle + sgn * dTheta;
  
        // пробуємо кілька радіусів (R0 + бамп)
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
  
          // Якщо хочеш першу валідну — можеш одразу return {x,y,z};
          // Я лишаю пошук найкоротшої для стабільності.
          break; // цей кут дав валідну точку — не збільшуємо радіус ще
        }
      }
    }
  
    return best;
  }
  


  /**
   * Знаходить оптимальний шлях у 2D (XZ) для агента obj.
   * Повертає масив world-waypoints (x,y,z). y виставляємо = start.y для зручності.
   */
  findOptimalPath(start: Vector3, end: Vector3, obj: TSceneObject): Vector3[] {
    const g = this.grid;
    const r = (obj.obstacleSize ?? 0.5);
    const safety = 0.05;

    // 1) Перетворюємо світ→клітинка
    let { i: si, j: sj } = g.worldToCell(start.x, start.z);
    let { i: gi, j: gj } = g.worldToCell(end.x, end.z);

    // обмежуємо в межі
    si = Math.max(0, Math.min(g.W - 1, si));
    sj = Math.max(0, Math.min(g.H - 1, sj));
    gi = Math.max(0, Math.min(g.W - 1, gi));
    gj = Math.max(0, Math.min(g.H - 1, gj));

    // 2) Якщо старт/фініш непридатні — знайдемо найближчу прохідну клітинку (локальний пошук)
    const sCell = this.findNearestPassable(si, sj, r, safety, 30);
    const gCell = this.findNearestPassable(gi, gj, r, safety, 30);
    if (!sCell || !gCell) return []; // немає доступного старту або фінішу

    // 3) A* (octile) з діагоналями та без "corner cutting"
    const pathCells = this.astar(sCell, gCell, r, safety, /*allowDiagonal*/ true, /*maxExpand*/ g.W * g.H);
    if (pathCells.length === 0) return [];

    // 4) LoS string-pull: агресивно скорочуємо перелік клітин
    const simplifiedCells = this.simplifyByLoS(pathCells, r, safety);

    // 5) Перетворюємо клітинки у світові точки (XZ → x,z), y тримаємо як start.y
    const waypoints: Vector3[] = simplifiedCells.map(({ i, j }) => {
      const c = g.cellCenter(i, j); // {x, y} де y == друга вісь ґріда (у тебе це Z)
      return { x: c.x, y: start.y, z: c.y };
    });

    // (необов’язково) закинемо точні start/end у початок/кінець траєкторії
    if (waypoints.length > 0) {
      waypoints[0] = { x: start.x, y: start.y, z: start.z };
      waypoints[waypoints.length - 1] = { x: end.x, y: start.y, z: end.z };
    }
    return waypoints;
  }

  // ---------- A* з octile-евристикою ----------
  private astar(start: Cell, goal: Cell, r: number, safety: number, allowDiag = true, maxExpand = 1e7): Cell[] {
    const W = this.grid.W, H = this.grid.H;
    const N = W * H;
    const idx = (i: number, j: number) => i + j * W;

    const gScore = new Float32Array(N); gScore.fill(Infinity);
    const parent = new Int32Array(N); parent.fill(-1);
    const closed = new Uint8Array(N);

    const heap = new MinHeap();
    const sk = idx(start.i, start.j);
    const tk = idx(goal.i, goal.j);

    const h0 = this.octile(start.i, start.j, goal.i, goal.j);
    gScore[sk] = 0;
    heap.push({ k: sk, f: h0 });

    const dirs: Array<[number, number, number]> = allowDiag
      ? [[1,0,1],[0,1,1],[-1,0,1],[0,-1,1],[1,1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2]]
      : [[1,0,1],[0,1,1],[-1,0,1],[0,-1,1]];

    let expanded = 0;

    while (heap.size()) {
      const cur = heap.pop()!;
      const k = cur.k;
      if (closed[k]) continue;
      closed[k] = 1;

      if (k === tk) {
        return this.reconstructPath(parent, k, W);
      }
      if (++expanded > maxExpand) break;

      const ci = k % W;
      const cj = (k / W) | 0;

      for (const [dx, dy, stepCost] of dirs) {
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;

        // забораняємо "corner cutting" для діагоналі
        if (dx !== 0 && dy !== 0) {
          if (!this.grid.passable(ci + dx, cj, r, safety)) continue;
          if (!this.grid.passable(ci, cj + dy, r, safety)) continue;
        }
        if (!this.grid.passable(ni, nj, r, safety)) continue;

        const nk = idx(ni, nj);
        if (closed[nk]) continue;

        const tentativeG = gScore[k] + stepCost;

        if (tentativeG < gScore[nk]) {
          gScore[nk] = tentativeG;
          parent[nk] = k;
          const h = this.octile(ni, nj, goal.i, goal.j);
          // трошки підсилюємо евристику для tie-break
          const f = tentativeG + h * (1 + 1e-6);
          heap.push({ k: nk, f });
        }
      }
    }
    return [];
  }

  private reconstructPath(parent: Int32Array, k: number, W: number): Cell[] {
    const out: Cell[] = [];
    while (k !== -1) {
      out.push({ i: k % W, j: (k / W) | 0 });
      k = parent[k];
    }
    out.reverse();
    return out;
  }

  private octile(i0: number, j0: number, i1: number, j1: number): number {
    const dx = Math.abs(i1 - i0), dy = Math.abs(j1 - j0);
    // const d = Math.max(dx, dy);
    const m = Math.min(dx, dy);
    // D=1, D2=sqrt(2): h = (dx+dy) + (sqrt(2)-2)*min(dx,dy)
    return (dx + dy) + (Math.SQRT2 - 2) * m;
  }

  // ---------- Найближча прохідна клітинка (квадратні "кільця") ----------
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

  // ---------- LoS string-pull (суперпростий і швидкий) ----------
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
    const c0 = this.grid.cellCenter(a.i, a.j); // {x, y} де y — друга вісь ґріда (твій Z)
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
    // (якщо потрібно суперконсервативно: при переході через межі семплити +ε у сусідні клітини)
  }
}
