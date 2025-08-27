import { SaveManager } from './save-manager';
import { SaveLoadManager } from './save-load.types';

// Тестовий менеджер для перевірки
class TestManager implements SaveLoadManager {
    private data: any = { test: 'value' };
    
    save(): any {
        return this.data;
    }
    
    load(data: any): void {
        this.data = data;
    }
    
    reset(): void {
        this.data = { test: 'value' };
    }
}

// Функція для тестування
export function testSaveLoadSystem(): void {
    console.log('🧪 Тестуємо Save/Load систему...');
    
    const saveManager = new SaveManager();
    const testManager = new TestManager();
    
    // Реєструємо тестовий менеджер
    saveManager.registerManager('test', testManager);
    
    // Тестуємо збереження
    const saveResult = saveManager.saveGame(1);
    console.log('✅ Збереження:', saveResult ? 'успішно' : 'помилка');
    
    // Тестуємо завантаження
    const loadResult = saveManager.loadGame(1);
    console.log('✅ Завантаження:', loadResult ? 'успішно' : 'помилка');
    
    // Тестуємо нову гру
    saveManager.newGame();
    console.log('✅ Нова гра: створено');
    
    // Тестуємо список слотів
    const slots = saveManager.getSaveSlots();
    console.log('✅ Слоти збереження:', slots);
    
    console.log('🎉 Тестування завершено!');
}
