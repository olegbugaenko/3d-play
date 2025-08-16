# 🏔️ Terrain System Documentation

## Огляд

Terrain System - це нова система для генерації та управління 3D terrain, яка інтегрується з існуючою архітектурою без порушення її структури.

## 🏗️ Архітектура

### 1. **TerrainManager** (`logic/scene/terrain-manager.ts`)
**Роль**: Основний клас для управління terrain та висотами

**Ключові функції**:
- `getHeightAt(x, z)` - отримання висоти в заданій точці
- `canPlaceObjectAt(position, height)` - перевірка можливості розміщення об'єкта
- `snapToTerrain(position, height)` - примусове розміщення на terrain
- `getNormalAt(x, z)` - отримання нормалі terrain для освітлення

**Конфігурація**:
```typescript
interface TerrainConfig {
    width: number;        // Ширина terrain
    height: number;       // Висота terrain  
    resolution: number;   // Розмір клітинки
    maxHeight: number;    // Максимальна висота
    minHeight: number;    // Мінімальна висота
}
```

### 2. **TerrainRenderer** (`src/components/renderers/TerrainRenderer.ts`)
**Роль**: Візуалізація terrain в Three.js

**Ключові функції**:
- `renderTerrain()` - створення 3D меша для terrain
- `updateTerrain()` - оновлення при зміні висот
- `removeTerrain()` - видалення зі сцени

### 3. **Інтеграція з SceneLogic**
**Роль**: Автоматичне застосування terrain constraint

**Нові методи**:
- `pushObjectWithTerrainConstraint()` - додавання з автоматичним розміщенням на terrain
- `moveObjectWithTerrainConstraint()` - переміщення з terrain constraint
- `validateTerrainConstraint()` - перевірка constraint

## 🎯 Terrain Constraint System

### Принцип роботи:
1. **Об'єкти з тегом `on-ground`** автоматично розміщуються на terrain
2. **Об'єкти без тегу** можуть знаходитися в будь-якій позиції
3. **Автоматичне оновлення** Y координати при розміщенні

### Приклад використання:
```typescript
// Об'єкт автоматично розміститься на terrain
const groundObject: TSceneObject = {
    id: 'ground_cube',
    type: 'cube',
    coordinates: { x: 10, y: 0, z: 10 }, // Y буде автоматично встановлено
    scale: { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0 },
    data: { color: 0x00ff00 },
    tags: ['on-ground'] // Ключовий тег!
};

// Використовуємо terrain constraint
scene.pushObjectWithTerrainConstraint(groundObject);
```

## 🔧 Генерація Terrain

### Поточний алгоритм:
- **Простий шум** на основі sin/cos функцій
- **Готовність для Perlin noise** - замініть `simpleNoise()` на справжній Perlin noise
- **Налаштовувана роздільність** через `resolution`

### Покращення:
```typescript
// Замініть simpleNoise на Perlin noise
private perlinNoise(x: number, z: number): number {
    // Використовуйте бібліотеку Perlin noise
    return perlin.get(x * 0.1, z * 0.1);
}
```

## 📊 Продуктивність

### Оптимізації:
- **Grid-based система** - така ж як у SceneLogic
- **Кешування висот** - уникнення повторних розрахунків
- **LOD система** - можна додати для великих terrain

### Метрики:
- **Розмір клітинки**: 25x25 одиниць (синхронізовано з grid системою)
- **Розмір terrain**: 2000x2000 одиниць
- **Діапазон висот**: -10 до +100 одиниць

## 🚀 Розширення

### Можливі покращення:
1. **Текстури** - різні текстури для різних висот
2. **LOD система** - різна деталізація залежно від відстані
3. **Динамічні зміни** - руйнування, будівництво
4. **Біомі** - різні типи terrain (ліс, гора, рівнина)

### Приклад додавання біомів:
```typescript
interface Biome {
    name: string;
    heightRange: [number, number];
    texture: string;
    objects: string[];
}

const biomes: Biome[] = [
    { name: 'forest', heightRange: [0, 20], texture: 'grass', objects: ['tree'] },
    { name: 'mountain', heightRange: [20, 100], texture: 'rock', objects: ['boulder'] }
];
```

## 🧪 Тестування

### Автоматичні тести:
- `testTerrainSystem()` - тестування основних функцій
- `generateTestHeightMap()` - генерація тестового terrain

### Ручне тестування:
1. Запустіть додаток
2. Перевірте консоль на наявність terrain тестів
3. Подивіться на зелений terrain меш
4. Перевірте, що куби автоматично розміщуються на terrain

## 🔗 Інтеграція з існуючою системою

### Без змін:
- ✅ SceneLogic API
- ✅ RendererManager
- ✅ BaseRenderer
- ✅ MapLogic основна логіка

### Нові можливості:
- 🆕 Terrain constraint для `on-ground` об'єктів
- 🆕 Автоматичне розміщення на terrain
- 🆕 Візуалізація terrain
- 🆕 Система висот та нормалей

## 📝 Приклади використання

### Створення terrain:
```typescript
const terrainConfig: TerrainConfig = {
    width: 2000,
    height: 2000,
    resolution: 25,
    maxHeight: 100,
    minHeight: -10
};

const terrainManager = new TerrainManager(terrainConfig);
```

### Розміщення об'єкта на terrain:
```typescript
// Автоматичне розміщення
scene.pushObjectWithTerrainConstraint(object);

// Ручне розміщення
const terrainHeight = terrainManager.getHeightAt(x, z);
object.coordinates.y = terrainHeight;
```

### Отримання інформації про terrain:
```typescript
const height = terrainManager.getHeightAt(x, z);
const normal = terrainManager.getNormalAt(x, z);
const canPlace = terrainManager.canPlaceObjectAt(position, height);
```

Ця система забезпечує плавну інтеграцію з існуючою архітектурою та відкриває нові можливості для 3D світу!
