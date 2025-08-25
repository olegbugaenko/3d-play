# Framework 3D - API Documentation

## 📚 Огляд

Цей документ описує API основних класів фреймворку для 3D сцен. Використовуйте цю документацію замість вгадування методів та параметрів.

---

## 🏗️ SceneLogic

**Призначення:** Основний клас для управління 3D сценою, об'єктами та їх взаємодією.

### Основні методи:

#### Об'єкти
```typescript
// Отримання об'єкта по ID
getObjectById(id: string): TSceneObject | undefined

// Отримання всіх об'єктів
getObjects(): Record<string, TSceneObject>

// Додавання об'єкта
pushObject(object: TSceneObject): boolean

// Додавання об'єкта з урахуванням terrain
pushObjectWithTerrainConstraint(object: TSceneObject): boolean
```

#### Пошук по тегам
```typescript
// Знайти всі об'єкти з певним тегом
getObjectsByTag(tag: string): TSceneObject[]

// Знайти всі об'єкти з певними тегами (перетин)
getObjectsByTags(tags: string[]): TSceneObject[]

// Знайти всі об'єкти з будь-яким з тегів (об'єднання)
getObjectsByAnyTag(tags: string[]): TSceneObject[]

// Знайти об'єкти з тегом в межах радіуса
getObjectsByTagInRadius(tag: string, center: { x: number; y: number; z: number }, radius: number): TSceneObject[]
```

#### Теги
```typescript
// Додати теги до об'єкта
addObjectTags(id: string, tags: string[]): void

// Видалити теги з об'єкта
removeObjectTags(id: string, tags: string[]): void

// Отримати всі доступні теги
getAllTags(): string[]

// Отримати кількість об'єктів з тегом
getObjectsCountByTag(tag: string): number
```

#### Terrain
```typescript
// Отримати менеджер terrain
getTerrainManager(): TerrainManager | null

// Оновити viewport
updateViewport(cameraProps: TCameraProps): void

// Ініціалізувати viewport
initializeViewport(cameraProps: TCameraProps, bounds: { x: number; y: number; z: number }): void
```

### Приклади використання:
```typescript
// Знайти зарядну станцію поблизу
const chargingStations = scene.getObjectsByTagInRadius('charge', rover.coordinates, 10.0);

// Отримати всі ровери
const rovers = scene.getObjectsByTag('rover');

// Знайти об'єкт по ID
const target = scene.getObjectById('charging_station');
```

---

## 💎 ResourceManager

**Призначення:** Управління глобальними ресурсами гри (energy, stone, ore).

### Основні методи:

#### Отримання інформації
```typescript
// Отримати кількість ресурсу
getResourceAmount(resourceId: ResourceId): number

// Отримати максимальну ємність ресурсу
getResourceCapacity(resourceId: ResourceId): number

// Отримати прогрес ресурсу (поточне/максимальне)
getResourceProgress(resourceId: ResourceId): number
```

#### Зміна ресурсів
```typescript
// Додати ресурси
addResources(changes: ResourceChange[]): boolean

// Забрати ресурси (якщо достатньо)
spendResources(changes: ResourceChange[]): boolean

// Встановити кількість ресурсу
setResourceAmount(resourceId: ResourceId, amount: number, reason?: string): void
```

#### Перевірка ресурсів
```typescript
// Перевірити чи достатньо ресурсів
checkResources(request: ResourceRequest): ResourceCheckResult
```

### Типи ресурсів:
```typescript
type ResourceId = 'energy' | 'stone' | 'ore';

interface ResourceChange {
  resourceId: ResourceId;
  amount: number;
  reason?: string;
}
```

### Приклади використання:
```typescript
// Отримати поточну енергію
const currentEnergy = resources.getResourceAmount('energy');

// Спожити енергію
resources.spendResources([{
  resourceId: 'energy',
  amount: 5,
  reason: 'charging'
}]);

// Додати камінь
resources.addResources([{
  resourceId: 'stone',
  amount: 10,
  reason: 'mining'
}]);
```

---

## 🎮 CommandSystem

**Призначення:** Управління виконанням команд для об'єктів.

### Основні методи:

#### Додавання команд
```typescript
// Додати команду
addCommand(objectId: string, command: Command): void

// Додати команду з пріоритетом
addPriorityCommand(objectId: string, command: Command): void

// Замінити поточні команди
replaceCommand(objectId: string, command: Command): void
```

#### Управління командами
```typescript
// Очистити всі команди об'єкта
clearCommands(objectId: string): void

// Очистити команди конкретної групи
clearCommandsByGroup(objectId: string, groupId: string): void

// Перевірити чи є активні команди
hasActiveCommands(objectId: string): boolean
```

#### Отримання інформації
```typescript
// Отримати чергу команд
getCommandQueue(objectId: string): CommandQueue | undefined

// Отримати поточну команду
getCurrentCommand(objectId: string): Command | null

// Отримати кількість активних команд
getActiveCommandsCount(): number
```

### Типи команд:
```typescript
type CommandType = 'move-to' | 'collect-resource' | 'unload-resources' | 'wait' | 'attack' | 'build' | 'charge';

interface Command {
  id: string;
  type: CommandType;
  targetId?: string;
  position: { x: number; y: number; z: number };
  parameters?: Record<string, any>;
  status: CommandStatus;
  priority: number;
  createdAt: number;
  groupId?: string;
}
```

### Приклади використання:
```typescript
// Додати команду руху
commandSystem.addCommand('rover_1', {
  id: 'move_1',
  type: 'move-to',
  position: { x: 10, y: 0, z: 5 },
  status: 'pending',
  priority: 1,
  createdAt: Date.now()
});

// Перевірити активні команди
if (commandSystem.hasActiveCommands('rover_1')) {
  console.log('Rover має активні команди');
}
```

---

## 🔄 CommandGroupSystem

**Призначення:** Управління групами команд та їх параметрами.

### Основні методи:

#### Групи команд
```typescript
// Додати групу команд
addCommandGroup(objectId: string, groupId: string, context: CommandGroupContext): boolean

// Скасувати групу команд
cancelCommandGroup(objectId: string, groupId: string): boolean

// Отримати стан групи
getGroupState(objectId: string, groupId: string): CommandGroupState | undefined
```

#### Параметри
```typescript
// Розв'язати параметри
resolveParameters(pipeline: ResolveParametersPipeline[], context: CommandGroupContext, resolveWhen: 'group-start' | 'before-command' | 'all'): Record<string, any>
```

### Типи груп:
```typescript
interface CommandGroup {
  id: string;
  name: string;
  description?: string;
  isLoop?: boolean;
  resolveParametersPipeline?: ResolveParametersPipeline[];
  tasksPipeline: (context: CommandGroupContext) => Command[];
}

interface CommandGroupContext {
  objectId: string;
  targets: Record<string, any>;
  parameters: Record<string, any>;
  resolved?: Record<string, any>;
}
```

### Приклади використання:
```typescript
// Запустити групу команд зарядки
commandGroupSystem.addCommandGroup('rover_1', 'charge-group', {
  objectId: 'rover_1',
  targets: {},
  parameters: {}
});

// Отримати стан групи
const groupState = commandGroupSystem.getGroupState('rover_1', 'charge-group');
```

---

## 🎯 ParameterResolvers

**Призначення:** Розв'язання параметрів для груп команд.

### Основні методи:

#### Пошук об'єктів
```typescript
// Знайти найближчий об'єкт з тегом
getClosestObjectByTag(tag: string, fromPosition: Vector3, maxDistance: number): string | null

// Знайти найближчий об'єкт з типом команди
getClosestObjectByCommandType(commandType: string, fromPosition: Vector3, maxDistance: number): string | null

// Знайти найближчий склад
getClosestStorage(fromPosition: Vector3, maxDistance: number): string | null

// Знайти найближчу зарядну станцію
getClosestChargingStation(fromPosition: Vector3, maxDistance: number): string | null
```

#### Позиції
```typescript
// Отримати позицію об'єкта
getObjectPosition(objectId: string): Vector3 | null

// Отримати поточну позицію об'єкта
getCurrentObjectPosition(objectId: string): Vector3 | null
```

### Приклади використання:
```typescript
// Знайти найближчу зарядну станцію
const stationId = resolvers.getClosestChargingStation(roverPosition, 50);

// Отримати позицію ресурсу
const resourcePos = resolvers.getObjectPosition('stone_1');

// Знайти найближчий склад
const storageId = resolvers.getClosestStorage(roverPosition, 200);
```

---

## 🚗 ChargeExecutor

**Призначення:** Виконання команди зарядки для роверів.

### Основні методи:

```typescript
// Виконати команду зарядки
execute(): CommandResult

// Перевірити чи може виконатися
canExecute(): boolean

// Перевірити чи завершена
completeCheck(): boolean
```

### Логіка роботи:

1. **Пошук станції** → знаходить зарядну станцію в межах `chargeDistance` (2.0)
2. **Перевірка відстані** → ровер має бути близько до станції
3. **Перевірка ресурсів** → перевіряє наявність глобального ресурсу `energy`
4. **Зарядка** → споживає `energy` та збільшує `power` ровера
5. **Завершення** → коли `power >= maxPower`

### Приклади використання:
```typescript
// Команда автоматично створюється через CommandGroupSystem
// та виконується ChargeExecutor
```

---

## ⚡ Система затратності команд (Power System)

**Призначення:** Управління споживанням локального ресурсу `power` дронами під час виконання команд.

### Затратність команд:
```typescript
const COMMAND_COSTS = {
  'collect-resource': { powerPerSecond: 1.0 },    // Добування ресурсів
  'build': { powerPerSecond: 3.0 },               // Будівництво
  'unload-resources': { powerPerSecond: 0.5 },    // Розвантаження
  'move-to': { powerPerSecond: 0.0 },            // Рух (не споживає)
  'charge': { powerPerSecond: 0.0 },             // Зарядка (не споживає)
  'wait': { powerPerSecond: 0.0 },               // Очікування (не споживає)
  'attack': { powerPerSecond: 2.0 }              // Атака
};
```

### Коефіцієнти ефективності дронів:
```typescript
// В data об'єкта дрона
{
  power: 10,                    // Поточний power
  maxPower: 15,                 // Максимальний power
  efficiencyMultiplier: 1.5     // Коефіцієнт ефективності (1.0 = нормальний, 2.0 = вдвічі гірший)
}
```

### Логіка роботи:

1. **Розрахунок затратності** → `базова_затратність × коефіцієнт_дрона`
2. **Перевірка power** → перед виконанням команди
3. **Споживання power** → під час виконання команди
4. **Фейл команди** → якщо power <= 0

### Приклади:
```typescript
// Дрон з efficiencyMultiplier = 2.0 виконує collect-resource
// Базова затратність: 1.0 power/sec
// Фінальна затратність: 1.0 × 2.0 = 2.0 power/sec
// Кожну секунду з power дрона забирається 2.0
```

---

## 🏗️ MapLogic

**Призначення:** Основний клас логіки гри, координатор всіх систем.

### Основні методи:

#### Ініціалізація
```typescript
// Ініціалізувати карту
initMap(cameraProps: TCameraProps): void

// Оновити стан гри (викликається кожен кадр)
tick(): void
```

#### Команди
```typescript
// Запустити добування ресурсів
mineResource(resourceId: string, selectedObjectIds: string[]): void

// Запустити зарядку об'єктів
chargeObject(selectedObjectIds: string[]): void

// Розподілити цілі для об'єктів
distributeTargetsForObjects(objectIds: string[], centerPoint: { x: number; y: number; z: number }): void
```

#### Генерація об'єктів
```typescript
// Генерувати каменюки
private generateBoulders(): void

// Генерувати ровери
private generateRovers(): void

// Генерувати будівлі
private generateBuildings(): void
```

### Приклади використання:
```typescript
// Запустити зарядку для вибраних роверів
mapLogic.chargeObject(['rover_1', 'rover_2']);

// Запустити добування ресурсу
mapLogic.mineResource('stone_1', ['rover_1']);

// Розподілити цілі для групи роверів
mapLogic.distributeTargetsForObjects(['rover_1', 'rover_2'], { x: 10, y: 0, z: 5 });
```

---

## 📝 Типи та інтерфейси

### TSceneObject
```typescript
interface TSceneObject {
  id: string;
  type: string;
  coordinates: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  data: Record<string, any>;
  tags: string[];
  bottomAnchor: number;
  terrainAlign: boolean;
  targetType?: string[];
  commandType?: string[];
}
```

### CommandResult
```typescript
interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
}
```

### Vector3
```typescript
interface Vector3 {
  x: number;
  y: number;
  z: number;
}
```

---

## 🔧 Поширені патерни

### 1. Пошук об'єктів
```typescript
// Завжди використовуйте існуючі методи SceneLogic
const objects = scene.getObjectsByTag('charge');
const nearbyObjects = scene.getObjectsByTagInRadius('charge', position, radius);
```

### 2. Робота з ресурсами
```typescript
// Використовуйте ResourceManager методи
const amount = resources.getResourceAmount('energy');
resources.spendResources([{ resourceId: 'energy', amount: 5, reason: 'usage' }]);
```

### 3. Створення команд
```typescript
// Використовуйте CommandGroupSystem для складних операцій
commandGroupSystem.addCommandGroup(objectId, 'charge-group', context);

// Або CommandSystem для простих команд
commandSystem.addCommand(objectId, command);
```

### 4. Пошук найближчих об'єктів
```typescript
// Використовуйте ParameterResolvers
const stationId = resolvers.getClosestChargingStation(position, maxDistance);
const storageId = resolvers.getClosestStorage(position, maxDistance);
```

---

## ⚠️ Важливі зауваження

1. **НЕ вгадуйте API** - завжди використовуйте цю документацію
2. **Використовуйте існуючі методи** - не створюйте дублікатів логіки
3. **Перевіряйте типи** - використовуйте правильні інтерфейси
4. **Дотримуйтесь патернів** - використовуйте стандартні підходи

---

## 📚 Додаткові ресурси

- `command-groups-db.ts` - визначення груп команд
- `resource-types.ts` - типи ресурсів
- `scene.types.ts` - типи сцени
- `command.types.ts` - типи команд

---

*Останнє оновлення: [Дата]*
*Версія: 1.0*
