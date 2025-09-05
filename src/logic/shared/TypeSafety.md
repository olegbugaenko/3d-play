# Type Safety Cleanup Documentation

## Огляд

Type Safety Cleanup - це процес заміни `any` типів на конкретні інтерфейси в критичних місцях коду. Це покращує type safety, IntelliSense та зменшує кількість runtime помилок.

## Основні принципи

### 1. Заміна `any` на конкретні типи

**БУЛО:**
```typescript
function processData(data: any): any {
  return data.value * 2;
}
```

**СТАЛО:**
```typescript
interface DataType {
  value: number;
  id: string;
}

function processData(data: DataType): number {
  return data.value * 2;
}
```

### 2. Використання спільних типів

**БУЛО:**
```typescript
// Розкидані типи по різних файлах
interface LogData {
  message: string;
  data?: any;
}
```

**СТАЛО:**
```typescript
// Централізовані типи в @shared/types
export interface LogData {
  [key: string]: unknown;
}
```

## Створені типи

### Базові типи

```typescript
// Об'єкти сцени (імпортується з @scene/scene.types.ts)
import { TSceneObject } from '@scene/scene.types';

// Командні системи
export interface CommandContext {
  objectId: string;
  targetId?: string;
  parameters?: Record<string, unknown>;
}

// Система бонусів
export interface BonusData {
  id: string;
  value: number;
  source: string;
  dependencies: string[];
}

// Апгрейди
export interface UpgradeData {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  currentLevel: number;
  cost: ResourceCost[]; // Універсальний тип для вартості (будівлі, апгрейди, тощо)
  effects: UpgradeEffect[];
}
```

### Типи для логування

```typescript
export interface LogData {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: string;
  timestamp: number;
  data?: LogData;
}
```

## Приклади рефакторингу

### 1. ErrorService

**БУЛО:**
```typescript
log(level: LogLevel, context: string, message: string, data?: any): void
debug(context: string, message: string, data?: any): void
error(context: string, message: string, data?: any): void
```

**СТАЛО:**
```typescript
log(level: LogLevel, context: string, message: string, data?: LogData): void
debug(context: string, message: string, data?: LogData): void
error(context: string, message: string, data?: LogData): void
```

### 2. BonusSystem

**БУЛО:**
```typescript
public registerSource(id: string, data: any): void
public registerEffect(id: string, data: any): void
public getCacheStats(): any
public getCacheSizes(): any
```

**СТАЛО:**
```typescript
public registerSource(id: string, data: BonusSourceData): void
public registerEffect(id: string, data: BonusEffectData): void
public getCacheStats(): CacheStats
public getCacheSizes(): CacheSizes
```

### 3. UpgradesManager

**БУЛО:**
```typescript
public getUpgrade(typeId: string): any | null
public getUpgradeCost(typeId: string, level: number): any | undefined
private convertBuildingCostToResourceRequest(buildingCost: any): ResourceRequest
```

**СТАЛО:**
```typescript
public getUpgrade(typeId: string): UpgradeDataUI | null
public getUpgradeCost(typeId: string, level: number): ResourceRequest | undefined
// Видалено зайві методи конвертації - використовується ResourceRequest напряму
```

## План міграції

### Етап 1: Створення спільних типів ✅
- [x] Створено `@shared/types.ts`
- [x] Визначено базові інтерфейси
- [x] Створено типи для логування
- [x] **Виправлено ВСІ дублікати типів**
- [x] Перейменовано `BuildingCost` на універсальний `ResourceCost`
- [x] **Залишено тільки `LogData` в `@shared/types.ts`**

### Етап 2: ErrorService ✅
- [x] Замінено `any` на `LogData`
- [x] Оновлено всі методи логування
- [x] Додано імпорт типів

### Етап 3: BonusSystem ✅
- [x] Замінено `any` на конкретні типи
- [x] Оновлено методи реєстрації
- [x] Типізовано кеш статистику

### Етап 4: UpgradesManager ✅
- [x] Замінено `any` на `UpgradeData`
- [x] Типізовано методи отримання апгрейдів
- [x] Оновлено конвертацію вартості

### Етап 5: Командні системи (TODO)
- [ ] CommandSystem
- [ ] CommandGroupSystem
- [ ] ParameterResolvers
- [ ] ValidationService

### Етап 6: UI компоненти (TODO)
- [ ] BaseRenderer
- [ ] AreaSelectionRenderer
- [ ] Scene3D компоненти

### Етап 7: Менеджери (TODO)
- [ ] BuildingsManager
- [ ] DroneManager
- [ ] SaveManager

## Best Practices

### 1. Поступова міграція
```typescript
// Крок 1: Додати тип
interface NewType {
  id: string;
  value: number;
}

// Крок 2: Замінити any
function processData(data: NewType): number {
  return data.value * 2;
}

// Крок 3: Видалити старий код
```

### 2. Використання Record<string, unknown>
```typescript
// Замість any для динамічних об'єктів
interface DynamicData {
  [key: string]: unknown;
}
```

### 3. Типізація колекцій
```typescript
// Замість any[]
const items: SpecificType[] = [];
const map: Map<string, SpecificType> = new Map();
```

### 4. Використання union types
```typescript
// Замість any для різних типів
type ValidType = string | number | boolean;
```

## Переваги

1. **Type Safety** - компілятор ловить помилки на етапі компіляції
2. **IntelliSense** - краща підтримка IDE
3. **Documentation** - типи слугують документацією
4. **Refactoring** - безпечніші рефакторинги
5. **Performance** - TypeScript оптимізує код краще

## Моніторинг прогресу

### Метрики
- Кількість `any` типів в коді
- Покриття типізацією критичних модулів
- Кількість type errors після рефакторингу

### Інструменти
```bash
# Пошук any типів
grep -r ": any" src/

# TypeScript перевірка
npx tsc --noEmit

# ESLint з type-aware правилами
npx eslint --ext .ts src/
```

## Виправлення дублювання типів

### Проблема
- `TSceneObject` був дубльований в `@shared/types.ts` та `@scene/scene.types.ts`
- `BuildingCost` мав неправильну назву для універсального типу
- **ВСІ командні типи** дублювалися: `CommandContext`, `CommandGroupContext`, `CommandGroupState`
- **ВСІ типи валідації** дублювалися: `ValidationContext`, `ValidationResult`
- **ВСІ типи збереження** дублювалися: `SaveData`, `ManagerSaveData`
- **ВСІ типи менеджерів** дублювалися: `BuildingData`, `DroneData`, `ResourceAmount`, `CommandData`
- **ВСІ типи рендерерів** дублювалися: `RendererData`, `TerrainData`, `EffectData`

### Рішення
- Використовуємо `TSceneObject` з `@scene/scene.types.ts`
- `ResourceCost` є універсальним типом для вартості (будівлі, апгрейди, тощо)
- **Видалили ВСІ дублікати** з `@shared/types.ts`
- **Залишили тільки `LogData`** - універсальний тип для логування
- **Всі інші типи імпортуються з їх оригінальних місць**

### Приклад використання
```typescript
// Правильно - імпортуємо з оригінального місця
import { TSceneObject } from '@scene/scene.types';
import { CommandContext, CommandGroupContext } from '@commands/command.types';
import { CommandGroupState } from '@commands/command-group.types';
import { ValidationResult } from '@commands/ValidationService';
import { SaveData } from '@save-load/save-load.types';
import { BuildingData } from '@buildings/buildings.types';
import { DroneData } from '@drones/DroneManager';

// Універсальний тип для вартості
const buildingCost: ResourceCost[] = [
  { resourceId: 'stone', amount: 10, level: 1 }
];

const upgradeCost: ResourceCost[] = [
  { resourceId: 'energy', amount: 5, level: 2 }
];

// Тільки LogData залишається в @shared/types.ts
import { LogData } from '@shared/types';
```

## Фінальний стан @shared/types.ts

Після виправлення всіх дублікатів, `@shared/types.ts` містить тільки:

```typescript
/**
 * Спільні типи для заміни any в критичних місцях
 */

// TSceneObject використовується з @scene/scene.types.ts
// CommandContext, CommandGroupContext, CommandGroupState використовуються з @commands/command.types.ts та @commands/command-group.types.ts

// Типи для системи бонусів
export interface BonusData {
  id: string;
  value: number;
  source: string;
  dependencies: string[];
}

export interface BonusEffect {
  id: string;
  type: string;
  value: number;
  conditions: Record<string, unknown>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export interface CacheSizes {
  sources: number;
  effects: number;
  formulas: number;
}

// UpgradeDataUI та UpgradeEffectUI використовуються з @upgrades/upgrades.types.ts

// ResourceCost видалено - використовується ResourceRequest з @resources/resource-types.ts

// ValidationContext, ValidationResult використовуються з @commands/ValidationService.ts
// SaveData, ManagerSaveData використовуються з @save-load/save-load.types.ts
// FormulaData використовується з @modifiers/BonusRegistry.ts
// BuildingData використовується з @buildings/buildings.types.ts
// DroneData, ResourceAmount використовуються з @drones/DroneManager.ts
// CommandData використовується з @commands/command.types.ts
// RendererData використовується з @ui/renderers/
// TerrainData використовується з @scene/terrain-manager.ts
// EffectData використовується з @shared/effects/
// UpgradeDataUI, UpgradeEffectUI використовуються з @upgrades/upgrades.types.ts
// ResourceRequest використовується з @resources/resource-types.ts

// Універсальний тип для логування
export interface LogData {
  [key: string]: unknown;
}
```

**Результат:** Чистий файл без дублікатів, тільки універсальні типи!

## Наступні кроки

1. **Командні системи** - найбільш критичні для type safety
2. **UI компоненти** - покращить developer experience
3. **Менеджери** - завершить основну типізацію
4. **Тести** - додати type-safe тести
5. **Документація** - оновити API документацію
