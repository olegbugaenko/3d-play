import { MapLogic } from './map/map-logic';
import { SaveManager } from './save-load/save-manager';
import { ResourceManager } from './resources';
import { CommandSystem } from './commands';
import { CommandGroupSystem } from './commands/CommandGroupSystem';
import { DroneManager } from './drones';
import { SceneLogic } from './scene/scene-logic';
import { DynamicsLogic } from './scene/dynamics-logic';
import { TCameraProps } from '../shared/camera.types';

export class Game {
    private static instance: Game;
    
    public mapLogic!: MapLogic;
    public saveManager!: SaveManager;
    public resourceManager!: ResourceManager;
    public commandSystem!: CommandSystem;
    public commandGroupSystem!: CommandGroupSystem;
    public droneManager!: DroneManager;
    public sceneLogic!: SceneLogic;
    public dynamicsLogic!: DynamicsLogic;
    
    private constructor() {}
    
    public static getInstance(): Game {
        if (!Game.instance) {
            Game.instance = new Game();
        }
        return Game.instance;
    }
    
    /**
     * Перевіряє чи всі менеджери ініціалізовані
     */
    private checkInitialization(): void {
        if (!this.saveManager || !this.mapLogic || !this.resourceManager || 
            !this.commandSystem || !this.commandGroupSystem || !this.droneManager) {
            throw new Error('Game is not initialized. Call initGame() first.');
        }
    }
    
    /**
     * Ініціалізує гру - створює всі менеджери та інжектить залежності
     */
    public initGame(): void {
        // Створюємо базові системи
        this.sceneLogic = new SceneLogic();
        this.dynamicsLogic = new DynamicsLogic(this.sceneLogic);
        
        // Створюємо менеджер ресурсів
        this.resourceManager = new ResourceManager();
        
        // Створюємо MapLogic з залежностями (CommandSystem створюється всередині MapLogic)
        this.mapLogic = new MapLogic(
            this.sceneLogic,
            this.dynamicsLogic,
            this.resourceManager
        );
        
        // Отримуємо CommandSystem та DroneManager з MapLogic
        this.commandSystem = this.mapLogic.commandSystem;
        this.droneManager = this.mapLogic.droneManager;
        
        // Створюємо CommandGroupSystem
        this.commandGroupSystem = this.mapLogic.commandGroupSystem;
        
        // Створюємо SaveManager з MapLogic
        this.saveManager = new SaveManager(this.mapLogic);
        
        // Реєструємо всі менеджери в SaveManager
        this.saveManager.registerManager('mapLogic', this.mapLogic);
        this.saveManager.registerManager('droneManager', this.droneManager);
        this.saveManager.registerManager('resourceManager', this.resourceManager);
        this.saveManager.registerManager('commandSystem', this.commandSystem);
        this.saveManager.registerManager('commandGroupSystem', this.commandGroupSystem);
    }
    
    /**
     * Починає нову гру
     */
    public newGame(): void {
        console.warn('New Game');
        this.checkInitialization();
        
        // Скидаємо всі менеджери (MapLogic.reset() тепер не викликає initialize)
        this.saveManager.newGame();
        

        
        // Створюємо дронів для нової гри
        this.mapLogic.newGame();
        this.dynamicsLogic.setEnabled(true);
        
    }
    
    /**
     * Завантажує гру зі слоту
     */
    public loadGame(slot: number): boolean {
        this.checkInitialization();
        
        // Ініціалізуємо тільки базову карту (viewport) без генерації об'єктів
        this.mapLogic.initializeBaseMap({
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            fov: 75,
            aspect: 1,
            distance: 10
        });
        
        // Завантажуємо дані через SaveManager (це згенерує terrain, boulders, rocks з правильним seed)
        const success = this.saveManager.loadGame(slot);
        
        if (success) {
            this.dynamicsLogic.setEnabled(true);
        }
        
        return success;
    }
    
    /**
     * Зберігає гру в слот
     */
    public saveGame(slot: number): boolean {
        this.checkInitialization();
        return this.saveManager.saveGame(slot);
    }
    
    /**
     * Отримує список слотів збереження
     */
    public getSaveSlots() {
        this.checkInitialization();
        return this.saveManager.getSaveSlots();
    }
    
    /**
     * Видаляє слот збереження
     */
    public deleteSlot(slot: number): boolean {
        this.checkInitialization();
        return this.saveManager.deleteSlot(slot);
    }
}
