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

/**
 * Конфігурація для генерації ефектів
 */
export interface EnvironmentConfig {
  // Полярне сяйво
  aurora: {
    minIntensity: number; // 0.2 - мінімальна інтенсивність
    maxIntensity: number; // 0.5 - максимальна інтенсивність
    minDuration: number; // секунди
    maxDuration: number;
    spawnChance: number; // 0.0 - 1.0 за хвилину
    maxActiveEffects: number;
  };
  
  // Загальні налаштування
  updateInterval: number; // мілісекунди
  timeOfDay: number; // 0.0 - 1.0 (0 = північ, 0.5 = полудень)
}
