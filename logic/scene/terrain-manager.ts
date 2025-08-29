import { Vector3 } from '../utils/vector-math';
import { SeededRandom } from '../map/seeded-random';

export interface TerrainConfig {
  width: number;
  height: number;
  resolution: number;      // розмір клітинки у world-одиницях
  maxHeight: number;
  minHeight: number;
  seed?: number;

  noise?: {
    scale: number;         // чим більше — тим «дрібніші» деталі (фактично частота)
    octaves: number;       // 3–6 зазвичай достатньо
    persistence: number;   // 0.3–0.6
    lacunarity: number;    // 1.8–3.0
  };

  textures?: {
    [key: string]: {
      weight: number;
      texturePath: string;
      tiling?: { x: number, y: number };
    };
  };
}

export interface HeightMap {
  data: number[][];
  width: number;
  height: number;
  resolution: number;
}

type SeedProfile = {
  offX: number;
  offZ: number;
  rot: number;               // радіани
  warpAmp: number;           // world-одиниці
  warpFreq: number;          // частота варпінгу
  octaveFreqJitter: number[]; // множники частот по октавах
  octaveAmpJitter: number[];  // множники амплітуд по октавах
};

export class TerrainManager {
  private heightMap: HeightMap;
  private config: TerrainConfig;
  private seededRandom: SeededRandom;

  private hashCache = new Map<string, number>();
  private seedProfile!: SeedProfile;

  constructor(config: TerrainConfig) {
    this.config = { ...config };
    const seed = config.seed ?? Date.now();
    this.seededRandom = new SeededRandom(seed);
    this.seedProfile = this.makeSeedProfile();
    this.heightMap = this.generateDefaultHeightMap();
  }

  // -----------------------------
  // Детермінований 2D value noise
  // -----------------------------
  private hash(ix: number, iz: number): number {
    const k = `${ix},${iz}`;
    const v = this.hashCache.get(k);
    if (v !== undefined) return v;

    const m = 374761393 * ix + 668265263 * iz + (this.config.seed ?? 0);
    const local = new SeededRandom(m >>> 0);
    const r = local.nextFloat(0, 1);
    this.hashCache.set(k, r);
    return r;
  }

  private smoothstep(t: number): number {
    // 6t^5 - 15t^4 + 10t^3
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private valueNoise2D(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const fx = x - x0;
    const fz = z - z0;

    const u = this.smoothstep(fx);
    const v = this.smoothstep(fz);

    const n00 = this.hash(x0, z0);
    const n10 = this.hash(x1, z0);
    const n01 = this.hash(x0, z1);
    const n11 = this.hash(x1, z1);

    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    const n = nx0 * (1 - v) + nx1 * v;
    return n; // [0..1]
  }

  private fbm(x: number, z: number): number {
    const nopt = this.config.noise ?? {
      scale: 0.005,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2.0,
    };

    let amp = 1.0;
    let freq = nopt.scale;
    let sum = 0.0;
    let norm = 0.0;

    for (let i = 0; i < nopt.octaves; i++) {
      sum += this.valueNoise2D(x * freq, z * freq) * amp;
      norm += amp;
      amp *= nopt.persistence;
      freq *= nopt.lacunarity;
    }
    return sum / (norm > 0 ? norm : 1);
  }

  // fBm з сид-джитером по октавах
  private fbmTransformed(x: number, z: number): number {
    const nopt = this.config.noise ?? { scale: 0.005, octaves: 4, persistence: 0.5, lacunarity: 2.0 };
    const sp = this.seedProfile;

    let amp = 1.0;
    let freq = nopt.scale;
    let sum = 0.0;
    let norm = 0.0;

    for (let i = 0; i < nopt.octaves; i++) {
      const fMul = sp.octaveFreqJitter[i % sp.octaveFreqJitter.length];
      const aMul = sp.octaveAmpJitter[i % sp.octaveAmpJitter.length];

      sum  += this.valueNoise2D(x * freq * fMul, z * freq * fMul) * (amp * aMul);
      norm += amp * aMul;

      amp  *= nopt.persistence;
      freq *= nopt.lacunarity;
    }
    return sum / (norm || 1);
  }

  // -----------------------------
  // Seed-профіль (варіативність)
  // -----------------------------
  private makeSeedProfile(): SeedProfile {
    const rnd = this.seededRandom;
    const maxOct = Math.max(1, (this.config.noise?.octaves ?? 4) | 0);

    return {
      offX: rnd.nextFloat(-1e6, 1e6),
      offZ: rnd.nextFloat(-1e6, 1e6),
      rot:  rnd.nextFloat(0, Math.PI * 2),
      warpAmp:  rnd.nextFloat(20, 60),
      warpFreq: rnd.nextFloat(0.002, 0.01),
      octaveFreqJitter: Array.from({ length: maxOct }, () => rnd.nextFloat(0.85, 1.15)),
      octaveAmpJitter:  Array.from({ length: maxOct }, () => rnd.nextFloat(0.85, 1.15)),
    };
  }

  // -----------------------------
  // Єдина функція висоти (з трансформаціями сидa)
  // -----------------------------
  private heightAtWorld(x: number, z: number): number {
    const sp = this.seedProfile;

    // сид-зсув + обертання домену
    const cosr = Math.cos(sp.rot), sinr = Math.sin(sp.rot);
    let dx = x + sp.offX;
    let dz = z + sp.offZ;
    const rx =  dx * cosr - dz * sinr;
    const rz =  dx * sinr + dz * cosr;

    // легкий domain warping
    const wx = this.valueNoise2D(rx * sp.warpFreq, rz * sp.warpFreq) * 2 - 1; // [-1..1]
    const wz = this.valueNoise2D((rx + 37.1) * sp.warpFreq, (rz - 19.3) * sp.warpFreq) * 2 - 1;
    const tx = rx + wx * sp.warpAmp;
    const tz = rz + wz * sp.warpAmp;

    const n = this.fbmTransformed(tx, tz); // [0..1]
    const { minHeight, maxHeight } = this.config;
    return minHeight + (maxHeight - minHeight) * n;
  }

  // -----------------------------------------
  // Генерація height map (дискретизація heightAtWorld)
  // -----------------------------------------
  private generateDefaultHeightMap(): HeightMap {
    const { width, height, resolution } = this.config;

    const cols = Math.ceil(width / resolution);
    const rows = Math.ceil(height / resolution);

    const halfW = width * 0.5;
    const halfH = height * 0.5;

    const data: number[][] = new Array(rows);

    for (let r = 0; r < rows; r++) {
      data[r] = new Array(cols);
      const wz = -halfH + r * resolution;
      for (let c = 0; c < cols; c++) {
        const wx = -halfW + c * resolution;
        data[r][c] = this.heightAtWorld(wx, wz);
      }
    }

    return { data, width, height, resolution };
  }

  // -----------------------------
  // Публічний API
  // -----------------------------
  getHeightAt(x: number, z: number): number {
    return this.heightAtWorld(x, z);
  }

  getNormalAt(x: number, z: number): Vector3 {
    const eps = Math.max(0.05, this.config.resolution * 0.25);

    const hL = this.getHeightAt(x - eps, z);
    const hR = this.getHeightAt(x + eps, z);
    const hD = this.getHeightAt(x, z - eps);
    const hU = this.getHeightAt(x, z + eps);

    const tX = { x: 2 * eps, y: hR - hL, z: 0 };
    const tZ = { x: 0,      y: hU - hD, z: 2 * eps };

    const nx = tZ.y * tX.z - tZ.z * tX.y;
    const ny = tZ.z * tX.x - tZ.x * tX.z;
    const nz = tZ.x * tX.y - tZ.y * tX.x;

    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  canPlaceObjectAt(position: Vector3, objectHeight: number = 0): boolean {
    const terrainHeight = this.getHeightAt(position.x, position.z);
    return position.y >= terrainHeight + objectHeight;
  }

  snapToTerrain(position: Vector3, objectHeight: number = 0): Vector3 {
    const terrainHeight = this.getHeightAt(position.x, position.z);
    return { ...position, y: terrainHeight + objectHeight };
  }

  getConfig(): TerrainConfig {
    return { ...this.config };
  }

  updateHeightMap(newHeightMap: HeightMap): void {
    this.heightMap = newHeightMap;
  }

  regenerateTerrain(): void {
    this.hashCache.clear();
    this.heightMap = this.generateDefaultHeightMap();
  }

  regenerateTerrainWithSeed(seed: number): void {
    console.log('GENWS: ', seed);
    this.config.seed = seed;
    this.seededRandom = new SeededRandom(seed);
    this.seedProfile = this.makeSeedProfile();
    this.hashCache.clear();
    this.heightMap = this.generateDefaultHeightMap();
  }

  getSeed(): number {
    return this.config.seed ?? 0;
  }

  // -----------------------------
  // Текстурні бленди (справжній шум)
  // -----------------------------
  private textureNoise(x: number, z: number): number {
    const nopt = this.config.noise ?? { scale: 0.005, octaves: 3, persistence: 0.5, lacunarity: 2.0 };
    const saved = this.config.noise;

    // трохи інші параметри для різноманіття
    this.config.noise = {
      ...nopt,
      scale: nopt.scale * 1.7,
      octaves: Math.max(2, (nopt.octaves | 0) - 1),
    };

    // важливо: використовуємо ТІ Ж доменні трансформації, що й висота
    const sp = this.seedProfile;
    const cosr = Math.cos(sp.rot), sinr = Math.sin(sp.rot);
    const dx = x + sp.offX;
    const dz = z + sp.offZ;
    const rx =  dx * cosr - dz * sinr;
    const rz =  dx * sinr + dz * cosr;
    const wx = this.valueNoise2D(rx * sp.warpFreq, rz * sp.warpFreq) * 2 - 1;
    const wz = this.valueNoise2D((rx + 37.1) * sp.warpFreq, (rz - 19.3) * sp.warpFreq) * 2 - 1;
    const tx = rx + wx * sp.warpAmp;
    const tz = rz + wz * sp.warpAmp;

    const n = this.fbmTransformed(tx, tz);
    this.config.noise = saved;
    return n; // [0..1]
  }

  getTextureBlend(x: number, z: number, textureName: string): number {
    const { textures } = this.config;
    if (!textures || !textures[textureName]) return 0;

    const entries = Object.entries(textures);
    const total = entries.reduce((s, [, t]) => s + t.weight, 0) || 1;

    const n = this.textureNoise(x, z) * total;

    let acc = 0;
    for (const [name, t] of entries) {
      const next = acc + t.weight;
      if (n >= acc && n < next) {
        return name === textureName ? (t.weight / total) : 0;
      }
      acc = next;
    }
    return 0;
  }

  getAllTextureBlends(x: number, z: number): { [key: string]: number } {
    const { textures } = this.config;
    if (!textures) return {};
    const out: Record<string, number> = {};
    let sum = 0;
    for (const key of Object.keys(textures)) {
      const v = this.getTextureBlend(x, z, key);
      out[key] = v;
      sum += v;
    }
    if (sum > 0) {
      for (const k of Object.keys(out)) out[k] /= sum;
    }
    return out;
  }
}
