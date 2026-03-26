import pino from 'pino';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SILENT = 'silent'
}

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
      },
      hooks: {
        logMethod(args, method) {
          if (typeof args[0] === 'string') {
            args[0] = `[Tensorfleet][${tag}] ${args[0]}`;
          } else if (typeof args[1] === 'string') {
            args[1] = `[Tensorfleet][${tag}] ${args[1]}`;
          } else {
            args.unshift(`[Tensorfleet][${tag}]`);
          }
          method.apply(this, args);
        }
      }
    });
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(message, ...args);
  }
}

export const logger = new TensorfleetLogger('Util');

export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);