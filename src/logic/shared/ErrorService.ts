/**
 * Централізований сервіс для обробки помилок та логування
 * Замінює розкидані console.error/warn по всьому коду
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

import { LogData } from './types';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: string;
  timestamp: number;
  data?: LogData;
}

export class ErrorService {
  private static instance: ErrorService;
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Обмежуємо кількість логів в пам'яті
  
  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  private constructor() {}

  /**
   * Логує повідомлення з контекстом
   */
  log(level: LogLevel, context: string, message: string, data?: LogData): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: Date.now(),
      data
    };

    // Додаємо до внутрішнього логу
    this.logs.push(entry);
    
    // Обмежуємо розмір логів
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Виводимо в консоль з форматуванням
    this.outputToConsole(entry);
  }

  /**
   * Швидкі методи для різних рівнів
   */
  debug(context: string, message: string, data?: LogData): void {
    this.log('debug', context, message, data);
  }

  info(context: string, message: string, data?: LogData): void {
    this.log('info', context, message, data);
  }

  warn(context: string, message: string, data?: LogData): void {
    this.log('warn', context, message, data);
  }

  error(context: string, message: string, data?: LogData): void {
    this.log('error', context, message, data);
  }

  /**
   * Для критичних помилок з додатковою інформацією
   */
  critical(context: string, message: string, error?: Error | unknown, data?: LogData): void {
    const errorDetails = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

    this.log('error', context, `CRITICAL: ${message}`, {
      error: errorDetails,
      additionalData: data
    });
  }

  /**
   * Форматований вивід в консоль
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString().slice(11, 23);
    const prefix = `[${timestamp}] [${entry.context}]`;

    switch (entry.level) {
      case 'debug':
        console.debug(`${prefix} ${entry.message}`, entry.data || '');
        break;
      case 'info':
        console.info(`${prefix} ${entry.message}`, entry.data || '');
        break;
      case 'warn':
        console.warn(`${prefix} ${entry.message}`, entry.data || '');
        break;
      case 'error':
        console.error(`${prefix} ${entry.message}`, entry.data || '');
        break;
    }
  }

  /**
   * Отримання логів для debugging
   */
  getLogs(level?: LogLevel, context?: string): LogEntry[] {
    return this.logs.filter(log => {
      if (level && log.level !== level) return false;
      if (context && log.context !== context) return false;
      return true;
    });
  }

  /**
   * Очищення логів
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Експорт логів для debugging
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Глобальний інстанс для зручності
export const Logger = ErrorService.getInstance();
