import { Vector3 } from "shared/math.types";

/**
 * Базовий інтерфейс для всіх енвайронмент-ефектів
 */
export interface IEnvironmentEffect {
  id: string;
  type: string;
  intensity: number; // 0.0 - 1.0
  position: Vector3;
  duration: number; // секунди
  startTime: number; // timestamp
}

/**
 * Дані про полярне сяйво
 */
export interface AuroraEffect extends IEnvironmentEffect {
  type: 'aurora';

  // Позиція на фіксованій відстані 400 від центру з рандомізованим азимутальним кутом
  position: Vector3; // x = cos(azimuth) * 400, z = sin(azimuth) * 400, y = random(10, 40)

  // Кольори сяйва (RGB 0-1)
  // Доступні кольори: зелений, блакитний, фіолетовий, жовтий, синій
  primaryColor: { r: number; g: number; b: number };
  secondaryColor: { r: number; g: number; b: number };

  // Параметри руху
  waveSpeed: number; // швидкість хвиль
  waveAmplitude: number; // амплітуда хвиль

  // Розміри
  width: number; // ширина сяйва (350-750)
  height: number; // висота сяйва (160-320)

  // Напрямок руху
  direction: number; // радіани
}

export interface DayNightCycleConfig {
  dayLengthMinutes: number; // Реальна тривалість доби у хвилинах
  sunriseHour: number; // година сходу сонця (ігрова)
  sunsetHour: number;  // година заходу сонця (ігрова)
  twilightDurationHours: number; // тривалість сутінків до/після сходу та заходу
  initialHour: number;  // година старту гри
  initialMinute: number; // хвилина старту гри
}

export interface TemperatureRangeConfig {
  min: number;
  max: number;
}

export interface WindSpeedConfig {
  min: number;
  max: number;
  changeIntervalHours: number; // як часто міняється цільова швидкість вітру
  transitionSeconds: number;   // скільки секунд займає перехід до нової швидкості
}

export interface WeatherConfig {
  temperature: TemperatureRangeConfig;
  windSpeed: WindSpeedConfig;
}

export interface DustCloudConfig {
  initialCount: number;
  spawnIntervalSeconds: number;
  ttlSeconds: number;
  fadeDurationSeconds: number;
  size: { min: number; max: number };
  height: { min: number; max: number };
  windSpeed: { min: number; max: number };
  particleCount: number;
  color: number;
}

export interface MapSizeConfig {
  width: number;
  depth: number;
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export interface SunLightState {
  direction: Vector3;
  directionalIntensity: number;
  ambientIntensity: number;
  directionalColor: ColorRGB;
  sunColor: ColorRGB;
  haloColor: ColorRGB;
  haloIntensity: number;
  haloSize: number;
  discSize: number;
}

export interface EnvironmentState {
  day: number;
  time: {
    hour: number;
    minute: number;
    totalMinutes: number;
    formatted: string;
  };
  temperature: number;
  windSpeed: number;
  isNight: boolean;
  sun: SunLightState;
}

export interface SunColorConfig {
  base: number;
  sunrise: number;
  sunset: number;
  halo: number;
}

export interface SunVisualConfig {
  altitudeRangeDeg: { min: number; max: number };
  azimuthOffsetDeg: number;
  orbitRadiusMultiplier: number;
  orbitFlattening: number;
  discSize: number;
  haloSize: number;
  haloIntensity: { day: number; horizon: number; night: number };
  colorShiftExponent: number;
  haloFalloffExponent: number;
  colors: SunColorConfig;
}

export interface EnvironmentSaveData {
  time: { totalMinutes: number };
  weather?: {
    windSpeed: number;
    windTarget: number;
    nextWindChangeMinute: number;
  };
}

/**
 * Конфігурація для генерації ефектів та керування погодою/днем-ніччю
 */
export interface EnvironmentConfig {
  // Полярне сяйво
  aurora: {
    minIntensity: number; // 0.2 - мінімальна інтенсивність
    maxIntensity: number; // 0.5 - максимальна інтенсивність
    minDuration: number; // секунди
    maxDuration: number;
    spawnChance: number; // 0.0 - 1.0 за інтервал оновлення
    maxActiveEffects: number;
  };

  // Загальні налаштування
  updateInterval: number; // мілісекунди
  timeOfDay: number; // 0.0 - 1.0 (0 = північ, 0.5 = полудень)

  // Розміри карти для енвайронмент-ефектів
  mapSize: MapSizeConfig;

  // Параметри циклу день/ніч
  time: DayNightCycleConfig;

  // Параметри погоди
  weather: WeatherConfig;

  // Параметри хмар з пилу
  dustClouds: DustCloudConfig;

  // Параметри вигляду сонця
  sun: SunVisualConfig;
}
