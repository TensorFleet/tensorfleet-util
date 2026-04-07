import pino from 'pino';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SILENT = 'silent'
}

type LogMethod = 'debug' | 'info' | 'warn' | 'error';

export class TensorfleetLogger {
  private readonly logger: pino.Logger;
  private readonly tag: string;

  constructor(tag: string) {
    this.tag = tag;
    this.logger = pino({
      level: process.env.LOG_LEVEL || LogLevel.INFO,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label.toUpperCase() })
      }
    });
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, (key, val) => {
        // Handle circular references and special types
        if (val == null) return null;
        if (typeof val === 'undefined') return 'undefined';
        if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
        if (typeof val === 'symbol') return val.toString();
        if (val instanceof Map) return `{Map(${val.size})}`;
        if (val instanceof Set) return `{Set(${val.size})}`;
        if (val instanceof Error) return val.toString();
        // Handle objects with custom inspect/toJSON
        if (val && typeof val === 'object') {
          if (typeof (val as any).toJSON === 'function') {
            return (val as any).toJSON();
          }
          if (typeof (val as any).inspect === 'function') {
            return (val as any).inspect();
          }
        }
        return val;
      }, 2);
    } catch {
      // Fallback for objects that can't be stringified (e.g., DOM elements, complex objects)
      if (value === null) return 'null';
      if (value === undefined) return 'undefined';
      if (typeof value === 'function') return `[Function: ${(value as Function).name || 'anonymous'}]`;
      if (typeof value === 'symbol') return value.toString();
      return `[${typeof value}]`;
    }
  }

  private buildMessage(message: string, args: unknown[]): string {
    const parts = [message, ...args.map((arg) => this.stringify(arg))];
    return `[Tensorfleet][${this.tag}] ${parts.join(' ')}`;
  }

  private log(level: LogMethod, message: string, ...args: unknown[]): void {
    this.logger[level](this.buildMessage(message, args));
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }
}

export const logger = new TensorfleetLogger('Util');

export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);