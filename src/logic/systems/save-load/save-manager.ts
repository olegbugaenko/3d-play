import { GameSave, SaveLoadManager } from './save-load.types';
import { ISaveManager, IMapLogic } from '@interfaces/index';

export class SaveManager implements SaveLoadManager, ISaveManager {
    public managers: Map<string, SaveLoadManager> = new Map();
    public readonly SAVE_KEY_PREFIX = 'game_save_';
    public readonly VERSION = '1.0.0';
    
    constructor(public mapLogic: IMapLogic) {
        // MapLogic передається як залежність при створенні
    }
    
    // Реєструємо менеджер
    registerManager(name: string, manager: SaveLoadManager): void {
        this.managers.set(name, manager);
    }
    
    // Зберігаємо гру в слот
    saveGame(slot: number): boolean {
        try {
            const saveData: GameSave = {
                slot,
                timestamp: Date.now(),
                version: this.VERSION,
                
                // Збираємо дані з усіх менеджерів
                resourceManager: this.managers.get('resourceManager')?.save() as any,
                mapLogic: this.managers.get('mapLogic')?.save() as any,
                commandSystem: this.managers.get('commandSystem')?.save() as any,
                commandGroupSystem: this.managers.get('commandGroupSystem')?.save() as any,
                droneManager: this.managers.get('droneManager')?.save() as any,
                upgradesManager: this.managers.get('upgradesManager')?.save() as any,
                buildingsManager: this.managers.get('buildingsManager')?.save() as any,
            };
            
            // Зберігаємо в localStorage
            const key = this.SAVE_KEY_PREFIX + slot;
            localStorage.setItem(key, JSON.stringify(saveData));
            
            return true;
        } catch (error) {
            console.error('Помилка збереження:', error);
            return false;
        }
    }
    
    // Завантажуємо гру зі слоту
    loadGame(slot: number): boolean {
        try {
            const key = this.SAVE_KEY_PREFIX + slot;
            const saveDataJson = localStorage.getItem(key);
            
            if (!saveDataJson) {
                console.error('Слот не знайдено:', slot);
                return false;
            }
            
            const saveData: GameSave = JSON.parse(saveDataJson);
            
            // Валідуємо версію
            if (saveData.version !== this.VERSION) {
                console.warn('Версія збереження не співпадає:', saveData.version);
            }
            
            // Завантажуємо дані в менеджери з урахуванням залежностей
            const loadOrder = this.getLoadOrder();
            
            for (const managerName of loadOrder) {
                const manager = this.managers.get(managerName);
                const data = saveData[managerName as keyof GameSave];
                
                if (manager && data && typeof data === 'object') {
                    manager.load(data as any);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Помилка завантаження:', error);
            return false;
        }
    }
    
    // Починаємо нову гру
    newGame(): void {
        // Скидаємо всі менеджери
        this.managers.forEach(manager => manager.reset());
    }


    
    // Отримуємо список слотів
    getSaveSlots(): Array<{ slot: number; timestamp: number; hasData: boolean }> {
        const slots: Array<{ slot: number; timestamp: number; hasData: boolean }> = [];
        
        for (let i = 1; i <= 5; i++) { // 5 слотів
            const key = this.SAVE_KEY_PREFIX + i;
            const data = localStorage.getItem(key);
            
            if (data) {
                try {
                    const saveData: GameSave = JSON.parse(data);
                    slots.push({
                        slot: i,
                        timestamp: saveData.timestamp,
                        hasData: true
                    });
                } catch {
                    slots.push({ slot: i, timestamp: 0, hasData: false });
                }
            } else {
                slots.push({ slot: i, timestamp: 0, hasData: false });
            }
        }
        
        return slots;
    }
    
    // Видаляємо слот
    deleteSlot(slot: number): boolean {
        try {
            const key = this.SAVE_KEY_PREFIX + slot;
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Помилка видалення слоту:', error);
            return false;
        }
    }

    public getLoadOrder(): string[] {
        return ['mapLogic', 'resourceManager', 'droneManager', 'upgradesManager', 'buildingsManager', 'commandGroupSystem', 'commandSystem'];
    }

    // ==================== SaveLoadManager Implementation ====================

    /**
     * Зберігає стан SaveManager (реалізація інтерфейсу)
     */
    save(): any {
        return {
            managers: Array.from(this.managers.entries()).map(([name, manager]) => ({
                name,
                data: manager.save()
            }))
        };
    }

    /**
     * Завантажує стан SaveManager (реалізація інтерфейсу)
     */
    load(data: any): void {
        if (data.managers) {
            data.managers.forEach((managerData: any) => {
                const manager = this.managers.get(managerData.name);
                if (manager) {
                    manager.load(managerData.data);
                }
            });
        }
    }

    /**
     * Скидає стан SaveManager (реалізація інтерфейсу)
     */
    reset(): void {
        this.managers.clear();
    }
}
