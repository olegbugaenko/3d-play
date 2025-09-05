import { Logger } from '../../shared/ErrorService';
import { Result, success, failure } from '../../shared/Result';

// Типізовані ключі сервісів
export type ServiceKey = 
  | 'sceneLogic'
  | 'bonusSystem'
  | 'dynamicsLogic'
  | 'resourceManager'
  | 'requirementsSystem'
  | 'upgradesManager'
  | 'buildingsManager'
  | 'droneManager'
  | 'mapLogic'
  | 'commandSystem'
  | 'commandGroupSystem'
  | 'saveManager';

// Мапа типів сервісів
export interface ServiceTypeMap {
  sceneLogic: import('../../systems/scene/scene-logic').SceneLogic;  // Конкретний клас
  bonusSystem: import('../../interfaces/IBonusSystem').IBonusSystem;
  dynamicsLogic: import('../../systems/scene/dynamics-logic').DynamicsLogic;
  resourceManager: import('../../interfaces/IResourceManager').IResourceManager;
  requirementsSystem: import('../../interfaces/IRequirementsSystem').IRequirementsSystem;
  upgradesManager: import('../../interfaces/IUpgradesManager').IUpgradesManager;
  buildingsManager: import('../../interfaces/IBuildingsManager').IBuildingsManager;
  droneManager: import('../../interfaces/IDroneManager').IDroneManager;
  mapLogic: import('../../systems/map/map-logic').MapLogic;  // Конкретний клас
  commandSystem: import('../../interfaces/ICommandSystem').ICommandSystem;
  commandGroupSystem: import('../../interfaces/ICommandGroupSystem').ICommandGroupSystem;
  saveManager: import('../../interfaces/ISaveManager').ISaveManager;
}

export class GameContainer {
  private static instance: GameContainer;
  private factories = new Map<ServiceKey, () => any>();
  private instances = new Map<ServiceKey, any>();
  
  static getInstance(): GameContainer {
    if (!GameContainer.instance) {
      GameContainer.instance = new GameContainer();
    }
    return GameContainer.instance;
  }
  
  /**
   * Реєструє фабрику для створення сервісу з type safety
   */
  register<K extends ServiceKey>(name: K, factory: () => ServiceTypeMap[K]): void {
    this.factories.set(name, factory);
  }
  
  /**
   * Отримує сервіс з правильним типом (legacy метод для сумісності)
   * @returns Інстанс сервісу або throws Error
   */
  get<K extends ServiceKey>(name: K): ServiceTypeMap[K] {
    // Singleton pattern - створюємо тільки один раз
    if (!this.instances.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        const available = Array.from(this.factories.keys()).join(', ');
        Logger.error('GameContainer', `Service '${name}' not registered`, { available });
        throw new Error(`Service '${name}' not registered. Available services: ${available}`);
      }
      this.instances.set(name, factory());
    }
    return this.instances.get(name)!;
  }

  /**
   * Отримує сервіс з правильним типом (новий Result-based метод)
   * @returns Result з інстансом сервісу або помилкою
   */
  getResult<K extends ServiceKey>(name: K): Result<ServiceTypeMap[K], string> {
    // Singleton pattern - створюємо тільки один раз
    if (!this.instances.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        const available = Array.from(this.factories.keys()).join(', ');
        Logger.error('GameContainer', `Service '${name}' not registered`, { available });
        return failure(`Service '${name}' not registered. Available services: ${available}`);
      }
      this.instances.set(name, factory());
    }
    return success(this.instances.get(name)!);
  }
  
  /**
   * Перевіряє чи зареєстрований сервіс
   */
  has(name: ServiceKey): boolean {
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
  getRegisteredServices(): ServiceKey[] {
    return Array.from(this.factories.keys());
  }
  
  /**
   * Валідує що всі потрібні сервіси зареєстровані
   */
  validateServices(): { isValid: boolean; missing: ServiceKey[] } {
    const requiredServices: ServiceKey[] = [
      'sceneLogic', 'bonusSystem', 'dynamicsLogic', 'resourceManager',
      'upgradesManager', 'buildingsManager', 'droneManager', 'mapLogic',
      'commandSystem', 'commandGroupSystem', 'saveManager'
    ];
    
    const missing = requiredServices.filter(service => !this.has(service));
    return {
      isValid: missing.length === 0,
      missing
    };
  }
}
