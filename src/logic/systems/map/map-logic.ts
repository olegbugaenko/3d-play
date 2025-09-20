import { SceneLogic } from '@scene/scene-logic';
import { TCameraProps } from '@shared/types/camera.types';
import { TSceneObject } from '@scene/scene.types';
import { DynamicsLogic } from '@scene/dynamics-logic';
import { MAP_CONFIG } from './map-config';
import { ResourceManager } from '@resources/ResourceManager';
import { CommandSystem } from '@commands/CommandSystem';
import { SelectionLogic } from '@scene/selection/SelectionLogic';
import { CommandGroupSystem } from '@commands/CommandGroupSystem';
import { AutoGroupMonitor } from '@commands/AutoGroupMonitor';
import { CommandGroupContext } from '@commands/command-group.types';
import { SeededRandom } from './seeded-random';
import { MapGenerationTracker } from './map-generation-state';
import { SaveLoadManager, MapLogicSaveData } from '@save-load/save-load.types';
import { DroneManager } from '@drones/DroneManager';
import { BuildingsManager } from '@buildings/BuildingsManager';
import { UpgradesManager } from '@upgrades/UpgradesManager';
import { EnvironmentLogic } from '@systems/environment/EnvironmentLogic';
import { Logger } from '@shared/ErrorService';
import { Result, success, failure, match } from '@shared/Result';

/**
 * Lightweight 2D spatial hash for circle queries (cluster separation)
 */
class SpatialHash2D {
  private cellSize: number;
  private map = new Map<string, Array<{ x: number; z: number; r: number; tag: string }>>();
  constructor(cellSize: number) { this.cellSize = Math.max(0.001, cellSize); }
  private key(i: number, j: number) { return `${i},${j}`; }
  private cell(x: number, z: number) {
    return { i: Math.floor(x / this.cellSize), j: Math.floor(z / this.cellSize) };
  }
  insert(x: number, z: number, r: number, tag: string) {
    const { i, j } = this.cell(x, z);
    const k = this.key(i, j);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k)!.push({ x, z, r, tag });
  }
  overlaps(x: number, z: number, r: number, allowTags: string[], extraMargin = 0): boolean {
    const { i, j } = this.cell(x, z);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const list = this.map.get(this.key(i + di, j + dj));
        if (!list) continue;
        for (const c of list) {
          if (allowTags.length && !allowTags.includes(c.tag)) continue;
          const dx = x - c.x, dz = z - c.z;
          const rr = r + c.r + extraMargin;
          if (dx * dx + dz * dz < rr * rr) return true;
        }
      }
    }
    return false;
  }
}

export class MapLogic implements SaveLoadManager {
  public commandSystem!: CommandSystem;
  public selection: SelectionLogic;
  public commandGroupSystem!: CommandGroupSystem;
  public autoGroupMonitor: AutoGroupMonitor;
  private generatedSeed!: number;

  private collectedRocks: Set<string>;
  private collectedBiomass: Set<string>;

  // Setter-injected dependencies (замість constructor)
  public resources!: ResourceManager;
  public upgradesManager!: UpgradesManager;
  public buildingsManager!: BuildingsManager;
  public droneManager!: DroneManager;
  public environment!: EnvironmentLogic;

  // Система детермінованої генерації
  private generationTracker!: MapGenerationTracker;

  // NEW: index for non-overlapping cluster placement (rocks/biomass)
  private clusterIndex: SpatialHash2D | null = null;

  // Система автоматичної генерації хмар
  private cloudGenerationTimer: number = 0;
  private cloudGenerationInterval: number = 60000; // 60 секунд
  private activeClouds: Map<string, { createdAt: number; ttl: number }> = new Map();

  // Config for minimal edge-to-edge gap between clusters
  private static readonly CLUSTER_MARGIN = 1.0; // meters

  constructor(
    public scene: SceneLogic,
    public dynamics: DynamicsLogic
  ) {
    this.selection = new SelectionLogic(this.scene);
    this.autoGroupMonitor = new AutoGroupMonitor(this);
    this.collectedRocks = new Set();
    this.collectedBiomass = new Set();
    this.environment = new EnvironmentLogic();
  }

  setCommandSystems(commandSystem: CommandSystem, commandGroupSystem: CommandGroupSystem) {
    this.commandSystem = commandSystem;
    this.commandGroupSystem = commandGroupSystem;
  }

  setGameObjectManagers(
    droneManager: DroneManager,
    buildingsManager: BuildingsManager
  ): void {
    this.droneManager = droneManager;
    this.buildingsManager = buildingsManager;
  }

  setUpgradesManager(upgradesManager: UpgradesManager): void {
    this.upgradesManager = upgradesManager;
  }

  setResourceManager(resources: ResourceManager): void {
    this.resources = resources;
  }

  validateDependencies(): { isValid: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!this.scene) missing.push('scene');
    if (!this.dynamics) missing.push('dynamics');
    if (!this.droneManager) missing.push('droneManager');
    if (!this.buildingsManager) missing.push('buildingsManager');
    if (!this.upgradesManager) missing.push('upgradesManager');
    if (!this.resources) missing.push('resources');
    if (!this.commandSystem) missing.push('commandSystem');
    if (!this.commandGroupSystem) missing.push('commandGroupSystem');
    return { isValid: missing.length === 0, missing };
  }

  public collectRock(rockId: string): void {
    this.collectedRocks.add(rockId);
    this.scene.removeObject(rockId);
  }
  public collectBiomass(biomassId: string): void {
    this.collectedBiomass.add(biomassId);
    this.scene.removeObject(biomassId);
  }

  initializeSeeded(cameraProps?: TCameraProps): void {
    if (cameraProps) {
      this.scene.initializeViewport(cameraProps, {
        x: MAP_CONFIG.width,
        y: MAP_CONFIG.height,
        z: MAP_CONFIG.depth,
      });
    }

    this.generateTerrain();
    this.scene.postponedRegeneration = true;

    this.generateBoulders();

    // Build spatial index for cluster separation BEFORE generating clusters
    const maxClusterR = Math.max(
      MAP_CONFIG.generation.rocks.clusterRadius.max,
      MAP_CONFIG.generation.biomass.clusterRadius.max
    );
    this.clusterIndex = new SpatialHash2D(maxClusterR + MapLogic.CLUSTER_MARGIN);

    // Generate rock clusters first, record their circles into index
    this.generateRocks();
    // Then biomass clusters that avoid rock circles with a 1 m margin
    this.generateBiomass();

    this.generateClouds();
    this.scene.rebuildObstacles(true);
  }

  initializeBaseMap(cameraProps?: TCameraProps): void {
    if (cameraProps) {
      this.scene.initializeViewport(cameraProps, {
        x: MAP_CONFIG.width,
        y: MAP_CONFIG.height,
        z: MAP_CONFIG.depth,
      });
    }
  }

  newGame(): void {
    const seed = Date.now();
    this.updateGenerationSeed(seed);
    this.initializeSeeded();
    this.droneManager.newGameDrones();
    this.buildingsManager.newGameBuildings();
  }

  private generateTerrain() {
    const seed = this.generationTracker.getSeed();
    const terrainManager = this.scene.getTerrainManager();
    if (!terrainManager) {
      Logger.warn('MapLogic', 'TerrainManager не знайдено, створюємо новий');
      return;
    }
    terrainManager.regenerateTerrainWithSeed(seed);
  }

  private generateBoulders() {
    const boulderCount = MAP_CONFIG.generation.boulders.count;
    const mapBounds = {
      minX: -MAP_CONFIG.width / 2,
      maxX: MAP_CONFIG.width / 2,
      minZ: -MAP_CONFIG.depth / 2,
      maxZ: MAP_CONFIG.depth / 2,
    };
    const boulderRng = new SeededRandom(this.generationTracker.getSeed() + 1000);
    for (let i = 0; i < boulderCount; i++) {
      const x = mapBounds.minX + boulderRng.nextFloat(0, mapBounds.maxX - mapBounds.minX);
      const z = mapBounds.minZ + boulderRng.nextFloat(0, mapBounds.maxZ - mapBounds.minZ);
      if (this.isPositionTooCloseToBoulders(x, z)) continue;
      const size =
        MAP_CONFIG.generation.boulders.sizeRange.min +
        boulderRng.nextFloat(
          0,
          MAP_CONFIG.generation.boulders.sizeRange.max -
            MAP_CONFIG.generation.boulders.sizeRange.min
        );
      const colors = [0x8b7355, 0x696969, 0x808080, 0xa0522d, 0x8b4513];
      const color = boulderRng.nextColor(colors);
      const roughness = 0.2 + boulderRng.nextFloat(0, 0.4);
      const boulder: TSceneObject = {
        id: `boulder_${i}`,
        type: 'boulder',
        coordinates: { x, y: 0, z },
        scale: { x: size, y: size, z: size },
        rotation: {
          x: boulderRng.nextFloat(0, Math.PI),
          y: boulderRng.nextFloat(0, Math.PI),
          z: boulderRng.nextFloat(0, Math.PI),
        },
        data: { color, size, roughness, modelPath: this.getRandomModelPath(boulderRng) },
        obstacleSize: size,
        tags: ['on-ground', 'static', 'boulder'],
        bottomAnchor: -0.2,
        terrainAlign: false,
      };
      this.scene.pushObjectWithTerrainConstraint(boulder);
    }
  }

  private isPositionTooCloseToBoulders(x: number, z: number): boolean {
    const minDistance = MAP_CONFIG.generation.boulders.minDistance;
    const allObjects = Object.values(this.scene.getObjects());
    const boulderObjects = allObjects.filter((obj: TSceneObject) => obj.type === 'boulder');
    for (const boulder of boulderObjects) {
      const distance = Math.hypot(x - boulder.coordinates.x, z - boulder.coordinates.z);
      if (distance < minDistance) return true;
    }
    return false;
  }

  private getRandomModelPath(rng: SeededRandom): string {
    const rand = rng.next();
    if (rand < 0.33) return '/models/stone2.glb';
    if (rand < 0.66) return '/models/stone3.glb';
    return '/models/stone4.glb';
  }

  public updateGenerationSeed(newSeed: number): void {
    this.generationTracker = new MapGenerationTracker(newSeed);
    this.generatedSeed = newSeed;
  }

  public getGenerationSeed(): number { return this.generationTracker.getSeed(); }

  /**
   * ROCK CLUSTERS with spatial-hash registration
   */
  private generateRocks() {
    const mapBounds = {
      minX: -MAP_CONFIG.width / 2,
      maxX: MAP_CONFIG.width / 2,
      minZ: -MAP_CONFIG.depth / 2,
      maxZ: MAP_CONFIG.depth / 2,
    };
    const clusterCount = MAP_CONFIG.generation.rocks.clusterCount;
    const rocksPerCluster = MAP_CONFIG.generation.rocks.rocksPerCluster;
    const minOriginR = 15;
    const requiredInBand = Math.min(2, clusterCount);
    const bandMax = 25;
    const minInterClusterDist = 12;
    const maxTriesPerPoint = 200;
    const rockRng = new SeededRandom(this.generationTracker.getSeed() + 2000);
    const dist2 = (x: number, z: number) => x * x + z * z;
    const withinBounds = (x: number, z: number) =>
      x >= mapBounds.minX && x <= mapBounds.maxX && z >= mapBounds.minZ && z <= mapBounds.maxZ;

    const sampleWithConstraints = (
      existing: Array<{ x: number; z: number }>,
      minR: number,
      maxR?: number,
      localMinInterClusterDist = minInterClusterDist
    ): { x: number; z: number } | null => {
      let inter = localMinInterClusterDist;
      for (let phase = 0; phase < 3; phase++) {
        for (let t = 0; t < maxTriesPerPoint; t++) {
          const x = mapBounds.minX + rockRng.nextFloat(0, mapBounds.maxX - mapBounds.minX);
          const z = mapBounds.minZ + rockRng.nextFloat(0, mapBounds.maxZ - mapBounds.minZ);
          const d2 = dist2(x, z);
          if (d2 < minR * minR) continue;
          if (maxR !== undefined && d2 > maxR * maxR) continue;
          let ok = true;
          for (let i = 0; i < existing.length; i++) {
            const dx = x - existing[i].x,
              dz = z - existing[i].z;
            if (dx * dx + dz * dz < inter * inter) { ok = false; break; }
          }
          if (!ok) continue;
          if (!withinBounds(x, z)) continue;
          return { x, z };
        }
        inter *= 0.85;
      }
      const a = rockRng.nextFloat(0, Math.PI * 2);
      const r = maxR !== undefined ? Math.min(maxR, Math.max(minR, inter)) : Math.max(minR, inter);
      let x = Math.cos(a) * r;
      let z = Math.sin(a) * r;
      if (!withinBounds(x, z)) {
        x = Math.min(Math.max(x, mapBounds.minX), mapBounds.maxX);
        z = Math.min(Math.max(z, mapBounds.minZ), mapBounds.maxZ);
      }
      for (let i = 0; i < existing.length; i++) {
        const dx = x - existing[i].x,
          dz = z - existing[i].z;
        if (dx * dx + dz * dz < inter * inter * 0.8) {
          const len = Math.hypot(x, z) || 1;
          const s = (r + inter * 0.2) / len;
          x = x * s;
          z = z * s;
          break;
        }
      }
      return { x, z };
    };

    const centers: Array<{ x: number; z: number; resourceType: 'stone' | 'ore'; r: number }> = [];

    // first guarantee band centers
    for (let i = 0; i < requiredInBand; i++) {
      const p = sampleWithConstraints(centers, minOriginR, bandMax) || { x: 0, z: bandMax };
      const r =
        MAP_CONFIG.generation.rocks.clusterRadius.min +
        rockRng.nextFloat(
          0,
          MAP_CONFIG.generation.rocks.clusterRadius.max -
            MAP_CONFIG.generation.rocks.clusterRadius.min
        );
      const resourceType: 'stone' | 'ore' =
        MAP_CONFIG.generation.rocks.resourceTypes[i % MAP_CONFIG.generation.rocks.resourceTypes.length];
      centers.push({ x: p.x, z: p.z, resourceType, r });
      // register circle into index (rock)
      if (this.clusterIndex) this.clusterIndex.insert(p.x, p.z, r, 'rock');
    }

    // rest anywhere with r>=minOriginR
    for (let i = requiredInBand; i < clusterCount; i++) {
      const p = sampleWithConstraints(centers, minOriginR) || { x: minOriginR, z: 0 };
      const r =
        MAP_CONFIG.generation.rocks.clusterRadius.min +
        rockRng.nextFloat(
          0,
          MAP_CONFIG.generation.rocks.clusterRadius.max -
            MAP_CONFIG.generation.rocks.clusterRadius.min
        );
      const resourceType: 'stone' | 'ore' =
        MAP_CONFIG.generation.rocks.resourceTypes[i % MAP_CONFIG.generation.rocks.resourceTypes.length];
      centers.push({ x: p.x, z: p.z, resourceType, r });
      if (this.clusterIndex) this.clusterIndex.insert(p.x, p.z, r, 'rock');
    }

    // spawn rocks in clusters
    for (let cluster = 0; cluster < clusterCount; cluster++) {
      const { x: clusterCenterX, z: clusterCenterZ, resourceType, r: clusterRadius } = centers[cluster];
      const resourceColors =
        resourceType === 'stone'
          ? [0x8b8355, 0x696969, 0x808080, 0xa0a29d, 0x8b7563]
          : [0x8b4513, 0x654321, 0x8b6914, 0x6b4423, 0x654321];
      const rockRngLocal = rockRng; // reuse
      const dist2local = dist2;
      for (let j = 0; j < rocksPerCluster; j++) {
        if (this.generationTracker.isResourceCollected(cluster, j)) continue;
        let x = 0,
          z = 0,
          placed = false;
        for (let t = 0; t < 20; t++) {
          const a = rockRngLocal.nextFloat(0, Math.PI * 2);
          const d = rockRngLocal.nextFloat(0, clusterRadius);
          x = clusterCenterX + Math.cos(a) * d;
          z = clusterCenterZ + Math.sin(a) * d;
          if (dist2local(x, z) >= minOriginR * minOriginR) { placed = true; break; }
        }
        if (!placed) {
          const len = Math.hypot(clusterCenterX, clusterCenterZ) || 1;
          const s = minOriginR / len;
          x = clusterCenterX * s;
          z = clusterCenterZ * s;
        }
        const baseSize = 0.3 + rockRngLocal.nextFloat(0, 0.2);
        const color = rockRngLocal.nextColor(resourceColors);
        const smoothness = 0.6 + rockRngLocal.nextFloat(0, 0.3);
        const rock: TSceneObject = {
          id: `rock_${cluster}_${j}`,
          type: 'rock',
          coordinates: { x, y: 0, z },
          scale: { x: baseSize, y: baseSize, z: baseSize },
          rotation: {
            x: rockRngLocal.nextFloat(0, Math.PI),
            y: rockRngLocal.nextFloat(0, Math.PI),
            z: rockRngLocal.nextFloat(0, Math.PI),
          },
          obstacleSize: baseSize * 0.5,
          data: {
            color,
            size: baseSize,
            smoothness,
            resourceId: resourceType,
            resourceAmount: 14 + rockRngLocal.nextInt(0, 16),
            modelPath: this.getRandomModelPath(rockRngLocal),
          },
          tags: ['on-ground', 'static', 'rock', 'resource'],
          bottomAnchor: -baseSize * 0.3,
          terrainAlign: true,
          targetType: ['collect-resource'],
        };
        this.scene.pushObjectWithTerrainConstraint(rock);
      }
    }
  }

  /**
   * BIOMASS CLUSTERS that avoid rock clusters with 1m edge gap
   */
  private generateBiomass() {
    const mapBounds = {
      minX: -MAP_CONFIG.width / 2,
      maxX: MAP_CONFIG.width / 2,
      minZ: -MAP_CONFIG.depth / 2,
      maxZ: MAP_CONFIG.depth / 2,
    };

    const clusterCount = MAP_CONFIG.generation.biomass.clusterCount;
    const biomassPerCluster = MAP_CONFIG.generation.biomass.biomassPerCluster;
    const minOriginR = 15;
    const requiredInBand = Math.min(2, clusterCount);
    const bandMax = 25;
    const minInterClusterDist = 12;
    const maxTriesPerPoint = 200;

    const biomassRng = new SeededRandom(this.generationTracker.getSeed() + 3000);

    const dist2 = (x: number, z: number) => x * x + z * z;
    const withinBounds = (x: number, z: number) =>
      x >= mapBounds.minX && x <= mapBounds.maxX && z >= mapBounds.minZ && z <= mapBounds.maxZ;

    const sampleWithConstraints = (
      existing: Array<{ x: number; z: number }>,
      minR: number,
      maxR?: number,
      localMinInterClusterDist = minInterClusterDist
    ): { x: number; z: number } | null => {
      let inter = localMinInterClusterDist;
      for (let phase = 0; phase < 3; phase++) {
        for (let t = 0; t < maxTriesPerPoint; t++) {
          const x = mapBounds.minX + biomassRng.nextFloat(0, mapBounds.maxX - mapBounds.minX);
          const z = mapBounds.minZ + biomassRng.nextFloat(0, mapBounds.maxZ - mapBounds.minZ);
          const d2 = dist2(x, z);
          if (d2 < minR * minR) continue;
          if (maxR !== undefined && d2 > maxR * maxR) continue;
          let ok = true;
          for (let i = 0; i < existing.length; i++) {
            const dx = x - existing[i].x,
              dz = z - existing[i].z;
            if (dx * dx + dz * dz < inter * inter) { ok = false; break; }
          }
          if (!ok) continue;
          if (!withinBounds(x, z)) continue;
          return { x, z };
        }
        inter *= 0.85;
      }
      const a = biomassRng.nextFloat(0, Math.PI * 2);
      const r = maxR !== undefined ? Math.min(maxR, Math.max(minR, inter)) : Math.max(minR, inter);
      let x = Math.cos(a) * r;
      let z = Math.sin(a) * r;
      if (!withinBounds(x, z)) {
        x = Math.min(Math.max(x, mapBounds.minX), mapBounds.maxX);
        z = Math.min(Math.max(z, mapBounds.minZ), mapBounds.maxZ);
      }
      for (let i = 0; i < existing.length; i++) {
        const dx = x - existing[i].x,
          dz = z - existing[i].z;
        if (dx * dx + dz * dz < inter * inter * 0.8) {
          const len = Math.hypot(x, z) || 1;
          const s = (r + inter * 0.2) / len;
          x = x * s;
          z = z * s;
          break;
        }
      }
      return { x, z };
    };

    // centers with radii chosen *before* registering/validating vs rocks
    const centers: Array<{ x: number; z: number; resourceType: 'biomass'; r: number }> = [];

    const pickRadius = () =>
      MAP_CONFIG.generation.biomass.clusterRadius.min +
      biomassRng.nextFloat(
        0,
        MAP_CONFIG.generation.biomass.clusterRadius.max -
          MAP_CONFIG.generation.biomass.clusterRadius.min
      );

    const tryPlaceBiomCenter = (
      existingCenters: Array<{ x: number; z: number; r: number }>,
      minR: number,
      maxR?: number
    ): { x: number; z: number; r: number } | null => {
      for (let tries = 0; tries < 64; tries++) {
        const p = sampleWithConstraints(existingCenters.map(c => ({ x: c.x, z: c.z })), minR, maxR);
        if (!p) continue;
        const r = pickRadius();
        // ROCK avoidance via clusterIndex
        if (
          this.clusterIndex &&
          this.clusterIndex.overlaps(p.x, p.z, r, ['rock'], MapLogic.CLUSTER_MARGIN)
        ) {
          continue; // try another position
        }
        return { x: p.x, z: p.z, r };
      }
      return null;
    };

    // 1) place some centers in the band [15..25]
    for (let i = 0; i < requiredInBand; i++) {
      const c = tryPlaceBiomCenter(centers, minOriginR, bandMax) || { x: 0, z: bandMax, r: pickRadius() };
      centers.push({ x: c.x, z: c.z, r: c.r, resourceType: 'biomass' });
      if (this.clusterIndex) this.clusterIndex.insert(c.x, c.z, c.r, 'biomass');
    }
    // 2) rest anywhere with r >= 15, still avoiding rocks
    for (let i = requiredInBand; i < clusterCount; i++) {
      const c = tryPlaceBiomCenter(centers, minOriginR) || { x: minOriginR, z: 0, r: pickRadius() };
      centers.push({ x: c.x, z: c.z, r: c.r, resourceType: 'biomass' });
      if (this.clusterIndex) this.clusterIndex.insert(c.x, c.z, c.r, 'biomass');
    }

    // spawn biomass within clusters
    for (let cluster = 0; cluster < clusterCount; cluster++) {
      const { x: clusterCenterX, z: clusterCenterZ, r: clusterRadius } = centers[cluster];
      for (let j = 0; j < biomassPerCluster; j++) {
        if (this.generationTracker.isResourceCollected(cluster, j)) continue;
        let x = 0,
          z = 0,
          placed = false;
        for (let t = 0; t < 20; t++) {
          const a = biomassRng.nextFloat(0, Math.PI * 2);
          const d = biomassRng.nextFloat(0, clusterRadius);
          x = clusterCenterX + Math.cos(a) * d;
          z = clusterCenterZ + Math.sin(a) * d;
          if (dist2(x, z) >= minOriginR * minOriginR) { placed = true; break; }
        }
        if (!placed) {
          const len = Math.hypot(clusterCenterX, clusterCenterZ) || 1;
          const s = minOriginR / len;
          x = clusterCenterX * s;
          z = clusterCenterZ * s;
        }
        const baseSize = 0.8 + biomassRng.nextFloat(0, 0.4);
        const biomass: TSceneObject = {
          id: `biomass_${cluster}_${j}`,
          type: 'biomass',
          coordinates: { x, y: 0, z },
          scale: { x: baseSize, y: baseSize, z: baseSize },
          rotation: {
            x: biomassRng.nextFloat(0, Math.PI * 0.1),
            y: biomassRng.nextFloat(0, Math.PI * 2),
            z: biomassRng.nextFloat(0, Math.PI * 0.1),
          },
          obstacleSize: baseSize * 0.3,
          data: {
            resourceId: 'biomass',
            resourceAmount: 8 + biomassRng.nextInt(0, 12),
            modelPath: this.getRandomBiomassModelPath(biomassRng),
          },
          tags: ['on-ground', 'static', 'biomass', 'resource'],
          bottomAnchor: -baseSize * 0.1,
          terrainAlign: true,
          targetType: ['collect-resource'],
        };
        this.scene.pushObjectWithTerrainConstraint(biomass);
      }
    }
  }

  public static readonly BIOMASS_MODELS = [
    '/models/resources/biomass_01.glb',
    '/models/resources/biomass_02.glb',
    '/models/resources/biomass_03.glb',
  ];
  private getRandomBiomassModelPath(rng: SeededRandom): string {
    const rand = rng.next();
    const index = Math.floor(rand * MapLogic.BIOMASS_MODELS.length);
    return MapLogic.BIOMASS_MODELS[index];
  }

  private lastExplosionTime = 0;
  private explosionInterval = 3000;

  tick(dT: number) {
    this.droneManager.tick(dT);
    this.commandSystem.update(dT);
    this.commandGroupSystem.update(dT);
    this.autoGroupMonitor.update(dT);
    this.dynamics.moveObjects(dT);
    this.updateClouds(dT); // Оновлюємо систему хмар
    this.updateEnvironment(); // Оновлюємо environment ефекти (полярне сяйво)
    const currentTime = performance.now();
    if (currentTime - this.lastExplosionTime >= this.explosionInterval) {
      this.lastExplosionTime = currentTime;
    }
  }

  public distributeTargetsForObjects(
    objectIds: string[],
    centerPoint: { x: number; y: number; z: number }
  ) {
    const dynamicObjects = objectIds
      .map((id) => this.scene.getObjectById(id))
      .filter((obj) => obj && obj.tags?.includes('dynamic')) as TSceneObject[];
    if (dynamicObjects.length === 0) return;
    if (dynamicObjects.length === 1) {
      const obj = dynamicObjects[0];
      this.addMoveCommand(obj.id, { x: centerPoint.x, y: centerPoint.y, z: centerPoint.z });
      return;
    }
    const radius = Math.min(dynamicObjects.length * 0.8, 10);
    const angleStep = (2 * Math.PI) / dynamicObjects.length;
    dynamicObjects.forEach((obj, index) => {
      const angle = index * angleStep;
      const targetX = centerPoint.x + Math.cos(angle) * radius;
      const targetZ = centerPoint.z + Math.sin(angle) * radius;
      this.addMoveCommand(obj.id, { x: targetX, y: centerPoint.y, z: targetZ });
    });
  }

  public handleRightclickCommand(
    objectIds: string[],
    centerPoint: { x: number; y: number; z: number },
    commandGroup?: any
  ) {
    objectIds.forEach((unitId: string) => {
      this.commandSystem.clearCommands(unitId);
      const activeGroups = this.commandGroupSystem.getActiveGroupsForObject(unitId);
      if (activeGroups && activeGroups.length > 0) {
        activeGroups.forEach((groupState: any) => {
          this.commandGroupSystem.cancelCommandGroup(unitId, groupState.groupId);
        });
      }
    });

    if (!commandGroup) {
      this.distributeTargetsForObjects(objectIds, centerPoint);
      return;
    }

    let resourceType = 'resource';
    if (commandGroup.id === 'gather-stone-radius' || commandGroup.ui?.category === 'stone') resourceType = 'stone';
    else if (commandGroup.id === 'gather-ore-radius' || commandGroup.ui?.category === 'ore') resourceType = 'ore';
    else if (commandGroup.id === 'gather-biomass-radius' || commandGroup.ui?.category === 'biomass') resourceType = 'biomass';
    else if (commandGroup.ui?.category === 'all') resourceType = 'resource';

    objectIds.forEach((unitId: string) => {
      const context = {
        objectId: unitId,
        targets: { center: centerPoint, resource: undefined, base: undefined },
        parameters: { resourceType },
      };
      const ok = this.commandGroupSystem.addCommandGroup(unitId, commandGroup.id, context);
      if (!ok) Logger.error('MapLogic', `Failed to start command ${commandGroup.id} for ${unitId}`, { unitId, commandGroup });
    });
  }

  private addMoveCommand(objectId: string, target: { x: number; y: number; z: number }) {
    const command = {
      id: `move_${objectId}_${Date.now()}`,
      type: 'move-to' as const,
      position: target,
      parameters: {},
      status: 'pending' as const,
      priority: 1,
      createdAt: Date.now(),
    };
    this.commandSystem.addCommand(objectId, command);
  }

  private generateClouds() {
    const cloudCount = 2;
    for (let i = 0; i < cloudCount; i++) {
      const x = (Math.random() - 0.5) * 150;
      const z = (Math.random() - 0.5) * 150;
      const cloud: TSceneObject = {
        id: `dust_cloud_${i}`,
        type: 'cloud',
        coordinates: { x, y: 0, z },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        speed: { x: (Math.random() - 0.5) * 1.5, y: 0, z: (Math.random() - 0.5) * 1.5 },
        data: {
          size: 21 + Math.random() * 22,
          color: 0xd2b46c,
          particleCount: 200,
          windSpeed: 0.3 + Math.random() * 0.7,
          height: 4 + Math.random() * 8,
        },
        tags: ['on-ground', 'dust', 'dynamic'],
        bottomAnchor: -1,
        terrainAlign: false,
      };
      this.scene.pushObjectWithTerrainConstraint(cloud);
    }
  }

  /** Mining / Charging **/
  mineResource(resourceId: string, selectedObjectIds: string[]): void {
    if (selectedObjectIds.length === 0) { Logger.warn('MapLogic', 'No objects selected for mining'); return; }
    const resource = this.scene.getObjectById(resourceId);
    if (!resource) { Logger.error('MapLogic', `Resource ${resourceId} not found`, { resourceId }); return; }
    const miners = selectedObjectIds.filter((id) => {
      const obj = this.scene.getObjectById(id);
      return obj && obj.commandType && obj.commandType.includes('collect-resource');
    });
    if (miners.length === 0) { Logger.warn('MapLogic', 'No valid miners selected'); return; }
    miners.forEach((minerId) => {
      this.commandGroupSystem.interruptObjectCommands(minerId);
      const context: CommandGroupContext = { objectId: minerId, targets: { resource: resourceId }, parameters: { amount: 100 } };
      const ok = this.commandGroupSystem.addCommandGroup(minerId, 'collect-resource', context);
      if (!ok) Logger.error('MapLogic', `Failed to start mining command group for ${minerId}`, { minerId });
    });
  }

  chargeObject(selectedObjectIds: string[]): void {
    if (selectedObjectIds.length === 0) { Logger.warn('MapLogic', 'No objects selected for charging'); return; }
    const chargeableObjects = selectedObjectIds.filter((id) => {
      const obj = this.scene.getObjectById(id);
      return obj && obj.commandType && obj.commandType.includes('charge');
    });
    if (chargeableObjects.length === 0) { Logger.warn('MapLogic', 'No valid chargeable objects selected'); return; }
    chargeableObjects.forEach((objectId) => {
      this.commandGroupSystem.interruptObjectCommands(objectId);
      const context: CommandGroupContext = { objectId, targets: {}, parameters: {} };
      const ok = this.commandGroupSystem.addCommandGroup(objectId, 'charge-group', context);
      if (!ok) Logger.error('MapLogic', `Failed to start charging command group for ${objectId}`, { objectId });
    });
  }

  // ==================== SaveLoadManager ====================
  save(): MapLogicSaveData {
    const collectedRocks: string[] = Array.from(this.collectedRocks);
    return { seed: this.generatedSeed, collectedRocks };
  }
  load(data: MapLogicSaveData): void {
    if (data.seed) {
      this.generatedSeed = data.seed;
      this.generationTracker = new MapGenerationTracker(data.seed);
      this.initializeSeeded();
    }
    if (data.collectedRocks) {
      let rockIds: string[];
      if (Array.isArray(data.collectedRocks)) rockIds = data.collectedRocks;
      else if (data.collectedRocks && typeof data.collectedRocks === 'object' && 'add' in (data.collectedRocks as any)) {
        rockIds = Array.from(data.collectedRocks as Set<string>);
      } else {
        rockIds = Object.values(data.collectedRocks as Record<string, string>);
      }
      rockIds.forEach((rockId) => this.collectRock(rockId));
    }
  }

  reset(): void {
    this.generationTracker.reset();
    this.collectedRocks.clear();
    this.clearBuildings();
    this.droneManager.reset();
  }

  private clearBuildings(): void {
    const buildings = Object.values(this.scene.getObjects()).filter((obj) => obj.tags.includes('building'));
    buildings.forEach((b) => this.scene.removeObject(b.id));
  }

  getObjectByIdResult(id: string): Result<TSceneObject<any>, string> {
    const object = this.scene.getObjectById(id);
    if (!object) return failure(`Object with id '${id}' not found`);
    return success(object);
  }

  startCommandResult(commandId: string, unitId: string): Result<boolean, string> {
    const unitResult = this.getObjectByIdResult(unitId);
    return unitResult.flatMap((unit) => {
      if (!unit.tags.includes('drone')) return failure(`Unit ${unitId} is not a drone`);
      const commandSuccess = true;
      if (!commandSuccess) return failure(`Failed to start command ${commandId} for ${unitId}`);
      return success(true);
    });
  }

  processCommandWithMatch(commandId: string, unitId: string): string {
    const result = this.startCommandResult(commandId, unitId);
    return match(
      result,
      () => `Command ${commandId} started successfully for ${unitId}`,
      (error) => `Failed to start command: ${error}`
    );
  }

  // ==================== Система автоматичної генерації хмар ====================

  /**
   * Генерує нову хмару на карті
   */
  private generateDynamicCloud(): void {
    const cloudId = `dynamic_cloud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = Date.now();
    const ttl = 60000; // 60 секунд TTL

    // Генеруємо випадкові координати в межах карти
    const mapWidth = MAP_CONFIG.width;
    const mapDepth = MAP_CONFIG.depth;
    const x = (Math.random() - 0.5) * mapWidth;
    const z = (Math.random() - 0.5) * mapDepth;

    // Створюємо об'єкт хмари
    const cloud: TSceneObject = {
      id: cloudId,
      type: 'cloud',
      coordinates: { x, y: 0, z },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      speed: { 
        x: (Math.random() - 0.5) * 1.5, 
        y: 0, 
        z: (Math.random() - 0.5) * 1.5 
      },
      data: {
        size: 21 + Math.random() * 22,
        color: 0xd2b46c,
        particleCount: 200,
        windSpeed: 0.3 + Math.random() * 0.7,
        height: 4 + Math.random() * 8,
        createdAt: createdAt,
        ttl: ttl,
        fadeStartTime: 45000 // Початок згасання за 15 секунд до завершення
      },
      tags: ['on-ground', 'dust', 'dynamic'],
      bottomAnchor: -1,
      terrainAlign: false,
    };

    // Додаємо хмару до сцени
    this.scene.pushObjectWithTerrainConstraint(cloud);
    
    // Записуємо в активні хмари для відстеження TTL
    this.activeClouds.set(cloudId, { createdAt, ttl });

    console.log(`Generated dynamic cloud ${cloudId} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }

  /**
   * Оновлює стан всіх активних хмар (TTL та згасання)
   */
  private updateClouds(deltaTime: number): void {
    const now = Date.now();
    const cloudsToRemove: string[] = [];

    // Оновлюємо таймер генерації
    this.cloudGenerationTimer += deltaTime;
    if (this.cloudGenerationTimer >= this.cloudGenerationInterval) {
      this.generateDynamicCloud();
      this.cloudGenerationTimer = 0;
    }

    // Перевіряємо всі активні хмари
    for (const [cloudId, cloudData] of this.activeClouds) {
      const age = now - cloudData.createdAt;
      
      // Якщо час життя закінчився - видаляємо хмару
      if (age >= cloudData.ttl) {
        this.scene.removeObject(cloudId);
        cloudsToRemove.push(cloudId);
        continue;
      }

      // Якщо почався період згасання - зменшуємо прозорість
      const fadeStartTime = 45000; // 15 секунд до завершення
      if (age >= fadeStartTime) {
        const fadeProgress = (age - fadeStartTime) / (cloudData.ttl - fadeStartTime);
        const opacity = Math.max(0, 1 - fadeProgress);
        
        // Оновлюємо прозорість хмари
        const cloud = this.scene.getObjectById(cloudId);
        if (cloud && cloud.data && cloud.data.color) {
          const alpha = Math.floor(opacity * 255);
          cloud.data.color = (cloud.data.color & 0xFFFFFF) | (alpha << 24);
        }
      }
    }

    // Видаляємо хмари що закінчили життя
    for (const cloudId of cloudsToRemove) {
      this.activeClouds.delete(cloudId);
    }
  }

  /**
   * Оновлює environment ефекти (полярне сяйво, погода тощо)
   */
  public updateEnvironment(): void {
    if (this.environment) {
      this.environment.update();
    }
  }
}
