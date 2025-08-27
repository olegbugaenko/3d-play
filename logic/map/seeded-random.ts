/**
 * Клас для детермінованої генерації випадкових чисел на основі seed
 * Використовує алгоритм xorshift для швидкої та якісної генерації
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Переконуємося що seed не 0 (це дає погані результати)
    this.state = seed === 0 ? 1 : Math.abs(seed);
  }

  /**
   * Генерує наступне випадкове число в діапазоні [0, 1)
   */
  next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >> 17;
    this.state ^= this.state << 5;
    
    // Нормалізуємо до [0, 1)
    return (this.state >>> 0) / 4294967295;
  }

  /**
   * Генерує випадкове число в діапазоні [min, max)
   */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Генерує випадкове ціле число в діапазоні [min, max]
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat(min, max + 1));
  }

  /**
   * Вибирає випадковий елемент з масиву
   */
  pick<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Генерує випадковий колір з палітри
   */
  nextColor(colors: number[]): number {
    return this.pick(colors);
  }

  /**
   * Генерує випадкову позицію в межах кластера
   */
  nextPositionInCluster(centerX: number, centerZ: number, radius: number): { x: number; z: number } {
    const angle = this.nextFloat(0, Math.PI * 2);
    const distance = this.nextFloat(0, radius);
    
    return {
      x: centerX + Math.cos(angle) * distance,
      z: centerZ + Math.sin(angle) * distance
    };
  }

  /**
   * Отримує поточний стан для дебагу
   */
  getState(): number {
    return this.state;
  }

  /**
   * Встановлює новий стан (корисно для відновлення)
   */
  setState(state: number): void {
    this.state = state;
  }
}
