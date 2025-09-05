# Result Pattern Documentation

## Огляд

`Result<T, E>` pattern замінює exception throwing на функціональний підхід до обробки помилок. Це покращує type safety та робить код більш передбачуваним.

## Основні типи

```typescript
type Result<T, E = Error> = Success<T> | Failure<E>
```

- `Success<T>` - успішний результат зі значенням типу T
- `Failure<E>` - помилка типу E (за замовчуванням Error)

## Factory Functions

```typescript
import { success, failure } from '@shared/Result';

// Створення успішного результату
const result = success(42);

// Створення помилки
const error = failure('Something went wrong');
```

## Основні методи

### Success<T>

```typescript
const result = success(42);

// Перевірка типу
result.isSuccess(); // true
result.isFailure(); // false

// Отримання значення
result.value; // 42
result.getOrElse(0); // 42
result.getOrThrow(); // 42

// Трансформація
result.map(x => x * 2); // Success(84)
result.flatMap(x => success(x.toString())); // Success("42")
```

### Failure<E>

```typescript
const error = failure('Error message');

// Перевірка типу
error.isSuccess(); // false
error.isFailure(); // true

// Отримання значення
error.error; // "Error message"
error.getOrElse(0); // 0
error.getOrThrow(); // throws "Error message"

// Трансформація
error.map(x => x * 2); // Failure("Error message")
error.flatMap(x => success(x.toString())); // Failure("Error message")
```

## Utility Functions

```typescript
import { isSuccess, isFailure, match, tryCatch } from '@shared/Result';

// Type guards
const result = someFunction();
if (isSuccess(result)) {
    console.log(result.value);
} else {
    console.error(result.error);
}

// Pattern matching
const message = match(result,
    (value) => `Success: ${value}`,
    (error) => `Error: ${error}`
);

// Try-catch wrapper
const result = tryCatch(() => {
    return riskyOperation();
});
```

## Приклади використання

### 1. Отримання об'єкта з бази даних

```typescript
// Старий підхід
function getObjectById(id: string): GameObject {
    const obj = database.get(id);
    if (!obj) {
        throw new Error(`Object ${id} not found`);
    }
    return obj;
}

// Новий підхід
function getObjectByIdResult(id: string): Result<GameObject, string> {
    const obj = database.get(id);
    if (!obj) {
        return failure(`Object ${id} not found`);
    }
    return success(obj);
}
```

### 2. Ланцюжок операцій

```typescript
// Старий підхід
function processUser(userId: string): string {
    const user = getUser(userId);
    if (!user) throw new Error('User not found');
    
    const profile = getProfile(user.profileId);
    if (!profile) throw new Error('Profile not found');
    
    return profile.name;
}

// Новий підхід
function processUserResult(userId: string): Result<string, string> {
    return getUserResult(userId)
        .flatMap(user => getProfileResult(user.profileId))
        .map(profile => profile.name);
}
```

### 3. Обробка помилок

```typescript
// Старий підхід
try {
    const result = riskyOperation();
    return result;
} catch (error) {
    console.error('Operation failed:', error);
    return null;
}

// Новий підхід
const result = tryCatch(() => riskyOperation());
return match(result,
    (value) => value,
    (error) => {
        Logger.error('Operation', 'Operation failed', { error });
        return null;
    }
);
```

## Переваги

1. **Type Safety** - помилки обробляються на рівні типів
2. **Explicit Error Handling** - немає необроблених винятків
3. **Composability** - легко комбінувати операції
4. **Performance** - немає overhead від exception handling
5. **Functional Programming** - підходить для функціонального стилю

## Міграція з Exception-based коду

### Поетапна міграція:

1. **Додати Result методи поруч з існуючими**
2. **Поступово замінювати виклики**
3. **Видалити старий код після повної міграції**

### Приклад міграції:

```typescript
// Крок 1: Додати Result метод
class Service {
    // Старий метод
    getData(id: string): Data {
        const data = this.fetch(id);
        if (!data) throw new Error('Data not found');
        return data;
    }
    
    // Новий метод
    getDataResult(id: string): Result<Data, string> {
        const data = this.fetch(id);
        if (!data) return failure('Data not found');
        return success(data);
    }
}

// Крок 2: Поступово замінювати виклики
// Старий код
const data = service.getData(id);

// Новий код
const result = service.getDataResult(id);
if (isSuccess(result)) {
    const data = result.value;
    // використовуємо data
} else {
    // обробляємо помилку
}
```

## Best Practices

1. **Використовуйте конкретні типи помилок** замість Error
2. **Комбінуйте операції** через flatMap
3. **Використовуйте pattern matching** для обробки результатів
4. **Логуйте помилки** через Logger
5. **Документуйте типи помилок** в JSDoc
