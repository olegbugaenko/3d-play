import { MapLogic } from '@map/map-logic';
import { ResourceManager } from '@resources/ResourceManager';
import { DroneManager } from '@drones/DroneManager';
import { CommandSystem } from '@commands/CommandSystem';
import { CommandGroupSystem } from '@commands/CommandGroupSystem';
import { SaveManager } from '@save-load/save-manager';
import { BonusSystem } from '@modifiers/BonusSystem';
import { UpgradesManager } from '@upgrades/UpgradesManager';
import { BuildingsManager } from '@buildings/BuildingsManager';
import { SceneLogic } from '@scene/scene-logic';
import { DynamicsLogic } from '@scene/dynamics-logic';
import { initEffects } from '@shared/effects';
import { GameContainer } from './GameContainer';
import { ISceneLogic, IResourceManager, IBonusSystem, IBuildingsManager, IUpgradesManager, IDroneManager, ICommandSystem, IMapLogic, ICommandGroupSystem, ISaveManager } from '../../interfaces/index';


export class Game {
  private static instance: Game;
  private container: GameContainer;
  
  // Основні менеджери
  public readonly mapLogic: IMapLogic;
  public readonly resourceManager: IResourceManager;
  public readonly droneManager: IDroneManager;
  public readonly commandSystem: ICommandSystem;
  public readonly commandGroupSystem: ICommandGroupSystem;
  public readonly saveManager: ISaveManager;
  
  // Система бонусів та модифікаторів
  public readonly bonusSystem: IBonusSystem;
  public readonly upgradesManager: IUpgradesManager;
  public readonly buildingsManager: IBuildingsManager;
  
  // Логіка сцени
  public readonly sceneLogic: ISceneLogic;
  public readonly dynamicsLogic: DynamicsLogic;

  /**
   * Реєструє всі сервіси в контейнері
   */
  private registerServices(): void {
    // Реєструємо базові сервіси
    this.container.register('sceneLogic', () => new SceneLogic());
    this.container.register('bonusSystem', () => new BonusSystem());
    
    // Реєструємо сервіси з залежностями
    this.container.register('dynamicsLogic', () => new DynamicsLogic(this.container.get('sceneLogic')));
    this.container.register('resourceManager', () => new ResourceManager(this.container.get('bonusSystem')));
    
    // Реєструємо менеджери
    this.container.register('upgradesManager', () => new UpgradesManager(
      this.container.get('bonusSystem'), 
      this.container.get('resourceManager')
    ));
    
    this.container.register('buildingsManager', () => new BuildingsManager(
      this.container.get('bonusSystem'), 
      this.container.get('sceneLogic')
    ));
    
    this.container.register('droneManager', () => new DroneManager(
      this.container.get('bonusSystem'), 
      this.container.get('sceneLogic')
    ));
    
    // Реєструємо MapLogic (потребує всі попередні сервіси)
    this.container.register('mapLogic', () => new MapLogic(
      this.container.get('sceneLogic'),
      this.container.get('dynamicsLogic'),
      this.container.get('resourceManager'),
      this.container.get('buildingsManager'),
      this.container.get('upgradesManager'),
      this.container.get('droneManager')
    ));
    
    // Реєструємо командні системи
    this.container.register('commandSystem', () => new CommandSystem(
      this.container.get('mapLogic')
    ));
    
    this.container.register('commandGroupSystem', () => new CommandGroupSystem(
      this.container.get('commandSystem'),
      this.container.get('mapLogic')
    ));
    
    // Реєструємо SaveManager останнім
    this.container.register('saveManager', () => new SaveManager(
      this.container.get('mapLogic')
    ));
  }

  private constructor() {
    console.log('[Game] Initializing...');
    
    // Ініціалізуємо контейнер
    this.container = GameContainer.getInstance();
    
    // Реєструємо всі сервіси в контейнері
    this.registerServices();
    
    // Отримуємо сервіси з контейнера
    this.sceneLogic = this.container.get('sceneLogic');
    this.dynamicsLogic = this.container.get('dynamicsLogic');
    this.bonusSystem = this.container.get('bonusSystem');
    this.resourceManager = this.container.get('resourceManager');
    this.upgradesManager = this.container.get('upgradesManager');
    this.buildingsManager = this.container.get('buildingsManager');
    this.droneManager = this.container.get('droneManager');
    this.mapLogic = this.container.get('mapLogic');
    this.commandSystem = this.container.get('commandSystem');
    this.commandGroupSystem = this.container.get('commandGroupSystem');
    this.saveManager = this.container.get('saveManager');

    this.mapLogic.setCommandSystems(this.commandSystem, this.commandGroupSystem);
    
    // Реєструємо менеджери в SaveManager
    this.saveManager.registerManager('mapLogic', this.mapLogic);
    this.saveManager.registerManager('resourceManager', this.resourceManager);
    this.saveManager.registerManager('droneManager', this.droneManager);
    this.saveManager.registerManager('commandSystem', this.commandSystem);
    this.saveManager.registerManager('commandGroupSystem', this.commandGroupSystem);
    this.saveManager.registerManager('upgradesManager', this.upgradesManager);
    this.saveManager.registerManager('buildingsManager', this.buildingsManager);

    initEffects(this.bonusSystem)
    
    // Викликаємо beforeInit для всіх менеджерів, якщо він існує
    if ('beforeInit' in this.resourceManager) {
      (this.resourceManager as any).beforeInit();
    }
    if ('beforeInit' in this.droneManager) {
      (this.droneManager as any).beforeInit();
    }
    if ('beforeInit' in this.commandSystem) {
      (this.commandSystem as any).beforeInit();
    }
    if ('beforeInit' in this.commandGroupSystem) {
      (this.commandGroupSystem as any).beforeInit();
    }
    if ('beforeInit' in this.upgradesManager) {
      (this.upgradesManager as any).beforeInit();
    }
    if ('beforeInit' in this.buildingsManager) {
      (this.buildingsManager as any).beforeInit();
    }
    
    // Будуємо граф залежностей для системи бонусів
    this.bonusSystem.buildDependencyGraph();
    
    console.log('[Game] Initialized successfully');
  }

  public static getInstance(): Game {
    if (!Game.instance) {
      Game.instance = new Game();
    }
    return Game.instance;
  }
  
  /**
   * Отримує контейнер сервісів (корисно для тестування)
   */
  public getContainer(): GameContainer {
    return this.container;
  }

  public newGame(): void {
    console.log('[Game] Starting new game...');
    

    
    // Ініціалізуємо нову гру

    this.resourceManager.reset();
    this.droneManager.reset();
    this.commandSystem.reset();
    this.commandGroupSystem.reset();
    this.upgradesManager.reset();
    this.buildingsManager.reset();
    this.mapLogic.newGame();
    
    // Запускаємо тіки після ініціалізації
    this.startTicks();
    
    console.log('[Game] New game started');
  }

  public loadGame(slotId: number): boolean {
    console.log(`[Game] Loading game from slot ${slotId}...`);
    
    this.resourceManager.reset();
    this.droneManager.reset();
    this.commandSystem.reset();
    this.commandGroupSystem.reset();
    this.upgradesManager.reset();
    this.buildingsManager.reset();
    
    // Завантажуємо гру
    this.saveManager.loadGame(slotId);
    
    // Запускаємо тіки після завантаження
    this.startTicks();
    
    console.log(`[Game] Game loaded from slot ${slotId}`);
    return true;
  }

  public saveGame(slotId: number): void {
    console.log(`[Game] Saving game to slot ${slotId}...`);
    
    // Зберігаємо гру
    this.saveManager.saveGame(slotId);
    
    console.log(`[Game] Game saved to slot ${slotId}`);
  }

  public getSaveSlots(): Array<{ slot: number; timestamp: number; hasData: boolean }> {
    return this.saveManager.getSaveSlots();
  }

  public deleteSlot(slotId: number): boolean {
    console.log(`[Game] Deleting save slot ${slotId}...`);
    const success = this.saveManager.deleteSlot(slotId);
    if (success) {
      console.log(`[Game] Save slot ${slotId} deleted successfully`);
    } else {
      console.error(`[Game] Failed to delete save slot ${slotId}`);
    }
    return success;
  }

  /**
   * Ініціалізує гру (викликається з App.tsx)
   */
  public initGame(): void {
    console.log('[Game] Initializing game...');
    
    // Тут можна додати додаткову логіку ініціалізації, якщо потрібно
    // Наприклад, завантаження початкових даних, налаштування UI тощо
    
    console.log('[Game] Game initialized successfully');
  }

  /**
   * Оновлює стан гри (викликається кожен тік)
   */
  public tick(dT: number): void {
    // Оновлюємо ресурси
    this.resourceManager.tick(dT);
    
    // Оновлюємо логіку карти
    this.mapLogic.tick(dT);
  }

  /**
   * Запускає автоматичні тіки гри
   */
  public startTicks(): void {
    console.log('[Game] Starting automatic ticks...');
    this.dynamicsLogic.setEnabled(true);
    // Запускаємо тік кожні 1000мс (1 секунда)
    setInterval(() => {
      this.tick(0.1);
    }, 100);
    
    console.log('[Game] Automatic ticks started');
  }
}
