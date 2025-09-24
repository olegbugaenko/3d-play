import { SceneLogic } from '@scene/scene-logic';
import { TSceneObject } from '@scene/scene.types';
import {
  AuroraEffect,
  ColorRGB,
  EnvironmentConfig,
  EnvironmentSaveData,
  EnvironmentState,
  IEnvironmentEffect,
  SkyCloudConfig,
  SkyCloudLayerConfig,
  SkyCloudObjectData,
  SkyCloudInstance,
  SkyCloudRenderState,
  SunLightState,
  SunVisualConfig,
} from './environment.types';

/**
 * Базова конфігурація енвайронменту
 */
const DEFAULT_CONFIG: EnvironmentConfig = {
  aurora: {
    minIntensity: 0.2,
    maxIntensity: 0.5,
    minDuration: 30,
    maxDuration: 120,
    spawnChance: 0.1,
    maxActiveEffects: 3,
  },
  updateInterval: 1000,
  timeOfDay: 0,
  mapSize: {
    width: 600,
    depth: 600,
  },
  time: {
    dayLengthMinutes: 24,
    sunriseHour: 6.5,
    sunsetHour: 19.0,
    twilightDurationHours: 1,
    initialHour: 12,
    initialMinute: 0,
  },
  weather: {
    temperature: {
      min: -50,
      max: 20,
    },
    windSpeed: {
      min: 2,
      max: 18,
      changeIntervalHours: 3,
      transitionSeconds: 12,
    },
    cloudyFactor: 0.35,
  },
  dustClouds: {
    initialCount: 2,
    spawnIntervalSeconds: 60,
    ttlSeconds: 60,
    fadeDurationSeconds: 15,
    size: { min: 21, max: 43 },
    height: { min: 4, max: 12 },
    windSpeed: { min: 0.3, max: 1.0 },
    particleCount: 200,
    color: 0xd2b46c,
  },
  skyClouds: {
    initialCloudyFactor: 0.35,
    smoothingSeconds: 25,
    globalSpeedMultiplier: 0.8,
    globalWispyMultiplier: 1.0,
    globalOpacityMultiplier: 1.0,
    coverageExponent: 1.35,
    windDirectionDeg: 15,
    parallaxRange: { min: 0.7, max: 1.35 },
    cloudinessUpdateIntervalMinutes: 30,
    cloudinessVariance: 0.3,
    layers: [
      {
        id: 'stratus',
        altitude: 110,
        altitudeJitter: 18,
        maxCount: 22,
        areaMultiplier: 1.35,
        sizeRange: { min: 160, max: 260 },
        aspectRatioRange: { min: 1.4, max: 2.2 },
        opacityRange: { min: 0.35, max: 0.65 },
        speedRange: { min: 0.45, max: 0.9 },
        directionJitterDeg: 12,
        wispinessRange: { min: 0.35, max: 0.6 },
        softnessRange: { min: 0.14, max: 0.24 },
        noiseScaleRange: { min: 1.6, max: 2.4 },
        noiseStrengthRange: { min: 0.8, max: 1.3 },
        color: 0xd9d2c5,
        colorVariance: 0.12,
        coverageWeight: 1.2,
      },
      {
        id: 'cirrus',
        altitude: 165,
        altitudeJitter: 26,
        maxCount: 18,
        areaMultiplier: 1.6,
        sizeRange: { min: 200, max: 320 },
        aspectRatioRange: { min: 2.2, max: 3.4 },
        opacityRange: { min: 0.18, max: 0.38 },
        speedRange: { min: 0.9, max: 1.6 },
        directionJitterDeg: 18,
        wispinessRange: { min: 0.6, max: 0.92 },
        softnessRange: { min: 0.2, max: 0.34 },
        noiseScaleRange: { min: 2.3, max: 3.2 },
        noiseStrengthRange: { min: 0.9, max: 1.5 },
        color: 0xf3f0ea,
        colorVariance: 0.08,
        coverageWeight: 0.85,
      },
    ],
  },
  sun: {
    altitudeRangeDeg: { min: 6, max: 45 },
    azimuthOffsetDeg: -10,
    orbitRadiusMultiplier: 0.6,
    orbitFlattening: 0.45,
    discSize: 28,
    haloSize: 140,
    haloIntensity: { day: 0.55, horizon: 0.85, night: 0 },
    colorShiftExponent: 1.6,
    haloFalloffExponent: 1.4,
    colors: {
      base: 0xfff1c2,
      sunrise: 0xffa08a,
      sunset: 0xffa093,
      halo: 0xffd8a1,
    },
  },
};

type InternalSkyCloud = {
  id: string;
  layerId: string;
  position: { x: number; y: number; z: number };
  data: SkyCloudObjectData;
  despawnX: number;
  despawnZ: number;
  age: number;
  maxAge: number;
};

/**
 * Логіка управління енвайронмент-ефектами (полярне сяйво, погода, добовий цикл)
 */
export class EnvironmentLogic {
  private readonly scene: SceneLogic;
  private config: EnvironmentConfig;

  private activeEffects: Map<string, IEnvironmentEffect> = new Map();
  private lastUpdateTime = 0;
  private effectIdCounter = 0;

  private dustCloudTimer = 0;
  private dustCloudIdCounter = 0;
  private dustClouds: Map<string, { createdAt: number; ttl: number }> = new Map();

  private skyCloudIdCounter = 0;
  private skyCloudInstances: Map<string, InternalSkyCloud> = new Map();
  private skyCloudLayerCounts: Map<string, number> = new Map();
  private skyCloudSnapshot: SkyCloudInstance[] = [];
  private skyCloudSnapshotDirty = true;
  private skyCloudSpawnAccumulator = 0;
  private skyCloudTotalCap = 0;
  private nextCloudinessUpdateMinute = 0;

  private cloudyFactor = 0;
  private cloudyTarget = 0;

  private initialized = false;

  private time = {
    totalMinutes: 0,
    currentMinutes: 0,
    currentDay: 1,
  };

  private weather = {
    temperature: 0,
    windSpeed: 0,
    windTarget: 0,
    nextWindChangeMinute: 0,
    cloudyFactor: 0,
    cloudyTarget: 0,
  };

  private state: EnvironmentState;

  private readonly gameMinutesPerRealSecond: number;

  constructor(scene: SceneLogic, config?: Partial<EnvironmentConfig>) {
    this.scene = scene;
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);

    this.gameMinutesPerRealSecond = 24 / this.config.time.dayLengthMinutes;

    this.time.totalMinutes = this.config.time.initialHour * 60 + this.config.time.initialMinute;
    this.updateTimeFromTotalMinutes();

    const windRange = this.config.weather.windSpeed;
    this.weather.temperature = this.calculateTemperature();
    this.weather.windSpeed = this.randomBetween(windRange.min, windRange.max);
    this.weather.windTarget = this.weather.windSpeed;
    this.weather.nextWindChangeMinute =
      this.time.totalMinutes + windRange.changeIntervalHours * 60;

    const initialCloudiness =
      this.config.skyClouds.initialCloudyFactor ?? this.config.weather.cloudyFactor ?? 0;
    const clampedCloudiness = this.clamp(initialCloudiness, 0, 1);
    this.weather.cloudyFactor = clampedCloudiness;
    this.weather.cloudyTarget = clampedCloudiness;
    this.cloudyFactor = clampedCloudiness;
    this.cloudyTarget = clampedCloudiness;

    this.skyCloudTotalCap = this.config.skyClouds.layers.reduce(
      (sum, layer) => sum + Math.max(0, layer.maxCount),
      0,
    );
    this.scheduleNextCloudinessUpdate();
    this.state = this.buildEnvironmentState();
  }

  /**
   * Ініціалізує енвайронмент для нового світу
   */
  initialize(): void {
    this.initialized = true;
    this.clearAllEffects();
    this.clearDustClouds();
    this.clearSkyClouds();
    this.dustCloudTimer = 0;

    const startTotalMinutes =
      this.config.time.initialHour * 60 + this.config.time.initialMinute;
    this.time.totalMinutes = startTotalMinutes;
    this.updateTimeFromTotalMinutes();

    const windRange = this.config.weather.windSpeed;
    this.weather.temperature = this.calculateTemperature();
    this.weather.windSpeed = this.randomBetween(windRange.min, windRange.max);
    this.weather.windTarget = this.weather.windSpeed;
    this.weather.nextWindChangeMinute =
      this.time.totalMinutes + windRange.changeIntervalHours * 60;

    const startCloudiness =
      this.config.skyClouds.initialCloudyFactor ?? this.config.weather.cloudyFactor ?? 0;
    const clampedCloudiness = this.clamp(startCloudiness, 0, 1);
    this.weather.cloudyFactor = clampedCloudiness;
    this.weather.cloudyTarget = clampedCloudiness;
    this.cloudyFactor = clampedCloudiness;
    this.cloudyTarget = clampedCloudiness;
    this.scheduleNextCloudinessUpdate();
    this.seedSkyClouds();
    this.generateInitialDustClouds();
    this.state = this.buildEnvironmentState();
  }

  /**
   * Оновлення логіки енвайронменту
   */
  update(deltaTimeSeconds: number): void {
    if (!this.initialized) {
      this.initialize();
    }

    this.advanceTime(deltaTimeSeconds);
    this.updateWeather(deltaTimeSeconds);
    this.updateDustClouds(deltaTimeSeconds);
    this.updateCloudinessCycle();
    this.updateCloudyFactor(deltaTimeSeconds);
    this.updateSkyCloudLifecycle(deltaTimeSeconds);

    const now = Date.now();
    if (now - this.lastUpdateTime >= this.config.updateInterval) {
      this.lastUpdateTime = now;
      this.cleanupExpiredEffects(now);
      this.generateNewEffects(now);
    }

    this.state = this.buildEnvironmentState();
  }

  /**
   * Отримати всі активні ефекти
   */
  getActiveEffects(): IEnvironmentEffect[] {
    return Array.from(this.activeEffects.values());
  }

  /**
   * Отримати тільки полярні сяйва
   */
  getAuroraEffects(): AuroraEffect[] {
    return this.getActiveEffects().filter((effect) => effect.type === 'aurora') as AuroraEffect[];
  }

  /**
   * Отримати стан середовища (день, час, погода)
   */
  getEnvironmentState(): EnvironmentState {
    return {
      ...this.state,
      time: { ...this.state.time },
      sun: {
        ...this.state.sun,
        direction: { ...this.state.sun.direction },
      },
    };
  }

  /**
   * Стан сонячного світла для рендера
   */
  getSunLightState(): SunLightState {
    return {
      ...this.state.sun,
      direction: { ...this.state.sun.direction },
    };
  }

  /**
   * Отримати поточні налаштування вигляду сонця
   */
  getSunVisualConfig(): SunVisualConfig {
    return {
      ...this.config.sun,
      altitudeRangeDeg: { ...this.config.sun.altitudeRangeDeg },
      haloIntensity: { ...this.config.sun.haloIntensity },
      colors: { ...this.config.sun.colors },
    };
  }

  /**
   * Параметри для шейдера небесних хмар
   */
  getSkyCloudRenderState(): SkyCloudRenderState {
    const skyConfig = this.config.skyClouds;
    const speedMultiplier = this.getCurrentCloudSpeedMultiplier();

    return {
      cloudyFactor: this.cloudyFactor,
      speedMultiplier,
      wispyMultiplier: skyConfig.globalWispyMultiplier,
      opacityMultiplier: skyConfig.globalOpacityMultiplier,
    };
  }


  getSkyCloudInstances(): SkyCloudInstance[] {
    if (this.skyCloudSnapshotDirty) {
      this.skyCloudSnapshot = Array.from(this.skyCloudInstances.values()).map((cloud) => ({
        id: cloud.id,
        layerId: cloud.layerId,
        position: { ...cloud.position },
        data: { ...cloud.data },
      }));
      this.skyCloudSnapshotDirty = false;
    }

    return this.skyCloudSnapshot;
  }


  /**
   * Поточний рівень хмарності (0..1)
   */
  getCloudyFactor(): number {
    return this.cloudyFactor;
  }

  /**
   * Встановити нову цільову хмарність (0..1)
   */
  setCloudyFactor(value: number): void {
    const clamped = this.clamp(value, 0, 1);
    this.cloudyTarget = clamped;
    this.weather.cloudyTarget = clamped;
  }

  /**
   * Оновити налаштування вигляду сонця
   */
  updateSunVisualConfig(update: Partial<SunVisualConfig>): void {
    this.config.sun = this.mergeSunConfig(this.config.sun, update);
    this.state = this.buildEnvironmentState();
  }

  /**
   * Дані для збереження стану енвайронменту
   */
  getSaveData(): EnvironmentSaveData {
    return {
      time: { totalMinutes: this.time.totalMinutes },
      weather: {
        windSpeed: this.weather.windSpeed,
        windTarget: this.weather.windTarget,
        nextWindChangeMinute: this.weather.nextWindChangeMinute,
        cloudyFactor: this.weather.cloudyTarget,
      },
    };
  }

  /**
   * Відновити стан енвайронменту з сейву
   */
  loadFromSave(data: EnvironmentSaveData | undefined): void {
    if (!data) return;

    if (typeof data.time?.totalMinutes === 'number' && !Number.isNaN(data.time.totalMinutes)) {
      this.time.totalMinutes = data.time.totalMinutes;
      this.updateTimeFromTotalMinutes();
    }

    if (data.weather) {
      if (typeof data.weather.windSpeed === 'number') {
        this.weather.windSpeed = data.weather.windSpeed;
      }
      if (typeof data.weather.windTarget === 'number') {
        this.weather.windTarget = data.weather.windTarget;
      }
      if (typeof data.weather.nextWindChangeMinute === 'number') {
        this.weather.nextWindChangeMinute = data.weather.nextWindChangeMinute;
      }
      if (typeof data.weather.cloudyFactor === 'number') {
        const clamped = this.clamp(data.weather.cloudyFactor, 0, 1);
        this.weather.cloudyFactor = clamped;
        this.weather.cloudyTarget = clamped;
        this.cloudyFactor = clamped;
        this.cloudyTarget = clamped;
      }
    }

    this.weather.temperature = this.calculateTemperature();
    this.scheduleNextCloudinessUpdate();
    this.seedSkyClouds();
    this.state = this.buildEnvironmentState();
  }

  /**
   * Встановити час доби (0.0 = північ, 0.5 = полудень, 1.0 = північ)
   */
  setTimeOfDay(timeOfDay: number): void {
    const clamped = this.clamp(timeOfDay, 0, 1);
    const baseDay = Math.floor(this.time.totalMinutes / 1440) * 1440;
    this.time.totalMinutes = baseDay + clamped * 1440;
    this.updateTimeFromTotalMinutes();
    this.state = this.buildEnvironmentState();
  }

  /**
   * Отримати поточний час доби
   */
  getTimeOfDay(): number {
    return this.config.timeOfDay;
  }

  /**
   * Чи є зараз ніч
   */
  isNightTime(): boolean {
    const sunriseMinutes = this.config.time.sunriseHour * 60;
    const sunsetMinutes = this.config.time.sunsetHour * 60;
    const twilightMinutes = this.config.time.twilightDurationHours * 60;
    const dawnStart = sunriseMinutes - twilightMinutes;
    const duskEnd = sunsetMinutes + twilightMinutes;
    const minutes = this.time.currentMinutes;

    return minutes < dawnStart || minutes >= duskEnd;
  }

  /**
   * Видалити конкретний ефект
   */
  removeEffect(effectId: string): void {
    this.activeEffects.delete(effectId);
  }

  /**
   * Очистити всі ефекти
   */
  clearAllEffects(): void {
    this.activeEffects.clear();
  }

  // ──────────────────────────────
  //        Приватні методи
  // ──────────────────────────────

  private mergeConfig(base: EnvironmentConfig, overrides?: Partial<EnvironmentConfig>): EnvironmentConfig {
    const cloned: EnvironmentConfig = {
      ...base,
      aurora: { ...base.aurora },
      mapSize: { ...base.mapSize },
      time: { ...base.time },
      weather: {
        temperature: { ...base.weather.temperature },
        windSpeed: { ...base.weather.windSpeed },
        cloudyFactor: base.weather.cloudyFactor,
      },
      dustClouds: {
        ...base.dustClouds,
        size: { ...base.dustClouds.size },
        height: { ...base.dustClouds.height },
        windSpeed: { ...base.dustClouds.windSpeed },
      },
      skyClouds: this.mergeSkyCloudConfig(base.skyClouds),
      sun: this.mergeSunConfig(base.sun),
    };

    if (!overrides) {
      return cloned;
    }

    const merged: EnvironmentConfig = {
      ...cloned,
      ...overrides,
      aurora: { ...cloned.aurora, ...(overrides.aurora ?? {}) },
      mapSize: { ...cloned.mapSize, ...(overrides.mapSize ?? {}) },
      time: { ...cloned.time, ...(overrides.time ?? {}) },
      weather: {
        temperature: {
          ...cloned.weather.temperature,
          ...(overrides.weather?.temperature ?? {}),
        },
        windSpeed: {
          ...cloned.weather.windSpeed,
          ...(overrides.weather?.windSpeed ?? {}),
        },
        cloudyFactor: overrides.weather?.cloudyFactor ?? cloned.weather.cloudyFactor,
      },
      dustClouds: {
        ...cloned.dustClouds,
        ...(overrides.dustClouds ?? {}),
        size: {
          ...cloned.dustClouds.size,
          ...(overrides.dustClouds?.size ?? {}),
        },
        height: {
          ...cloned.dustClouds.height,
          ...(overrides.dustClouds?.height ?? {}),
        },
        windSpeed: {
          ...cloned.dustClouds.windSpeed,
          ...(overrides.dustClouds?.windSpeed ?? {}),
        },
      },
      skyClouds: this.mergeSkyCloudConfig(cloned.skyClouds, overrides.skyClouds),
      sun: this.mergeSunConfig(cloned.sun, overrides.sun),
    };

    return merged;
  }

  private mergeSunConfig(base: SunVisualConfig, overrides?: Partial<SunVisualConfig>): SunVisualConfig {
    if (!overrides) {
      return {
        ...base,
        altitudeRangeDeg: { ...base.altitudeRangeDeg },
        haloIntensity: { ...base.haloIntensity },
        colors: { ...base.colors },
      };
    }

    return {
      ...base,
      ...overrides,
      altitudeRangeDeg: {
        ...base.altitudeRangeDeg,
        ...(overrides.altitudeRangeDeg ?? {}),
      },
      haloIntensity: {
        ...base.haloIntensity,
        ...(overrides.haloIntensity ?? {}),
      },
      colors: {
        ...base.colors,
        ...(overrides.colors ?? {}),
      },
    };
  }

  private mergeSkyCloudConfig(base: SkyCloudConfig, overrides?: Partial<SkyCloudConfig>): SkyCloudConfig {
    const cloned: SkyCloudConfig = {
      ...base,
      parallaxRange: { ...base.parallaxRange },
      layers: base.layers.map((layer) => this.cloneSkyCloudLayer(layer)),
    };

    if (!overrides) {
      return cloned;
    }

    const merged: SkyCloudConfig = {
      ...cloned,
      ...overrides,
      parallaxRange: {
        ...cloned.parallaxRange,
        ...(overrides.parallaxRange ?? {}),
      },
    };

    if (overrides.layers) {
      merged.layers = overrides.layers.map((layer) => this.cloneSkyCloudLayer(layer));
    }

    return merged;
  }

  private cloneSkyCloudLayer(layer: SkyCloudLayerConfig): SkyCloudLayerConfig {
    return {
      ...layer,
      sizeRange: { ...layer.sizeRange },
      aspectRatioRange: { ...layer.aspectRatioRange },
      opacityRange: { ...layer.opacityRange },
      speedRange: { ...layer.speedRange },
      wispinessRange: { ...layer.wispinessRange },
      softnessRange: { ...layer.softnessRange },
      noiseScaleRange: { ...layer.noiseScaleRange },
      noiseStrengthRange: { ...layer.noiseStrengthRange },
    };
  }

  private advanceTime(deltaTimeSeconds: number): void {
    const minutesAdvance = deltaTimeSeconds * this.gameMinutesPerRealSecond;
    this.time.totalMinutes += minutesAdvance;
    this.updateTimeFromTotalMinutes();
  }

  private updateTimeFromTotalMinutes(): void {
    this.time.currentDay = Math.floor(this.time.totalMinutes / 1440) + 1;
    const minutesInDay = this.time.totalMinutes % 1440;
    this.time.currentMinutes = minutesInDay;
    this.config.timeOfDay = minutesInDay / 1440;
  }

  private updateWeather(deltaTimeSeconds: number): void {
    this.weather.temperature = this.calculateTemperature();

    const windConfig = this.config.weather.windSpeed;
    if (
      windConfig.changeIntervalHours > 0 &&
      this.time.totalMinutes >= this.weather.nextWindChangeMinute
    ) {
      this.weather.windTarget = this.randomBetween(windConfig.min, windConfig.max);
      this.weather.nextWindChangeMinute =
        this.time.totalMinutes + windConfig.changeIntervalHours * 60;
    }

    const diff = this.weather.windTarget - this.weather.windSpeed;
    if (Math.abs(diff) > 0.001) {
      const transition = Math.max(0.1, windConfig.transitionSeconds);
      const step = Math.min(1, deltaTimeSeconds / transition);
      this.weather.windSpeed += diff * step;
      if (diff > 0) {
        this.weather.windSpeed = Math.min(this.weather.windSpeed, windConfig.max);
      } else {
        this.weather.windSpeed = Math.max(this.weather.windSpeed, windConfig.min);
      }
    }
  }

  private updateDustClouds(deltaTimeSeconds: number): void {
    const cfg = this.config.dustClouds;
    if (!cfg) return;

    this.dustCloudTimer += deltaTimeSeconds;
    if (this.dustCloudTimer >= cfg.spawnIntervalSeconds) {
      this.generateDustCloud();
      this.dustCloudTimer = 0;
    }

    const now = Date.now() / 1000;
    for (const [cloudId, data] of this.dustClouds) {
      const age = now - data.createdAt;
      if (age >= data.ttl) {
        this.scene.removeObject(cloudId);
        this.dustClouds.delete(cloudId);
      }
    }
  }

  private updateCloudyFactor(deltaTimeSeconds: number): void {
    const diff = this.cloudyTarget - this.cloudyFactor;
    if (Math.abs(diff) < 0.0001) {
      this.cloudyFactor = this.cloudyTarget;
      this.weather.cloudyFactor = this.cloudyFactor;
      return;
    }

    const smoothing = Math.max(0.1, this.config.skyClouds.smoothingSeconds);
    const step = this.clamp(deltaTimeSeconds / smoothing, 0, 1);
    this.cloudyFactor += diff * step;
    this.weather.cloudyFactor = this.cloudyFactor;
  }

  private cleanupExpiredEffects(now: number): void {
    for (const [id, effect] of this.activeEffects.entries()) {
      const elapsed = (now - effect.startTime) / 1000;
      if (elapsed >= effect.duration) {
        this.activeEffects.delete(id);
      }
    }
  }

  private generateNewEffects(now: number): void {
    if (this.isNightTime()) {
      this.generateAuroraEffect(now);
    }
  }

  private generateAuroraEffect(now: number): void {
    const auroraConfig = this.config.aurora;
    const currentAuroraCount = this.getAuroraEffects().length;
    if (currentAuroraCount >= auroraConfig.maxActiveEffects) {
      return;
    }

    if (Math.random() > auroraConfig.spawnChance) {
      return;
    }

    const aurora: AuroraEffect = {
      id: `aurora_${++this.effectIdCounter}`,
      type: 'aurora',
      intensity: this.randomBetween(auroraConfig.minIntensity, auroraConfig.maxIntensity),
      position: this.generateAuroraPosition(),
      duration: this.randomBetween(auroraConfig.minDuration, auroraConfig.maxDuration),
      startTime: now,
      primaryColor: this.generateAuroraColor(),
      secondaryColor: this.generateAuroraColor(),
      waveSpeed: this.randomBetween(0.5, 2.0),
      waveAmplitude: this.randomBetween(0.3, 0.8),
      width: this.randomBetween(350, 750),
      height: this.randomBetween(160, 320),
      direction: Math.random() * Math.PI * 2,
    };

    this.activeEffects.set(aurora.id, aurora);
  }

  private generateAuroraPosition(): { x: number; y: number; z: number } {
    const distance = 400;
    const azimuth = Math.random() * Math.PI * 2;

    return {
      x: Math.cos(azimuth) * distance,
      y: this.randomBetween(10, 40),
      z: Math.sin(azimuth) * distance,
    };
  }

  private generateAuroraColor(): { r: number; g: number; b: number } {
    const colors = [
      { r: 0.0, g: 1.0, b: 0.5 },
      { r: 0.0, g: 0.8, b: 1.0 },
      { r: 0.7, g: 0.6, b: 1.0 },
      { r: 1.0, g: 1.0, b: 0.0 },
      { r: 0.5, g: 0.0, b: 1.0 },
    ];

    return colors[Math.floor(Math.random() * colors.length)];
  }

  private generateInitialDustClouds(): void {
    const count = this.config.dustClouds.initialCount;
    for (let i = 0; i < count; i++) {
      this.generateDustCloud();
    }
  }

  private generateDustCloud(): void {
    const cfg = this.config.dustClouds;
    const mapWidth = this.config.mapSize.width;
    const mapDepth = this.config.mapSize.depth;

    const cloudId = `dust_cloud_${++this.dustCloudIdCounter}`;
    const x = (Math.random() - 0.5) * mapWidth;
    const z = (Math.random() - 0.5) * mapDepth;
    const createdAt = Date.now() / 1000;
    const ttl = cfg.ttlSeconds;

    const cloud: TSceneObject = {
      id: cloudId,
      type: 'cloud',
      coordinates: { x, y: 0, z },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      speed: {
        x: (Math.random() - 0.5) * 1.5,
        y: 0,
        z: (Math.random() - 0.5) * 1.5,
      },
      data: {
        size: this.randomBetween(cfg.size.min, cfg.size.max),
        color: cfg.color,
        particleCount: cfg.particleCount,
        windSpeed: this.randomBetween(cfg.windSpeed.min, cfg.windSpeed.max),
        height: this.randomBetween(cfg.height.min, cfg.height.max),
      },
      tags: ['on-ground', 'dust', 'dynamic'],
      bottomAnchor: -1,
      terrainAlign: false,
    };

    this.scene.pushObjectWithTerrainConstraint(cloud);
    this.dustClouds.set(cloudId, { createdAt, ttl });
  }

  private clearDustClouds(): void {
    for (const cloudId of this.dustClouds.keys()) {
      this.scene.removeObject(cloudId);
    }
    this.dustClouds.clear();
    this.dustCloudIdCounter = 0;
  }

  private clearSkyClouds(): void {
    this.skyCloudInstances.clear();
    this.skyCloudLayerCounts.clear();
    this.skyCloudSnapshot = [];
    this.skyCloudSnapshotDirty = true;
    this.skyCloudSpawnAccumulator = 0;
    this.skyCloudIdCounter = 0;
  }

  private seedSkyClouds(): void {
    const cfg = this.config.skyClouds;
    if (!cfg) return;

    this.clearSkyClouds();


    if (this.cloudyFactor <= 0) {
      return;
    }

    for (const layer of cfg.layers) {
      const targetCount = this.calculateLayerTargetCount(layer);
      for (let i = 0; i < targetCount; i++) {
        const progress = this.randomBetween(0.0, 0.85);
        this.spawnSkyCloud(layer, progress);
      }
    }
  }

  private spawnSkyCloudForDemand(): void {
    const cfg = this.config.skyClouds;
    if (!cfg || this.cloudyFactor <= 0) return;

    if (this.skyCloudInstances.size >= this.skyCloudTotalCap) {
      return;
    }

    const candidates: Array<{ layer: SkyCloudLayerConfig; weight: number }> = [];
    let weightSum = 0;

    for (const layer of cfg.layers) {
      const currentCount = this.getLayerCount(layer.id);
      if (currentCount >= layer.maxCount) {
        continue;
      }

      const target = this.calculateLayerTargetCount(layer);
      const deficit = Math.max(0, target - currentCount);
      const layerWeight = deficit > 0 ? deficit : this.cloudyFactor * Math.max(0.05, layer.coverageWeight * 0.1);
      if (layerWeight <= 0) continue;

      weightSum += layerWeight;
      candidates.push({ layer, weight: layerWeight });
    }

    if (!candidates.length || weightSum <= 0) {
      return;
    }

    let pick = Math.random() * weightSum;
    for (const candidate of candidates) {
      pick -= candidate.weight;
      if (pick <= 0) {
        this.spawnSkyCloud(candidate.layer, 0);
        return;
      }
    }
  }

  private spawnSkyCloud(layer: SkyCloudLayerConfig, progressNormalized = 0): boolean {
    if (this.skyCloudInstances.size >= this.skyCloudTotalCap) {
      return false;
    }

    const currentLayerCount = this.getLayerCount(layer.id);
    if (currentLayerCount >= layer.maxCount) {
      return false;
    }

    const cfg = this.config.skyClouds;
    const mapWidth = this.config.mapSize.width;
    const mapDepth = this.config.mapSize.depth;

    const cloudId = `sky_cloud_${layer.id}_${++this.skyCloudIdCounter}`;
    const altitude =
      layer.altitude + this.randomBetween(-layer.altitudeJitter * 0.5, layer.altitudeJitter * 0.5);
    const heightOffset = this.randomBetween(-layer.altitudeJitter * 0.25, layer.altitudeJitter * 0.25);
    const size = this.randomBetween(layer.sizeRange.min, layer.sizeRange.max);
    const aspect = this.randomBetween(layer.aspectRatioRange.min, layer.aspectRatioRange.max);
    const opacity = this.randomBetween(layer.opacityRange.min, layer.opacityRange.max);
    const wispiness = this.randomBetween(layer.wispinessRange.min, layer.wispinessRange.max);
    const softness = this.randomBetween(layer.softnessRange.min, layer.softnessRange.max);
    const noiseScale = this.randomBetween(layer.noiseScaleRange.min, layer.noiseScaleRange.max);
    const noiseStrength = this.randomBetween(layer.noiseStrengthRange.min, layer.noiseStrengthRange.max);
    const speed = this.randomBetween(layer.speedRange.min, layer.speedRange.max);
    const directionBase = this.degToRad(cfg.windDirectionDeg);
    let direction =
      directionBase + this.degToRad(this.randomBetween(-layer.directionJitterDeg, layer.directionJitterDeg));
    direction = this.clamp(direction, this.degToRad(5), this.degToRad(85));

    const colorShift = (Math.random() - 0.5) * 2 * layer.colorVariance;
    const activation = Math.pow(Math.random(), Math.max(0.0001, layer.coverageWeight));
    const parallax = this.randomBetween(cfg.parallaxRange.min, cfg.parallaxRange.max);

    const isHighAltitude = layer.altitude >= 150 || layer.id.toLowerCase().includes('cirrus');
    const orientationRange = isHighAltitude ? Math.PI / 2.6 : Math.PI / 4.2;
    const orientation = this.randomBetween(-orientationRange, orientationRange);
    const skew = this.randomBetween(
      isHighAltitude ? -0.35 : -0.22,
      isHighAltitude ? 0.35 : 0.22,
    );
    const detailScale = this.randomBetween(
      isHighAltitude ? 1.15 : 0.8,
      isHighAltitude ? 2.05 : 1.35,
    );
    const detailContrast = this.randomBetween(
      isHighAltitude ? 1.05 : 0.7,
      isHighAltitude ? 1.75 : 1.35,
    );
    const densityOffset = this.randomBetween(
      isHighAltitude ? -0.25 : -0.12,
      isHighAltitude ? 0.25 : 0.18,
    );
    const warpStrength = this.randomBetween(
      isHighAltitude ? 0.12 : 0.05,
      isHighAltitude ? 0.35 : 0.22,
    );
    const warpFrequency = this.randomBetween(
      isHighAltitude ? 1.3 : 0.9,
      isHighAltitude ? 2.35 : 1.6,
    );

    const spawnSide: 'north' | 'west' = Math.random() < 0.5 ? 'north' : 'west';
    const halfWidth = mapWidth / 2;
    const halfDepth = mapDepth / 2;
    const spawnDistance = altitude * 10 + (spawnSide === 'north' ? mapDepth : mapWidth);
    const despawnX = halfWidth + spawnDistance;
    const despawnZ = halfDepth + spawnDistance;

    let startX: number;
    let startZ: number;
    if (spawnSide === 'north') {
      startZ = -halfDepth - spawnDistance;
      startX = this.randomBetween(-despawnX * 0.7, despawnX * 0.3);
    } else {
      startX = -halfWidth - spawnDistance;
      startZ = this.randomBetween(-despawnZ * 0.7, despawnZ * 0.3);
    }

    const speedMultiplier = this.getCurrentCloudSpeedMultiplier();
    const velocityX = 5*Math.cos(direction) * speed * speedMultiplier;
    const velocityZ = 5*Math.sin(direction) * speed * speedMultiplier;

    const remainingX = despawnX - startX;
    const remainingZ = despawnZ - startZ;
    const timeX = velocityX > 0.0001 ? remainingX / velocityX : 0;
    const timeZ = velocityZ > 0.0001 ? remainingZ / velocityZ : 0;
    const travelTime = Math.max(timeX, timeZ, 0);
    const maxAge =
      travelTime > 0 ? travelTime * this.randomBetween(1.05, 1.25) : this.randomBetween(420, 780);

    const clampedProgress = this.clamp(progressNormalized, 0, 0.95);
    const progressTime = maxAge * clampedProgress;
    const positionX = Math.min(startX + velocityX * progressTime, despawnX - 10);
    const positionZ = Math.min(startZ + velocityZ * progressTime, despawnZ - 10);

    const data: SkyCloudObjectData = {
      layerId: layer.id,
      seed: Math.random() * 1000,
      size,
      aspectRatio: aspect,
      opacity,
      wispiness,
      softness,
      noiseScale,
      noiseStrength,
      color: layer.color,
      colorShift,
      speed,
      direction,
      activation,
      parallax,
      heightOffset,
      orientation,
      skew,
      detailScale,
      detailContrast,
      densityOffset,
      warpStrength,
      warpFrequency,
    };

    const cloud: InternalSkyCloud = {
      id: cloudId,
      layerId: layer.id,
      position: { x: positionX, y: altitude, z: positionZ },
      data,
      despawnX,
      despawnZ,
      age: progressTime,
      maxAge,
    };

    this.skyCloudInstances.set(cloudId, cloud);
    this.skyCloudLayerCounts.set(layer.id, currentLayerCount + 1);
    this.skyCloudSnapshotDirty = true;

    return true;
  }

  private removeSkyCloud(id: string): void {
    const cloud = this.skyCloudInstances.get(id);
    if (!cloud) return;

    this.skyCloudInstances.delete(id);
    const current = this.skyCloudLayerCounts.get(cloud.layerId) ?? 0;
    if (current <= 1) {
      this.skyCloudLayerCounts.delete(cloud.layerId);
    } else {
      this.skyCloudLayerCounts.set(cloud.layerId, current - 1);
    }
    this.skyCloudSnapshotDirty = true;
  }

  private getLayerCount(layerId: string): number {
    return this.skyCloudLayerCounts.get(layerId) ?? 0;
  }

  private calculateLayerTargetCount(layer: SkyCloudLayerConfig): number {
    if (this.cloudyFactor <= 0) {
      return 0;
    }

    const exponent = this.clamp(layer.coverageWeight, 0.1, 3);
    const coverage = Math.pow(this.cloudyFactor, exponent);
    const desired = Math.round(layer.maxCount * coverage);

    if (this.cloudyFactor < 0.05) {
      return 0;
    }

    if (desired === 0 && this.cloudyFactor > 0.25) {
      return 1;
    }

    return this.clamp(desired, 0, layer.maxCount);
  }

  private enforceLayerTargets(): void {
    const cfg = this.config.skyClouds;
    if (!cfg) return;

    for (const layer of cfg.layers) {
      const current = this.getLayerCount(layer.id);
      const target = this.calculateLayerTargetCount(layer);
      if (current <= target) {
        continue;
      }

      const excess = current - target;
      if (excess <= 0) continue;

      const candidates = Array.from(this.skyCloudInstances.values())
        .filter((cloud) => cloud.layerId === layer.id)
        .sort((a, b) => b.age - a.age);

      for (let i = 0; i < Math.min(excess, candidates.length); i++) {
        const cloud = candidates[i];
        cloud.maxAge = Math.min(cloud.maxAge, cloud.age + this.randomBetween(20, 60));
      }
    }
  }

  private updateSkyCloudLifecycle(deltaTimeSeconds: number): void {
    const cfg = this.config.skyClouds;
    if (!cfg) return;

    const speedMultiplier = this.getCurrentCloudSpeedMultiplier();
    let anyMoved = false;
    const toRemove: string[] = [];

    for (const [id, cloud] of this.skyCloudInstances) {
      const dirCos = Math.cos(cloud.data.direction);
      const dirSin = Math.sin(cloud.data.direction);
      const dx = dirCos * cloud.data.speed * speedMultiplier * deltaTimeSeconds;
      const dz = dirSin * cloud.data.speed * speedMultiplier * deltaTimeSeconds;

      if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
        cloud.position.x += dx;
        cloud.position.z += dz;
        anyMoved = true;
      }

      cloud.age += deltaTimeSeconds;

      if (
        cloud.age > cloud.maxAge ||
        cloud.position.x > cloud.despawnX ||
        cloud.position.z > cloud.despawnZ
      ) {
        toRemove.push(id);
      }
    }

    if (toRemove.length) {
      for (const id of toRemove) {
        this.removeSkyCloud(id);
      }
    }

    if (anyMoved && !this.skyCloudSnapshotDirty) {
      this.skyCloudSnapshotDirty = true;
    }

    if (this.cloudyFactor <= 0.01) {
      for (const cloud of this.skyCloudInstances.values()) {
        cloud.maxAge = Math.min(cloud.maxAge, cloud.age + this.randomBetween(10, 35));
      }
    } else {
      this.enforceLayerTargets();
    }

    this.skyCloudSpawnAccumulator += deltaTimeSeconds;
    if (this.skyCloudSpawnAccumulator >= 1) {
      const attempts = Math.floor(this.skyCloudSpawnAccumulator);
      this.skyCloudSpawnAccumulator -= attempts;

      for (let attempt = 0; attempt < attempts; attempt++) {
        if (this.cloudyFactor <= 0) {
          break;
        }

        const rolls = Math.max(1, Math.round(this.cloudyFactor * 3));
        for (let roll = 0; roll < rolls; roll++) {
          if (Math.random() <= this.cloudyFactor) {
            this.spawnSkyCloudForDemand();
          }
        }
      }
    }
  }

  private updateCloudinessCycle(): void {
    if (this.time.totalMinutes < this.nextCloudinessUpdateMinute) {
      return;
    }

    const base =
      this.config.weather.cloudyFactor ?? this.config.skyClouds.initialCloudyFactor ?? this.cloudyTarget;
    const variance = this.config.skyClouds.cloudinessVariance ?? 0.25;
    const randomOffset = (Math.random() * 2 - 1) * variance;
    const candidate = this.clamp(base + randomOffset, 0, 1);
    const blended = this.lerp(this.weather.cloudyTarget, candidate, 0.5);
    this.setCloudyFactor(blended);
    this.scheduleNextCloudinessUpdate();
  }

  private scheduleNextCloudinessUpdate(): void {
    const interval = this.config.skyClouds.cloudinessUpdateIntervalMinutes ?? 60;
    const minutes = Math.max(1, interval);
    this.nextCloudinessUpdateMinute = this.time.totalMinutes + minutes;
  }

  private getCurrentCloudSpeedMultiplier(): number {
    const skyConfig = this.config.skyClouds;
    const windRange = this.config.weather.windSpeed;
    const windSpan = Math.max(0.0001, windRange.max - windRange.min);
    const normalizedWind = this.clamp(
      (this.weather.windSpeed - windRange.min) / windSpan,
      0,
      1,
    );

    return skyConfig.globalSpeedMultiplier * this.lerp(0.6, 1.45, normalizedWind);
  }


  private buildEnvironmentState(): EnvironmentState {
    const minutes = this.time.currentMinutes;
    const hour = Math.floor(minutes / 60);
    const minute = Math.floor(minutes % 60);
    const sun = this.calculateSunLightState();

    return {
      day: this.time.currentDay,
      time: {
        hour,
        minute,
        totalMinutes: minutes,
        formatted: `${hour.toString().padStart(2, '0')}:${minute
          .toString()
          .padStart(2, '0')}`,
      },
      temperature: this.weather.temperature,
      windSpeed: this.weather.windSpeed,
      cloudiness: this.cloudyFactor,
      isNight: this.isNightTime(),
      sun,
    };
  }

  private calculateTemperature(): number {
    const { min, max } = this.config.weather.temperature;
    const dayProgress = (this.time.currentMinutes % 1440) / 1440;
    const normalized = (Math.cos((dayProgress - 0.5) * 2 * Math.PI) + 1) / 2;
    return min + normalized * (max - min);
  }

  private calculateSunLightState(): SunLightState {
    const { sunriseHour, sunsetHour, twilightDurationHours } = this.config.time;
    const sunCfg = this.config.sun;
    const sunriseMinutes = sunriseHour * 60;
    const sunsetMinutes = sunsetHour * 60;
    const twilightMinutes = twilightDurationHours * 60;
    const dawnStart = sunriseMinutes - twilightMinutes;
    const duskEnd = sunsetMinutes + twilightMinutes;
    const minutes = this.time.currentMinutes;

    let intensity = 0;
    if (minutes >= dawnStart && minutes < sunriseMinutes) {
      // Перед сходом: поступово зростає від 0 до 1
      const t = (minutes - dawnStart) / Math.max(1, sunriseMinutes - dawnStart);
      intensity = this.easeInOut(t);
    } else if (minutes >= sunriseMinutes && minutes <= sunsetMinutes) {
      // Вдень: завжди 1
      intensity = 1;
    } else if (minutes > sunsetMinutes && minutes < duskEnd) {
      // Після заходу: поступово падає від 1 до 0
      const t = (duskEnd - minutes) / Math.max(1, duskEnd - sunsetMinutes);
      intensity = this.easeInOut(t);
    } else {
      // Ніч: 0
      intensity = 0;
    }

    intensity = this.clamp(intensity, 0, 1);
    const coverageExponent = this.config.skyClouds.coverageExponent ?? 1;
    const cloudiness = Math.pow(this.clamp(this.cloudyFactor, 0, 1), coverageExponent);
    let ambientIntensity = 0.18 + intensity * 0.35;
    ambientIntensity *= this.lerp(1, 1.25, cloudiness * 0.7);
    const directionalIntensity = intensity * this.lerp(1, 0.45, cloudiness);

    const dayMinutes = 1440;
    const fullProgress = (this.time.totalMinutes % dayMinutes) / dayMinutes;
    const orbitOffset = (sunCfg.azimuthOffsetDeg / 360) * 2 * Math.PI;
    const orbitAngle = (fullProgress - 0.25) * 2 * Math.PI + orbitOffset;
    const rawElevation = Math.sin(orbitAngle);
    const easedElevation = Math.sign(rawElevation) * Math.pow(Math.abs(rawElevation), 0.92);

    const maxAltitudeDeg = Math.max(0, sunCfg.altitudeRangeDeg.max);
    const altitudeRad = (easedElevation * maxAltitudeDeg * Math.PI) / 180;
    const altitudeDeg = (altitudeRad * 180) / Math.PI;
    const baseRadius = Math.max(this.config.mapSize.width, this.config.mapSize.depth) * sunCfg.orbitRadiusMultiplier;
    const horizontalRadius = Math.cos(altitudeRad) * baseRadius;
    const y = Math.sin(altitudeRad) * baseRadius;
    const x = Math.cos(orbitAngle) * horizontalRadius;
    const z = Math.sin(orbitAngle) * horizontalRadius * sunCfg.orbitFlattening;

    const sunriseWeight = Math.pow(
      this.clamp(1 - Math.abs(minutes - sunriseMinutes) / Math.max(1, twilightMinutes), 0, 1),
      sunCfg.colorShiftExponent
    );
    const sunsetWeight = Math.pow(
      this.clamp(1 - Math.abs(Math.min(0, minutes - sunsetMinutes)) / Math.max(1, twilightMinutes), 0, 1),
      sunCfg.colorShiftExponent
    );
    const horizonWeight = Math.max(sunriseWeight, sunsetWeight);

    const baseColor = this.hexToRgb(sunCfg.colors.base);
    const sunriseColor = this.hexToRgb(sunCfg.colors.sunrise);
    const sunsetColor = this.hexToRgb(sunCfg.colors.sunset);
    const haloBase = this.hexToRgb(sunCfg.colors.halo);

    let sunColor = { ...baseColor };
    if (sunriseWeight > 0) {
      sunColor = this.lerpColor(sunColor, sunriseColor, sunriseWeight);
    }
    if (sunsetWeight > 0) {
      sunColor = this.lerpColor(sunColor, sunsetColor, sunsetWeight);
    }

    const overcastTint = this.hexToRgb(0xe2e6ea);
    sunColor = this.lerpColor(sunColor, overcastTint, cloudiness * 0.45);

    let haloColor = { ...haloBase };
    if (sunriseWeight > 0) {
      haloColor = this.lerpColor(haloColor, sunriseColor, sunriseWeight * 0.6);
    }
    if (sunsetWeight > 0) {
      haloColor = this.lerpColor(haloColor, sunsetColor, sunsetWeight * 0.6);
    }
    haloColor = this.lerpColor(haloColor, overcastTint, cloudiness * 0.35);

    const white = { r: 1, g: 1, b: 1 };
    let directionalColor = this.lerpColor(sunColor, white, 0.1 + horizonWeight * 0.2);
    directionalColor = this.lerpColor(directionalColor, overcastTint, cloudiness * 0.25);

    const horizonFadeDeg = Math.max(0, sunCfg.altitudeRangeDeg.min);
    const altitudeAboveHorizon = Math.max(0, altitudeDeg);
    const nearHorizonRangeDeg = Math.max(1, horizonFadeDeg * 1.5);
    const nearHorizon = this.clamp(1 - altitudeAboveHorizon / nearHorizonRangeDeg, 0, 1);
    const horizonInfluence = Math.max(horizonWeight, Math.pow(nearHorizon, 0.85));
    const belowHorizon = Math.abs(Math.min(0, altitudeDeg));
    const maxVisibleDropDeg = 5;
    const belowRatio = this.clamp(belowHorizon / maxVisibleDropDeg, 0, 1);
    if (belowHorizon > 0) {
      const dominantWarmColor = sunriseWeight >= sunsetWeight ? sunriseColor : sunsetColor;
      const warmBlend = Math.pow(belowRatio, 0.8);
      sunColor = this.lerpColor(sunColor, dominantWarmColor, warmBlend);
      haloColor = this.lerpColor(haloColor, dominantWarmColor, warmBlend * 0.7);
    }

    const discScaleBoost = 1 + horizonInfluence * 0.75 + Math.pow(belowRatio, 0.75) * 0.35;
    const discSize = sunCfg.discSize * discScaleBoost;

    const haloShrinkInfluence = Math.max(horizonInfluence, Math.pow(belowRatio, 0.8));
    const haloSizeMultiplier = this.lerp(1, 0.42, haloShrinkInfluence);
    const haloSize = sunCfg.haloSize * haloSizeMultiplier * this.lerp(1, 0.7, cloudiness);

    const fadeStartBelow = maxVisibleDropDeg + 5; // Почати зникати на 8° нижче горизонту замість 5°
    const fadeEndBelow = fadeStartBelow + Math.max(2, horizonFadeDeg * 0.5);
    let discVisibility = 1;
    if (belowHorizon > 0) {
      if (belowHorizon >= fadeEndBelow) {
        discVisibility = 0;
      } else if (belowHorizon > fadeStartBelow) {
        const fadeT = (belowHorizon - fadeStartBelow) / Math.max(0.0001, fadeEndBelow - fadeStartBelow);
        discVisibility = Math.pow(1 - fadeT, 1.1);
      }
    }

    const directionalBrightness = this.clamp(directionalIntensity, 0, 1);
    const glowPresence = Math.max(horizonWeight, Math.pow(belowRatio, 0.75));
    const discBaseLuminance = 0.7 + Math.max(directionalBrightness, glowPresence) * 0.3;
    const discOpacity = this.clamp(
      discBaseLuminance * discVisibility * this.lerp(1, 0.35, cloudiness),
      0,
      1
    );

    let haloIntensity = this.lerp(
      sunCfg.haloIntensity.day,
      sunCfg.haloIntensity.horizon,
      horizonInfluence
    );
    if (this.isNightTime()) {
      haloIntensity = this.lerp(haloIntensity, sunCfg.haloIntensity.night, 0.85);
    } else {
      haloIntensity = this.lerp(
        haloIntensity,
        sunCfg.haloIntensity.night,
        Math.pow(cloudiness, 1.1) * 0.5
      );
    }
    haloIntensity *= this.lerp(1, 0.25, cloudiness);

    // Колір фону в залежності від пори доби
    const dayBackgroundColor = this.hexToRgb(0x7a6f2e);   // Денний колір
    const nightBackgroundColor = this.hexToRgb(0x11130e); // Нічний колір
    const baseBackground = this.lerpColor(nightBackgroundColor, dayBackgroundColor, intensity);
    const overcastBackground = this.hexToRgb(0x4a545d);
    const backgroundColor = this.lerpColor(baseBackground, overcastBackground, cloudiness * 0.45);

    return {
      direction: { x, y, z },
      directionalIntensity,
      ambientIntensity,
      directionalColor,
      sunColor,
      haloColor,
      haloIntensity,
      haloSize,
      discSize,
      discOpacity,
      backgroundColor,
    };
  }

  private easeInOut(value: number): number {
    const t = this.clamp(value, 0, 1);
    return Math.sin((t * Math.PI) / 2);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private degToRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private lerp(a: number, b: number, t: number): number {
    const clamped = this.clamp(t, 0, 1);
    return a + (b - a) * clamped;
  }

  private lerpColor(a: ColorRGB, b: ColorRGB, t: number): ColorRGB {
    const clamped = this.clamp(t, 0, 1);
    return {
      r: a.r + (b.r - a.r) * clamped,
      g: a.g + (b.g - a.g) * clamped,
      b: a.b + (b.b - a.b) * clamped,
    };
  }

  private hexToRgb(hex: number): ColorRGB {
    const value = Math.round(hex) & 0xffffff;
    return {
      r: ((value >> 16) & 0xff) / 255,
      g: ((value >> 8) & 0xff) / 255,
      b: (value & 0xff) / 255,
    };
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
