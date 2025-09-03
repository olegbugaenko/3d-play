// OccupancyGridStore.ts
export type Vec2 = { x: number; y: number };

type StaticShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "aabb"; x0: number; y0: number; x1: number; y1: number };

type DynObj = { id: string; x: number; y: number; r: number };

// Простий spatial-hash для динаміки
class DynSpatialHash {
  private cell: number;
  private buckets = new Map<string, Set<string>>();
  constructor(cellSize: number) { this.cell = Math.max(cellSize, 1e-6); }
  private key(ix: number, iy: number) { return `${ix},${iy}`; }
  private ix(x: number) { return Math.floor(x / this.cell); }
  private iy(y: number) { return Math.floor(y / this.cell); }

  insert(o: DynObj) {
    const k = this.key(this.ix(o.x), this.iy(o.y));
    if (!this.buckets.has(k)) this.buckets.set(k, new Set());
    this.buckets.get(k)!.add(o.id);
  }
  remove(o: DynObj) {
    const k = this.key(this.ix(o.x), this.iy(o.y));
    const s = this.buckets.get(k); if (!s) return;
    s.delete(o.id); if (s.size === 0) this.buckets.delete(k);
  }
  move(oldO: DynObj, newO: DynObj) {
    const oldK = this.key(this.ix(oldO.x), this.iy(oldO.y));
    const newK = this.key(this.ix(newO.x), this.iy(newO.y));
    if (oldK === newK) return;
    this.remove(oldO); this.insert(newO);
  }
  queryAABB(minx: number, miny: number, maxx: number, maxy: number): string[] {
    const ix0 = this.ix(minx), iy0 = this.iy(miny);
    const ix1 = this.ix(maxx), iy1 = this.iy(maxy);
    const out: string[] = []; const seen = new Set<string>();
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) {
      const s = this.buckets.get(this.key(ix, iy)); if (!s) continue;
      for (const id of s) if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
  }
}

export class OccupancyGridStore {
  readonly W: number;
  readonly H: number;
  readonly s: number;
  readonly minx: number;
  readonly miny: number;

  // Статика як лічильник покриттів
  private occStaticCount: Uint16Array;
  // Бінарна маска статики (1 = перешкода)
  readonly occStaticBin: Uint8Array;
  // Динаміка (broad-phase, якщо ввімкнено dynMaxStampR)
  readonly occDyn: Uint16Array;

  // Clearance у метрах (після computeClearanceMeters)
  clearance?: Float32Array;

  // Реєстр статичних об'єктів
  public statics = new Map<string, StaticShape>();

  // Реєстр динаміки й spatial index
  public dyn = new Map<string, DynObj>();
  private dynIndex: DynSpatialHash;
  private dynMaxStampR?: number; // якщо задано — штампуємо під цей радіус для broad-phase

  constructor(W: number, H: number, cellSize: number, minx = 0, miny = 0, dynMaxStampR?: number) {
    this.W = W; this.H = H; this.s = cellSize; this.minx = minx; this.miny = miny;
    this.occStaticCount = new Uint16Array(W * H);
    this.occStaticBin   = new Uint8Array(W * H);
    this.occDyn         = new Uint16Array(W * H);
    // spatial-hash з бакетом ~2 клітинки (можна підкрутити)
    this.dynIndex = new DynSpatialHash(Math.max(cellSize * 2, 1.0));
    this.dynMaxStampR = dynMaxStampR;
  }

  // ---- базові утиліти ----
  idx(i: number, j: number) { return i + j * this.W; }
  inb(i: number, j: number) { return i >= 0 && j >= 0 && i < this.W && j < this.H; }
  worldToCell(x: number, y: number) {
    return { i: Math.floor((x - this.minx) / this.s), j: Math.floor((y - this.miny) / this.s) };
  }
  cellCenter(i: number, j: number): Vec2 {
    return { x: this.minx + (i + 0.5) * this.s, y: this.miny + (j + 0.5) * this.s };
  }

  public debugStaticMaskOn(): number {
    let c = 0;
    for (let k = 0; k < this.occStaticBin.length; k++) if (this.occStaticBin[k]) c++;
    return c;
  }
  
  // сума лічильників (з урахуванням перекриттів)
  public debugStaticCountSum(): number {
    let s = 0;
    for (let k = 0; k < this.occStaticCount.length; k++) s += this.occStaticCount[k];
    return s;
  }
  
  // межі гріда у світі
  public worldBounds() {
    return {
      minx: this.minx,
      maxx: this.minx + this.W * this.s,
      minz: this.miny,
      maxz: this.miny + this.H * this.s,
    };
  }
  
  // точка у межах гріда?
  public pointInGrid(x:number, z:number): boolean {
    const b = this.worldBounds();
    return x >= b.minx && x < b.maxx && z >= b.minz && z < b.maxz;
  }

  // ---- перетини клітинки ----
  private circleIntersectsCell(cx: number, cy: number, R: number, x0: number, y0: number): boolean {
    const x1 = x0 + this.s, y1 = y0 + this.s;
    const nx = Math.max(x0, Math.min(cx, x1));
    const ny = Math.max(y0, Math.min(cy, y1));
    const dx = nx - cx, dy = ny - cy;
    return dx * dx + dy * dy <= R * R;
  }
  private aabbIntersectsCell(ax0: number, ay0: number, ax1: number, ay1: number, x0: number, y0: number): boolean {
    const x1 = x0 + this.s, y1 = y0 + this.s;
    return !(ax1 <= x0 || ax0 >= x1 || ay1 <= y0 || ay0 >= y1);
  }

  // ---- растеризація статики (+1/-1) ----
  private rasterizeStatic(shape: StaticShape, delta: 1 | -1): void {
    const { W, H, s, minx, miny } = this;
    if (shape.kind === "circle") {
      const { cx, cy, r } = shape;
      const i0 = Math.max(0, Math.floor((cx - r - minx) / s));
      const i1 = Math.min(W - 1, Math.floor((cx + r - minx) / s));
      const j0 = Math.max(0, Math.floor((cy - r - miny) / s));
      const j1 = Math.min(H - 1, Math.floor((cy + r - miny) / s));
      for (let i = i0; i <= i1; i++) {
        const x0 = minx + i * s;
        for (let j = j0; j <= j1; j++) {
          const y0 = miny + j * s;
          if (this.circleIntersectsCell(cx, cy, r, x0, y0)) {
            const k = this.idx(i, j);
            const before = this.occStaticCount[k];
            const after  = delta > 0 ? Math.min(before + 1, 0xffff) : before > 0 ? before - 1 : 0;
            if (after !== before) {
              this.occStaticCount[k] = after;
              this.occStaticBin[k] = after > 0 ? 1 : 0;
            }
          }
        }
      }
    } else {
      const ax0 = Math.min(shape.x0, shape.x1), ay0 = Math.min(shape.y0, shape.y1);
      const ax1 = Math.max(shape.x0, shape.x1), ay1 = Math.max(shape.y0, shape.y1);
      const i0 = Math.max(0, Math.floor((ax0 - minx) / s));
      const i1 = Math.min(W - 1, Math.floor((ax1 - minx) / s));
      const j0 = Math.max(0, Math.floor((ay0 - miny) / s));
      const j1 = Math.min(H - 1, Math.floor((ay1 - miny) / s));
      for (let i = i0; i <= i1; i++) {
        const x0 = minx + i * s;
        for (let j = j0; j <= j1; j++) {
          const y0 = miny + j * s;
          if (this.aabbIntersectsCell(ax0, ay0, ax1, ay1, x0, y0)) {
            const k = this.idx(i, j);
            const before = this.occStaticCount[k];
            const after  = delta > 0 ? Math.min(before + 1, 0xffff) : before > 0 ? before - 1 : 0;
            if (after !== before) {
              this.occStaticCount[k] = after;
              this.occStaticBin[k] = after > 0 ? 1 : 0;
            }
          }
        }
      }
    }
  }

  // ---- публічна статика ----
  addStaticCircle(id: string, cx: number, cy: number, r: number): void {
    if (this.statics.has(id)) throw new Error(`static '${id}' exists`);
    const sh: StaticShape = { kind: "circle", cx, cy, r };
    this.statics.set(id, sh);
    this.rasterizeStatic(sh, 1);
  }
  addStaticAABB(id: string, x0: number, y0: number, x1: number, y1: number): void {
    if (this.statics.has(id)) throw new Error(`static '${id}' exists`);
    const sh: StaticShape = { kind: "aabb", x0, y0, x1, y1 };
    this.statics.set(id, sh);
    this.rasterizeStatic(sh, 1);
  }
  removeStatic(id: string): void {
    const sh = this.statics.get(id); if (!sh) return;
    this.rasterizeStatic(sh, -1);
    this.statics.delete(id);
  }
  clearStatic(): void {
    this.occStaticCount.fill(0);
    this.occStaticBin.fill(0);
    this.statics.clear();
    this.clearance = undefined;
  }

  // ---- динаміка: зручний прямий штамп (під коли Р відомий) ----
  stampDynCircle(cx: number, cy: number, R: number, delta: 1 | -1): void {
    const { W, H, s, minx, miny, occDyn } = this;
    const i0 = Math.max(0, Math.floor((cx - R - minx) / s));
    const i1 = Math.min(W - 1, Math.floor((cx + R - minx) / s));
    const j0 = Math.max(0, Math.floor((cy - R - miny) / s));
    const j1 = Math.min(H - 1, Math.floor((cy + R - miny) / s));
    for (let i = i0; i <= i1; i++) {
      const x0 = minx + i * s;
      for (let j = j0; j <= j1; j++) {
        const y0 = miny + j * s;
        if (this.circleIntersectsCell(cx, cy, R, x0, y0)) {
          const k = this.idx(i, j);
          occDyn[k] = delta > 0 ? Math.min(occDyn[k] + 1, 0xffff) : occDyn[k] > 0 ? occDyn[k] - 1 : 0;
        }
      }
    }
  }

  // ---- динаміка: raw-режим (без знання агентів) + optional broad-phase ----
  private stampDynBroad(cx: number, cy: number, delta: 1 | -1) {
    if (this.dynMaxStampR == null) return;
    this.stampDynCircle(cx, cy, this.dynMaxStampR, delta);
  }

  addDynamicRaw(id: string, x: number, y: number, r: number): void {
    if (this.dyn.has(id)) throw new Error(`dynamic '${id}' exists`);
    const o: DynObj = { id, x, y, r };
    this.dyn.set(id, o);
    this.dynIndex.insert(o);
    this.stampDynBroad(x, y, 1);
  }

  moveDynamicRaw(id: string, x: number, y: number, r?: number): void {
    const prev = this.dyn.get(id);
    if (!prev) { this.addDynamicRaw(id, x, y, r ?? 0); return; }
    const next: DynObj = { id, x, y, r: r ?? prev.r };
    this.stampDynBroad(prev.x, prev.y, -1);
    this.dynIndex.move(prev, next);
    this.stampDynBroad(next.x, next.y, 1);
    this.dyn.set(id, next);
  }

  removeDynamicRaw(id: string): void {
    const o = this.dyn.get(id); if (!o) return;
    this.stampDynBroad(o.x, o.y, -1);
    this.dynIndex.remove(o);
    this.dyn.delete(id);
  }

  // ---- move зі штампуванням (коли хочеш саме occDyn міняти під конкретний R) ----
  moveDynamicStamped(id: string, newX: number, newY: number, R: number, sweep = false): void {
    // якщо був попередній штамп — знімаємо
    // тут припускаємо, що ти сам зберігаєш старі (x,y) десь зовні; або заведи ще мапу для штампів
    // Для прикладу: робимо просто «свіп-штамп» сегментом (опційно)
    if (sweep) {
      const obj = this.dyn.get(id);
      if (obj) this.stampDynSegment(obj.x, obj.y, newX, newY, R, -1);
      this.stampDynSegment(newX, newY, newX, newY, R, +1);
    } else {
      const obj = this.dyn.get(id);
      if (obj) this.stampDynCircle(obj.x, obj.y, R, -1);
      this.stampDynCircle(newX, newY, R, +1);
    }
  }

  private stampDynSegment(x0: number, y0: number, x1: number, y1: number, R: number, delta: 1 | -1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) { this.stampDynCircle(x0, y0, R, delta); return; }
    const step = Math.max(this.s * 0.5, R * 0.5);
    const n = Math.ceil(len / step);
    for (let t = 0; t <= n; t++) {
      const a = t / n;
      this.stampDynCircle(x0 + dx * a, y0 + dy * a, R, delta);
    }
  }

  // ---- clearance ----
  computeClearanceMeters(): Float32Array {
    const edt = buildClearanceMeters(this.occStaticBin, this.W, this.H, this.s);
    this.clearance = edt;
    return edt;
  }
  rebuildClearanceAfterStaticsChanged(): Float32Array {
    return this.computeClearanceMeters();
  }

  // ---- перевірка динаміки під конкретний r (вузька фаза) ----
  private dynamicBlocksCell(i: number, j: number, r: number, safety = 0): boolean {
    const x0 = this.minx + i * this.s, y0 = this.miny + j * this.s;
    const pad = r + safety;
    const ids = this.dynIndex.queryAABB(x0 - pad, y0 - pad, x0 + this.s + pad, y0 + this.s + pad);
    for (const id of ids) {
      const o = this.dyn.get(id)!;
      const R = o.r + r + safety;
      if (this.circleIntersectsCell(o.x, o.y, R, x0, y0)) return true;
    }
    return false;
  }

  // ---- прохідність з урахуванням clearance (статик) та динаміки ----
  passable(i: number, j: number, r: number, safety = 0): boolean {
    if (!this.inb(i, j)) return false;
    if (!this.clearance) throw new Error("clearance not computed");
    if (this.clearance[this.idx(i, j)] < r + safety) return false;

    if (this.dynMaxStampR != null) {
      // broad-phase: якщо штампа нема — точно вільно
      if (this.occDyn[this.idx(i, j)] === 0) return true;
      // інакше звужуємо перевіркою через індекс
      return !this.dynamicBlocksCell(i, j, r, safety);
    } else {
      // лише індекс
      return !this.dynamicBlocksCell(i, j, r, safety);
    }
  }
}

// === EDT (Felzenszwalb & Huttenlocher) ===

function edt1d(f: Float64Array): Float64Array {
  const n = f.length;
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const d = new Float64Array(n);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const diff = q - v[k];
    d[q] = diff * diff + f[v[k]];
  }
  return d;
}

export function buildClearanceMeters(occ: Uint8Array, W: number, H: number, cellSize: number): Float32Array {
  const INF = 1e12;
  const tmp = new Float64Array(W * H);
  const out = new Float32Array(W * H);

  const row = new Float64Array(W);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) row[i] = occ[i + j * W] ? 0 : INF;
    const d = edt1d(row);
    for (let i = 0; i < W; i++) tmp[i + j * W] = d[i];
  }

  const col = new Float64Array(H);
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) col[j] = tmp[i + j * W];
    const d = edt1d(col);
    for (let j = 0; j < H; j++) {
      const distCells = Math.sqrt(d[j]);
      const meters = Math.max(0, distCells * cellSize - 0.5 * cellSize);
      out[i + j * W] = meters;
    }
  }
  return out;
}
