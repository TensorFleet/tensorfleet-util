import pino from 'pino';
import util from 'node:util';

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

    return util.inspect(value, {
      depth: null,
      colors: false,
      breakLength: Infinity,
      compact: true
    });
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