import { SceneLogic } from '@scene/scene-logic';
import { TSceneObject } from '@scene/scene.types';
import {
  AuroraEffect,
  EnvironmentConfig,
  EnvironmentState,
  IEnvironmentEffect,
  SunLightState,
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
    sunriseHour: 6,
    sunsetHour: 18,
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

    this.state = this.buildEnvironmentState();
  }

  /**
   * Ініціалізує енвайронмент для нового світу
   */
  initialize(): void {
    this.initialized = true;
    this.clearAllEffects();
    this.clearDustClouds();
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
    if (!overrides) {
      return base;
    }

    const merged: EnvironmentConfig = {
      ...base,
      ...overrides,
      aurora: { ...base.aurora, ...(overrides.aurora ?? {}) },
      mapSize: { ...base.mapSize, ...(overrides.mapSize ?? {}) },
      time: { ...base.time, ...(overrides.time ?? {}) },
      weather: {
        temperature: {
          ...base.weather.temperature,
          ...(overrides.weather?.temperature ?? {}),
        },
        windSpeed: {
          ...base.weather.windSpeed,
          ...(overrides.weather?.windSpeed ?? {}),
        },
      },
      dustClouds: {
        ...base.dustClouds,
        ...(overrides.dustClouds ?? {}),
        size: {
          ...base.dustClouds.size,
          ...(overrides.dustClouds?.size ?? {}),
        },
        height: {
          ...base.dustClouds.height,
          ...(overrides.dustClouds?.height ?? {}),
        },
        windSpeed: {
          ...base.dustClouds.windSpeed,
          ...(overrides.dustClouds?.windSpeed ?? {}),
        },
      },
    };

    return merged;
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
    const sunriseMinutes = sunriseHour * 60;
    const sunsetMinutes = sunsetHour * 60;
    const twilightMinutes = twilightDurationHours * 60;
    const dawnStart = sunriseMinutes - twilightMinutes;
    const duskEnd = sunsetMinutes + twilightMinutes;
    const minutes = this.time.currentMinutes;

    let intensity = 0;
    if (minutes >= dawnStart && minutes < sunriseMinutes) {
      const t = (minutes - dawnStart) / Math.max(1, sunriseMinutes - dawnStart);
      intensity = this.easeInOut(t) * 0.5;
    } else if (minutes >= sunriseMinutes && minutes <= sunsetMinutes) {
      const dayRange = Math.max(1, sunsetMinutes - sunriseMinutes);
      const t = (minutes - sunriseMinutes) / dayRange;
      intensity = 0.5 + Math.sin(t * Math.PI) * 0.5;
    } else if (minutes > sunsetMinutes && minutes < duskEnd) {
      const t = (duskEnd - minutes) / Math.max(1, duskEnd - sunsetMinutes);
      intensity = this.easeInOut(t) * 0.5;
    } else {
      intensity = 0;
    }

    intensity = this.clamp(intensity, 0, 1);
    const ambientIntensity = 0.18 + intensity * 0.35;

    const fullProgress = this.time.currentMinutes / 1440;
    const orbitAngle = (fullProgress - 0.25) * 2 * Math.PI;
    const radius = Math.max(this.config.mapSize.width, this.config.mapSize.depth) * 0.6;
    const direction = {
      x: Math.cos(orbitAngle) * radius,
      y: Math.max(30, Math.sin(orbitAngle) * radius * 0.8),
      z: Math.sin(orbitAngle * 0.5) * radius * 0.4,
    };

    return {
      direction,
      directionalIntensity: intensity,
      ambientIntensity,
    };
  }

  private easeInOut(value: number): number {
    const t = this.clamp(value, 0, 1);
    return Math.sin((t * Math.PI) / 2);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
