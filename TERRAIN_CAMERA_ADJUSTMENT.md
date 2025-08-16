# 🎥 Terrain Camera Height Adjustment

## Огляд

Нова функціональність автоматично коригує висоту камери на основі terrain в точці, на яку дивиться камера. Це забезпечує, що камера завжди знаходиться на правильній висоті відносно ландшафту.

## 🎯 Як це працює

### Принцип роботи:
1. **Визначаємо точку фокусу** - куди дивиться камера (`controls.target`)
2. **Отримуємо висоту terrain** в цій точці
3. **Коригуємо позицію камери** - щоб вона була мінімум на 1 одиницю вище terrain
4. **Плавне переміщення** - камера плавно "піднімається" до нової висоти

### Формула коригування:
```
Нова позиція камери = Точка фокусу + Напрямок камери × Відстань
Мінімальна висота = Висота terrain в позиції камери + 1
```

## 🔧 Технічна реалізація

### Основна функція:
```typescript
const adjustCameraHeightToTerrain = () => {
  if (!terrainHeightAdjustment) return; // Перевірка чи увімкнено
  
  const focusPoint = controls.target;
  const terrainHeight = terrainManager.getHeightAt(focusPoint.x, focusPoint.z);
  
  // Розрахунок нової позиції камери
  const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
  const newCameraPosition = focusPoint.clone().add(
    cameraDirection.clone().multiplyScalar(currentDistance)
  );
  
  // Коригування висоти
  const terrainHeightAtCamera = terrainManager.getHeightAt(newCameraPosition.x, newCameraPosition.z);
  const minCameraHeight = terrainHeightAtCamera + 1;
  
  if (newCameraPosition.y < minCameraHeight) {
    newCameraPosition.y = minCameraHeight;
    camera.position.lerp(newCameraPosition, 0.1); // Плавне переміщення
  }
}
```

### Коли викликається:
- **В анімаційному циклі** - кожен кадр
- **При оновленні viewport** - при зміні камери
- **При зміні розміру вікна** - при resize

## 🎮 Керування

### Кнопка ON/OFF:
- **Зелена кнопка** - Terrain Height Adjustment увімкнено
- **Червона кнопка** - Terrain Height Adjustment вимкнено
- **Клік** - перемикання між станами

### Дебаг інформація:
- **Focus Point** - координати точки, на яку дивиться камера
- **Terrain Height at Focus** - висота terrain в точці фокусу
- **Camera Distance** - відстань між камерою та точкою фокусу

## 📊 Налаштування

### Параметри:
- **Мінімальна висота над terrain**: 1 одиниця
- **Швидкість переміщення (lerp)**: 0.1 (10% за кадр)
- **Частота оновлення**: кожен кадр (60 FPS)

### Зміна параметрів:
```typescript
// Змінити мінімальну висоту над terrain
const minCameraHeight = terrainHeightAtCamera + 2; // 2 одиниці замість 1

// Змінити швидкість переміщення
const lerpFactor = 0.05; // Повільніше переміщення
const lerpFactor = 0.2;  // Швидше переміщення
```

## 🎯 Приклади використання

### Сценарій 1: Камера над горою
1. Камера дивиться на вершину гори
2. Система визначає висоту terrain (наприклад, 15 одиниць)
3. Камера автоматично піднімається до висоти 16+ одиниць
4. Результат: камера завжди має гарний огляд гори

### Сценарій 2: Камера над долиною
1. Камера дивиться на долину
2. Система визначає висоту terrain (наприклад, 2 одиниці)
3. Камера автоматично опускається до висоти 3+ одиниць
4. Результат: камера не "зависає" над долиною

### Сценарій 3: Плавне переміщення
1. Гравець переміщує камеру
2. Система плавно коригує висоту
3. Камера "підлаштовується" під terrain
4. Результат: плавний, природний рух камери

## 🚀 Розширення

### Можливі покращення:
1. **Налаштування швидкості** - різні швидкості для різних ситуацій
2. **Передбачення руху** - коригування висоти заздалегідь
3. **Різні режими** - агресивний, помірний, плавний
4. **Звукові ефекти** - звуки при зміні висоти

### Приклад налаштувань:
```typescript
interface TerrainAdjustmentConfig {
  mode: 'aggressive' | 'moderate' | 'smooth';
  minHeightAbove: number;
  lerpSpeed: number;
  predictionDistance: number;
}

const configs = {
  aggressive: { minHeightAbove: 0.5, lerpSpeed: 0.3, predictionDistance: 5 },
  moderate: { minHeightAbove: 1.0, lerpSpeed: 0.1, predictionDistance: 3 },
  smooth: { minHeightAbove: 2.0, lerpSpeed: 0.05, predictionDistance: 1 }
};
```

## 🔍 Відладка

### Типові проблеми:
1. **Камера "стрибає"** - зменшіть lerpFactor
2. **Камера не реагує** - перевірте чи увімкнено terrainHeightAdjustment
3. **Повільна реакція** - збільшіть lerpFactor

### Логи для відладки:
```typescript
console.log('Terrain adjustment:', {
  focusPoint: controls.target,
  terrainHeight,
  cameraPosition: camera.position,
  newPosition: newCameraPosition
});
```

## 📝 Висновок

Terrain Camera Height Adjustment забезпечує:
- ✅ **Природний рух камери** - камера завжди на правильній висоті
- ✅ **Плавні переходи** - без різких стрибків
- ✅ **Гнучкість** - можна вмикати/вимикати
- ✅ **Продуктивність** - оптимізовано для 60 FPS

Ця функціональність робить 3D світ більш реалістичним та зручним для навігації!
