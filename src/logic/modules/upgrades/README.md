# Система Апгрейдів

Система апгрейдів дозволяє гравцям покращувати різні аспекти гри через збір ресурсів та витрату їх на покращення.

## Архітектура

### Основні компоненти

1. **UpgradesManager** - головний менеджер системи апгрейдів
2. **UPGRADES_DB** - база даних типів апгрейдів
3. **BonusSystem** - система бонусів та модифікаторів

### Типи даних

- **UpgradeTypeData** - опис типу апгрейду (назва, опис, максимальний рівень, вартість, модифікатори)
- **UpgradeInstance** - екземпляр апгрейду (ID, тип, рівень, статус розблоковки)

## Доступні апгрейди

### 1. Repair Battery
- **Опис**: Збільшує ємність батареї дронів на 25 на рівень
- **Максимальний рівень**: 10
- **Вартість**: 
  - Stone: 30 + (level - 1) * 15
  - Ore: 15 + (level - 1) * 10
  - Energy: 20 + (level - 1) * 5

### 2. Mining Efficiency
- **Опис**: Збільшує швидкість збору ресурсів на 20% на рівень
- **Максимальний рівень**: 5
- **Вартість**:
  - Stone: 25 + (level - 1) * 12
  - Ore: 20 + (level - 1) * 8

### 3. Storage Capacity
- **Опис**: Збільшує ємність складу ресурсів на 50 на рівень
- **Максимальний рівень**: 8
- **Вартість**:
  - Stone: 40 + (level - 1) * 20
  - Ore: 25 + (level - 1) * 15

## Використання

### Ініціалізація

```typescript
import { UpgradesManager } from './upgrades';

const upgradesManager = new UpgradesManager(bonusSystem);
upgradesManager.beforeInit(); // Завантажує БД та реєструє бонус-сорти
```

### Створення апгрейду

```typescript
// Створюємо екземпляр апгрейду
upgradesManager.setInitialState('battery_1', 'repairBattery', 0, true);

// Підвищуємо рівень
upgradesManager.upgradeLevel('battery_1');

// Розблоковуємо новий апгрейд
upgradesManager.unlockUpgrade('mining_1', 'miningEfficiency');
```

### Збереження/Завантаження

```typescript
// Зберігаємо стан
const savedData = upgradesManager.save();

// Завантажуємо стан
upgradesManager.load(savedData);
```

## Інтеграція з BonusSystem

Кожен апгрейд автоматично реєструється як джерело бонусів в BonusSystem з унікальним ID формату `upgrade_{typeId}`.

При підвищенні рівня апгрейду, BonusSystem автоматично оновлює відповідні модифікатори.

## Тестування

```typescript
import { testUpgradesSystem, testUpgradesDB } from './upgrades';

// Тестуємо всю систему
testUpgradesSystem();

// Тестуємо БД
testUpgradesDB();
```

## Розширення

Для додавання нового апгрейду:

1. Додайте новий тип в `UPGRADES_DB`
2. Визначте формули вартості
3. Налаштуйте модифікатори
4. Додайте UI налаштування

Приклад:

```typescript
['newUpgrade', {
  id: 'newUpgrade',
  name: 'New Upgrade',
  description: 'Description of new upgrade',
  maxLevel: 5,
  modifier: {
    resource: {
      cap: {
        energy: {
          formula: (data: any) => ({
            type: 'linear',
            A: 10, // +10 на рівень
            B: 0
          }),
          deps: []
        }
      }
    }
  },
  ui: {
    defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    iconName: 'new-upgrade.png',
    color: '#FF0000'
  },
  cost: (level: number) => ({
    stone: 20 + (level - 1) * 10
  })
}]
```
