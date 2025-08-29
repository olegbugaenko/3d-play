import { MapLogic } from './map/map-logic';
import { ResourceManager } from './resources/ResourceManager';
import { DroneManager } from './drones/DroneManager';
import { CommandSystem } from './commands/CommandSystem';
import { CommandGroupSystem } from './commands/CommandGroupSystem';
import { SaveManager } from './save-load/save-manager';
import { BonusSystem } from './modifiers-system/BonusSystem';
import { UpgradesManager } from './upgrades/UpgradesManager';
import { BuildingsManager } from './buildings/BuildingsManager';
import { SceneLogic } from './scene/scene-logic';
import { DynamicsLogic } from './scene/dynamics-logic';
import { initEffects } from './general/effects';


export class Game {
  private static instance: Game;
  
  // Основні менеджери
  public readonly mapLogic: MapLogic;
  public readonly resourceManager: ResourceManager;
  public readonly droneManager: DroneManager;
  public readonly commandSystem: CommandSystem;
  public readonly commandGroupSystem: CommandGroupSystem;
  public readonly saveManager: SaveManager;
  
  // Система бонусів та модифікаторів
  public readonly bonusSystem: BonusSystem;
  public readonly upgradesManager: UpgradesManager;
  public readonly buildingsManager: BuildingsManager;
  
  // Логіка сцени
  public readonly sceneLogic: SceneLogic;
  public readonly dynamicsLogic: DynamicsLogic;

  private constructor() {
    console.log('[Game] Initializing...');
    
    // Ініціалізуємо логіку сцени першою
    this.sceneLogic = new SceneLogic();
    this.dynamicsLogic = new DynamicsLogic(this.sceneLogic);
    
    // Ініціалізуємо систему бонусів
    this.bonusSystem = new BonusSystem();
    
    // Ініціалізуємо основні менеджери
    this.resourceManager = new ResourceManager(this.bonusSystem);
    
    // Ініціалізуємо менеджери апгрейдів та будівель
    this.upgradesManager = new UpgradesManager(this.bonusSystem, this.resourceManager);
    this.buildingsManager = new BuildingsManager(this.bonusSystem, this.sceneLogic);
    this.droneManager = new DroneManager(this.bonusSystem, this.sceneLogic);
    this.mapLogic = new MapLogic(this.sceneLogic, this.dynamicsLogic, this.resourceManager, this.buildingsManager, this.upgradesManager, this.droneManager);
    this.commandSystem = new CommandSystem(this.mapLogic);
    this.commandGroupSystem = new CommandGroupSystem(this.commandSystem, this.mapLogic);

    this.mapLogic.setCommandSystems(this.commandSystem, this.commandGroupSystem);
    
    // Ініціалізуємо SaveManager останнім
    this.saveManager = new SaveManager(this.mapLogic);
    
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
