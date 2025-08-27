import { SeededRandom } from './seeded-random';
import { MapGenerationTracker } from './map-generation-state';

/**
 * Простий тест для перевірки роботи seed системи
 */
export function testSeedSystem() {
    console.log('=== Тестування Seed системи ===');
    
    // Тест 1: Однаковий seed дає однакові результати
    const seed1 = 12345;
    const rng1a = new SeededRandom(seed1);
    const rng1b = new SeededRandom(seed1);
    
    console.log('Тест 1: Однаковий seed');
    console.log('RNG1A:', rng1a.next(), rng1a.next(), rng1a.next());
    console.log('RNG1B:', rng1b.next(), rng1b.next(), rng1b.next());
    
    // Тест 2: Різні seed дають різні результати
    const seed2 = 67890;
    const rng2 = new SeededRandom(seed2);
    
    console.log('\nТест 2: Різні seed');
    console.log('RNG1A:', rng1a.next(), rng1a.next(), rng1a.next());
    console.log('RNG2:', rng2.next(), rng2.next(), rng2.next());
    
    // Тест 3: MapGenerationTracker
    const tracker = new MapGenerationTracker(seed1);
    console.log('\nТест 3: MapGenerationTracker');
    console.log('Початковий seed:', tracker.getSeed());
    console.log('Зібрані ресурси:', tracker.getCollectedResources('stone'));
    
    // Позначаємо ресурс як зібраний
    tracker.markResourceCollected(0, 'stone');
    console.log('Після збору ресурсу:', tracker.getCollectedResources('stone'));
    
    // Тест 4: Перевірка зібраних ресурсів
    console.log('\nТест 4: Перевірка зібраних ресурсів');
    console.log('Ресурс 0,0 зібраний:', tracker.isResourceCollected(0, 0));
    console.log('Ресурс 0,1 зібраний:', tracker.isResourceCollected(0, 1));
    
    // Тест 5: Збереження/завантаження стану
    const saveState = tracker.getSaveState();
    console.log('\nТест 5: Збереження/завантаження');
    console.log('Збережений стан:', saveState);
    
    const newTracker = new MapGenerationTracker(999);
    newTracker.loadSaveState(saveState);
    console.log('Завантажений seed:', newTracker.getSeed());
    console.log('Завантажені ресурси:', newTracker.getCollectedResources('stone'));
    
    console.log('\n=== Тестування завершено ===');
}

// Експортуємо для можливості виклику з консолі
if (typeof window !== 'undefined') {
    (window as any).testSeedSystem = testSeedSystem;
}
