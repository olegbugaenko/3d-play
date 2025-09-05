/**
 * Result<T, E> pattern для функціонального обробки помилок
 * Замінює exception throwing на explicit error handling
 */

export type Result<T, E = Error> = Success<T> | Failure<E>;

export class Success<T> {
  readonly _tag = 'Success' as const;
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  isSuccess(): this is Success<T> {
    return true;
  }

  isFailure(): this is Failure<never> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Success(fn(this.value));
  }

  flatMap<U, E>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  getOrElse<U>(defaultValue: U): T | U {
    return this.value;
  }

  getOrThrow(): T {
    return this.value;
  }
}

export class Failure<E> {
  readonly _tag = 'Failure' as const;
  readonly error: E;

  constructor(error: E) {
    this.error = error;
  }

  isSuccess(): this is Success<never> {
    return false;
  }

  isFailure(): this is Failure<E> {
    return true;
  }

  map<U>(fn: (value: never) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  flatMap<U, F>(fn: (value: never) => Result<U, F>): Result<U, E | F> {
    return this as unknown as Result<U, E | F>;
  }

  getOrElse<U>(defaultValue: U): U {
    return defaultValue;
  }

  getOrThrow(): never {
    throw this.error;
  }
}

// Factory functions
export const success = <T>(value: T): Result<T, never> => new Success(value);
export const failure = <E>(error: E): Result<never, E> => new Failure(error);

// Utility functions
export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> => {
  return result.isSuccess();
};

export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => {
  return result.isFailure();
};

// Pattern matching
export const match = <T, E, R>(
  result: Result<T, E>,
  onSuccess: (value: T) => R,
  onFailure: (error: E) => R
): R => {
  return result.isSuccess() ? onSuccess(result.value) : onFailure(result.error);
};

// Try-catch wrapper
export const tryCatch = <T>(fn: () => T): Result<T, Error> => {
  try {
    return success(fn());
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
};

// Async version
export const tryCatchAsync = async <T>(fn: () => Promise<T>): Promise<Result<T, Error>> => {
  try {
    return success(await fn());
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
};
