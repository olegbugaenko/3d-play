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
  
  // Кольори сяйва (RGB 0-1)
  primaryColor: { r: number; g: number; b: number };
  secondaryColor: { r: number; g: number; b: number };
  
  // Параметри руху
  waveSpeed: number; // швидкість хвиль
  waveAmplitude: number; // амплітуда хвиль
  
  // Розміри
  width: number; // ширина сяйва
  height: number; // висота сяйва
  
  // Напрямок руху
  direction: number; // радіани
}

/**
 * Конфігурація для генерації ефектів
 */
export interface EnvironmentConfig {
  // Полярне сяйво
  aurora: {
    minIntensity: number;
    maxIntensity: number;
    minDuration: number; // секунди
    maxDuration: number;
    spawnChance: number; // 0.0 - 1.0 за хвилину
    maxActiveEffects: number;
  };
  
  // Загальні налаштування
  updateInterval: number; // мілісекунди
  timeOfDay: number; // 0.0 - 1.0 (0 = північ, 0.5 = полудень)
}
