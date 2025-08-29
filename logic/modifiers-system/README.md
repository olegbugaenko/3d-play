# Система Модифікаторів (BonusSystem)

Система для управління бонусами, ефектами та ресурсами в грі з автоматичним оновленням залежностей.

## Компоненти

### 1. BonusRegistry
Реєструє джерела бонусів (будівлі, апгрейди, тощо).

### 2. DependencyGraph  
Будує граф залежностей між бонусами та перевіряє циклічність.

### 3. FormulaEngine
Виконує формули бонусів (лінійні та експоненціальні).

### 4. BonusSystem
Головний клас який об'єднує всі компоненти та надає API.

## Використання

### 1. Реєстрація джерела бонусів

```typescript
bonusSystem.registerSource('solarPanel', {
  name: 'Сонячна панель',
  description: 'Генерує енергію',
  modifiers: {
    resource: {
      income: {
        energy: {
          formula: (data, solarPanelEffect) => ({
            type: 'linear',
            A: solarPanelEffect,
            B: 0
          }),
          deps: ['solarPanelEffect']
        }
      }
    }
  }
});

// Ефекти також можуть мати income та multiplier
bonusSystem.registerSource('logisticCenter', {
  name: 'Логістичний центр',
  description: 'Покращує ефективність складів',
  modifiers: {
    effect: {
      multiplier: {  // Множник ефекту
        storageEfficiency: {
          formula: (data, logisticCentersEfficiency) => ({
            type: 'linear',
            A: 0.02 * logisticCentersEfficiency,
            B: 1  // Базовий множник 1
          }),
          deps: ['logisticCentersEfficiency']
        }
      }
    }
  }
});

bonusSystem.registerSource('advancedLogistics', {
  name: 'Просунута логістика',
  description: 'Додатковий бонус до логістики',
  modifiers: {
    effect: {
      income: {  // Додатковий дохід ефекту
        storageEfficiency: {
          formula: (data) => ({
            type: 'linear',
            A: 0.1,
            B: 0
          }),
          deps: []
        }
      }
    }
  }
});
```

### 2. Будування графу залежностей

```typescript
// Після реєстрації всіх джерел
bonusSystem.buildDependencyGraph();
```

### 3. Встановлення стану джерела

```typescript
bonusSystem.setSourceState('solarPanel', 2, 1); // level: 2, efficiency: 1
```

### 4. Отримання значень

```typescript
// Отримання ефекту (з income + multiplier логікою)
const efficiency = bonusSystem.getEffectValue('storageEfficiency');
// Результат: (сума income) * (сума multiplier)

// Отримання ресурсу
const energy = bonusSystem.getResourceValue('energy');
console.log('Income:', energy.income);
console.log('Cap:', energy.cap);
```

### 5. Оновлення рівня

```typescript
bonusSystem.updateBonusSourceLevel('solarPanel', 3);
// Автоматично оновлюються всі залежні бонуси
```

## Типи формул

### Linear: `A * level * efficiency + B`
```typescript
formula: (data) => ({
  type: 'linear',
  A: 50,  // Множник
  B: 0    // Базове значення
})
```

### Exponential: `A * (level * efficiency)^B`
```typescript
formula: (data) => ({
  type: 'exponential',
  A: 1,   // Множник
  B: 1.5  // Показник степеня
})
```

## Залежності

Кожен модифікатор може залежати від інших ефектів:

```typescript
deps: ['solarPanelEffect', 'logisticBonus']
```

Система автоматично:
- Будує граф залежностей
- Перевіряє циклічність
- Оновлює залежні бонуси при зміні
- Кешує результати для продуктивності

## Логіка розрахунку

### Ресурси
- **income**: Додається (`+=`)
- **multiplier**: Множиться (`*=`)
- **cap**: Додається (`+=`)
- **capMultiplier**: Множиться (`*=`)
- **consumption**: Додається (`+=`)

### Ефекти
- **income**: Додається (`+=`)
- **multiplier**: Множиться (`*=`)

**Фінальна формула для ефектів:**
```
finalValue = (сума income) * (сума multiplier)
```

**Приклад:**
```typescript
// Базовий ефект: 0.1 (income)
// Множник: 1.5 (multiplier)
// Результат: 0.1 * 1.5 = 0.15
```

## Інтеграція з Game

```typescript
// В Game класі
public bonusSystem!: BonusSystem;

public async initGame(): Promise<void> {
  // ... інші менеджери ...
  this.bonusSystem = new BonusSystem();
}

public async newGame(): Promise<void> {
  // Реєструємо бонуси
  // this.bonusSystem.registerSource(...);
  
  // Будуємо граф
  this.bonusSystem.buildDependencyGraph();
  
  // Запускаємо гру
  this.mapLogic.newGame();
}
```

## Приклад використання

```typescript
// Реєструємо джерела
bonusSystem.registerSource('solarPanel', {
  name: 'Сонячна панель',
  modifiers: {
    resource: {
      income: {
        energy: {
          formula: (data) => ({ type: 'linear', A: 10, B: 0 }),
          deps: []
        }
      }
    }
  }
});

// Встановлюємо рівень
bonusSystem.setSourceState('solarPanel', 2, 1);

// Отримуємо значення
const energy = bonusSystem.getResourceValue('energy');
console.log('Energy income:', energy.income); // 20 (10 * 2 * 1)
```