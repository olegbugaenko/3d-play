// Приклади використання ResourceManager
import { ResourceManager, ResourceChange } from './index';

// Створюємо менеджер ресурсів з початковими ресурсами
const resourceManager = new ResourceManager({
  energy: 100,
  stone: 50,
  ore: 25
});

// === ПРИКЛАД 1: Перевірка ресурсів ===
console.log('=== Перевірка ресурсів ===');

const checkResult = resourceManager.checkResources({
  energy: 150,
  stone: 80,
  ore: 30
});

console.log('Результат перевірки:', checkResult);
console.log('Можемо купити?', checkResult.isAffordable);
console.log('Загальний прогрес:', Math.round(checkResult.progress * 100) + '%');

// Показуємо деталі по кожному ресурсу
Object.entries(checkResult.resources).forEach(([id, status]) => {
  console.log(`${id}: ${status.own}/${status.required} (${Math.round(status.progress * 100)}%)`);
});

// === ПРИКЛАД 2: Додавання ресурсів ===
console.log('\n=== Додавання ресурсів ===');

const addChanges: ResourceChange[] = [
  { resourceId: 'energy', amount: 200, reason: 'solar_panel' },
  { resourceId: 'stone', amount: 100, reason: 'mining' },
  { resourceId: 'ore', amount: 50, reason: 'drilling' }
];

const added = resourceManager.addResources(addChanges);
console.log('Додано ресурсів:', added);

// === ПРИКЛАД 3: Витрата ресурсів ===
console.log('\n=== Витрата ресурсів ===');

const spendChanges: ResourceChange[] = [
  { resourceId: 'energy', amount: -50, reason: 'building_construction' },
  { resourceId: 'stone', amount: -30, reason: 'building_construction' },
  { resourceId: 'ore', amount: -20, reason: 'building_construction' }
];

const spent = resourceManager.spendResources(spendChanges);
console.log('Витрачено ресурсів:', spent);

// === ПРИКЛАД 4: Поточний стан ===
console.log('\n=== Поточний стан ===');

const currentResources = resourceManager.getAllResources();
Object.entries(currentResources).forEach(([id, amount]) => {
  const capacity = resourceManager.getResourceCapacity(id as any);
  const progress = resourceManager.getResourceProgress(id as any);
  console.log(`${id}: ${amount}/${capacity} (${Math.round(progress * 100)}%)`);
});

// === ПРИКЛАД 5: Статистика ===
console.log('\n=== Статистика ===');

const stats = resourceManager.getStats();
console.log('Загальна кількість ресурсів:', stats.totalResources);
console.log('Загальна ємність:', stats.totalCapacity);
console.log('Використання:', Math.round(stats.utilization * 100) + '%');

// === ПРИКЛАД 6: Історія змін ===
console.log('\n=== Історія змін (останні 5) ===');

const history = resourceManager.getHistory(5);
history.forEach(entry => {
  const date = new Date(entry.timestamp).toLocaleTimeString();
  const sign = entry.amount >= 0 ? '+' : '';
  console.log(`${date}: ${sign}${entry.amount} ${entry.resourceId} (${entry.reason}) -> ${entry.balance}`);
});
