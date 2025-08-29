export class GameContainer {
  private static instance: GameContainer;
  private factories = new Map<string, () => any>();
  private instances = new Map<string, any>();
  
  static getInstance(): GameContainer {
    if (!GameContainer.instance) {
      GameContainer.instance = new GameContainer();
    }
    return GameContainer.instance;
  }
  
  /**
   * Реєструє фабрику для створення сервісу
   */
  register<T>(name: string, factory: () => T): void {
    this.factories.set(name, factory);
  }
  
  /**
   * Отримує сервіс (створює якщо потрібно)
   */
  get<T>(name: string): T {
    // Singleton pattern - створюємо тільки один раз
    if (!this.instances.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new Error(`Service ${name} not registered: ${name}`);
      }
      this.instances.set(name, factory());
    }
    return this.instances.get(name);
  }
  
  /**
   * Перевіряє чи зареєстрований сервіс
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }
  
  /**
   * Очищає всі інстанси (корисно для тестів)
   */
  clear(): void {
    this.instances.clear();
  }
  
  /**
   * Отримує список всіх зареєстрованих сервісів
   */
  getRegisteredServices(): string[] {
    return Array.from(this.factories.keys());
  }
}
