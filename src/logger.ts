import pino from "pino";

export interface Logger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

export const consoleLogger: Logger = {
  error: (msg, ...args) => console.error(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  info: (msg, ...args) => console.info(msg, ...args),
  debug: (msg, ...args) => console.debug(msg, ...args),
};

export const noopLogger: Logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

const _pino = pino({ level: process.env.LOG_LEVEL ?? "info" });

/** Logger instance backed by pino, conforming to the Logger interface. */
export const logger: Logger = {
  error: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      _pino.error(args[0] as Record<string, unknown>, msg);
    } else {
      _pino.error(msg);
    }
  },
  warn: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      _pino.warn(args[0] as Record<string, unknown>, msg);
    } else {
      _pino.warn(msg);
    }
  },
  info: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      _pino.info(args[0] as Record<string, unknown>, msg);
    } else {
      _pino.info(msg);
    }
  },
  debug: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      _pino.debug(args[0] as Record<string, unknown>, msg);
    } else {
      _pino.debug(msg);
    }
  },
};
