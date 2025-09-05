// Новий фабричний підхід (поруч зі старим кодом)
import { Game } from './game';
import { GameContainer } from './GameContainer';

export interface GameConfig {
  testing?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class GameFactory {
  /**
   * Створює новий екземпляр гри (для тестів і майбутнього)
   * Поки що просто обгортка навколо існуючого синглтону
   */
  static create(config?: GameConfig): Game {
    // Поки що повертаємо синглтон для сумісності
    const game = Game.getInstance();
    
    if (config?.testing) {
      // В майбутньому тут буде створення тестової версії
      console.log('[GameFactory] Testing mode enabled');
    }
    
    return game;
  }

  /**
   * Для тестів - створює ізольований контейнер
   */
  static createTestContainer(): GameContainer {
    return new GameContainer();
  }
}
