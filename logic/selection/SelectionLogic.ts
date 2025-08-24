import { TSceneObject } from '../scene/scene.types';
import { SceneLogic } from '../scene/scene-logic';

export class SelectionLogic {
    private selectedObjects: Set<string> = new Set();
    
    constructor(private scene: SceneLogic) {}
    
    /**
     * Вибирає об'єкт
     */
    selectObject(objectId: string): void {
        this.selectedObjects.add(objectId);
    }
    
    /**
     * Знімає вибір з об'єкта
     */
    deselectObject(objectId: string): void {
        this.selectedObjects.delete(objectId);
    }
    
    /**
     * Знімає вибір з усіх об'єктів
     */
    deselectAll(): void {
        this.selectedObjects.clear();
    }
    
    /**
     * Перевіряє чи вибраний об'єкт
     */
    isSelected(objectId: string): boolean {
        return this.selectedObjects.has(objectId);
    }
    
    /**
     * Отримує всі вибрані об'єкти
     */
    getSelectedObjects(): string[] {
        return Array.from(this.selectedObjects);
    }
    
    /**
     * Отримує кількість вибраних об'єктів
     */
    getSelectedCount(): number {
        return this.selectedObjects.size;
    }
    
    /**
     * Знаходить об'єкти з якими можна взаємодіяти
     */
    findInteractableObjects(): TSceneObject[] {
        if (this.selectedObjects.size === 0) return [];

        // 1. Отримуємо унікальні команди доступні вибраним юнітам
        const availableCommands = this.listAvailableCommands();
        
        // 2. Запитуємо сцену з фільтром по командах
        const intr = this.scene.getVisibleObjects({ 
            filterByCommands: availableCommands 
        });

        return intr;
    }
    
    /**
     * Отримує унікальні команди доступні вибраним юнітам
     */
    private listAvailableCommands(): Set<string> {
        const commands = new Set<string>();
        
        this.selectedObjects.forEach(unitId => {
            const unit = this.scene.getObjectById(unitId);
            if (unit?.commandType) {
                unit.commandType.forEach((cmd: string) => commands.add(cmd));
            }
        });
        
        return commands;
    }
}
