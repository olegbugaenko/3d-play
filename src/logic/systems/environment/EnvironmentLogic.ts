import { AuroraEffect, EnvironmentConfig, IEnvironmentEffect } from "./environment.types";

/**
 * Логіка управління енвайронмент-ефектами (полярне сяйво, погода, тощо)
 */
export class EnvironmentLogic {
  private config: EnvironmentConfig;
  private activeEffects: Map<string, IEnvironmentEffect> = new Map();
  private lastUpdateTime: number = 0;
  private effectIdCounter: number = 0;

  constructor(config?: Partial<EnvironmentConfig>) {
    this.config = {
      aurora: {
        minIntensity: 0.2,
        maxIntensity: 0.5,
        minDuration: 30, // 30 секунд
        maxDuration: 120, // 2 хвилини
        spawnChance: 0.1, // 10% шанс за хвилину
        maxActiveEffects: 3
      },
      updateInterval: 1000, // оновлення кожну секунду
      timeOfDay: 0.0, // північ
      ...config
    };
  }

  /**
   * Оновлення логіки ефектів
   */
  update(): void {
    const now = Date.now();
    
    // Оновлюємо не частіше ніж кожні updateInterval мс
    if (now - this.lastUpdateTime < this.config.updateInterval) {
      return;
    }
    
    this.lastUpdateTime = now;
    
    // Видаляємо застарілі ефекти
    this.cleanupExpiredEffects(now);
    
    // Генеруємо нові ефекти
    this.generateNewEffects(now);
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
    return this.getActiveEffects()
      .filter(effect => effect.type === 'aurora') as AuroraEffect[];
  }

  /**
   * Встановити час доби (0.0 = північ, 0.5 = полудень, 1.0 = північ)
   */
  setTimeOfDay(timeOfDay: number): void {
    this.config.timeOfDay = Math.max(0, Math.min(1, timeOfDay));
  }

  /**
   * Отримати поточний час доби
   */
  getTimeOfDay(): number {
    return this.config.timeOfDay;
  }

  /**
   * Чи є зараз "ніч" (полярне сяйво видиме)
   */
  isNightTime(): boolean {
    // Полярне сяйво видиме вночі (0.0-0.25 та 0.75-1.0)
    return this.config.timeOfDay < 0.25 || this.config.timeOfDay > 0.75;
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

  private cleanupExpiredEffects(now: number): void {
    for (const [id, effect] of this.activeEffects.entries()) {
      const elapsed = (now - effect.startTime) / 1000; // секунди
      if (elapsed >= effect.duration) {
        this.activeEffects.delete(id);
      }
    }
  }

  private generateNewEffects(now: number): void {
    // Генеруємо полярне сяйво тільки вночі
    if (this.isNightTime()) {
      this.generateAuroraEffect(now);
    }
  }

  private generateAuroraEffect(now: number): void {
    const auroraConfig = this.config.aurora;
    
    // Перевіряємо чи не забагато активних ефектів
    const currentAuroraCount = this.getAuroraEffects().length;
    if (currentAuroraCount >= auroraConfig.maxActiveEffects) {
      return;
    }

    // Випадковий шанс генерації
    if (Math.random() > 60*auroraConfig.spawnChance / 60) { // нормалізуємо до секунди
      return;
    }

    // Генеруємо нове полярне сяйво
    const aurora: AuroraEffect = {
      id: `aurora_${++this.effectIdCounter}`,
      type: 'aurora',
      intensity: this.randomBetween(auroraConfig.minIntensity, auroraConfig.maxIntensity),
      position: this.generateAuroraPosition(),
      duration: this.randomBetween(auroraConfig.minDuration, auroraConfig.maxDuration),
      startTime: now,
      
      // Кольори полярного сяйва
      primaryColor: this.generateAuroraColor(),
      secondaryColor: this.generateAuroraColor(),
      
      // Параметри руху
      waveSpeed: this.randomBetween(0.5, 2.0),
      waveAmplitude: this.randomBetween(0.3, 0.8),
      
      // Розміри
      width: this.randomBetween(350, 750),
      height: this.randomBetween(160, 320),
      
      // Напрямок руху
      direction: Math.random() * Math.PI * 2
    };
    console.log('AuroraGenerated: ', aurora);
    this.activeEffects.set(aurora.id, aurora);
  }

  private generateAuroraPosition(): { x: number; y: number; z: number } {
    // Полярне сяйво з'являється на фіксованій відстані 400 від центру
    const distance = 400; // фіксована відстань від центру
    const azimuth = Math.random() * Math.PI * 2; // рандомізований азимутальний кут (0-2π)
    
    return {
      x: Math.cos(azimuth) * distance, // X координата на колі
      y: this.randomBetween(10, 40),   // високо в небі
      z: Math.sin(azimuth) * distance   // Z координата на колі
    };
  }

  private generateAuroraColor(): { r: number; g: number; b: number } {
    // Типові кольори полярного сяйва
    const colors = [
      { r: 0.0, g: 1.0, b: 0.5 },   // зелений
      { r: 0.0, g: 0.8, b: 1.0 },   // блакитний
      { r: 0.7, g: 0.6, b: 1.0 },   // фіолетовий
      { r: 1.0, g: 1.0, b: 0.0 },   // жовтий
      { r: 0.5, g: 0.0, b: 1.0 }    // синій
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
