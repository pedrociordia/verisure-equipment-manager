/**
 * Production-safe logger.
 * Only outputs to console in development mode.
 */
export const logger = {
  error: (...args: unknown[]): void => {
    if (import.meta.env.DEV) console.error(...args);
  },
  warn: (...args: unknown[]): void => {
    if (import.meta.env.DEV) console.warn(...args);
  },
  info: (...args: unknown[]): void => {
    if (import.meta.env.DEV) console.info(...args);
  },
};
