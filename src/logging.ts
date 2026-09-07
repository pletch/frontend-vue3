/**
 * Log levels as constants.
 * We use individual exports to avoid TDZ issues with objects.
 */
export const LOG_INFO = "INFO";
export const LOG_WARNING = "WARNING";
export const LOG_ERROR = "ERROR";

/** The levels `log()` accepts. */
export type LogLevel = typeof LOG_INFO | typeof LOG_WARNING | typeof LOG_ERROR;

/**
 * The console badge style for a level.
 *
 * @param level Log level
 * @returns CSS for the `%c` format specifier
 */
function getLogStyle(level: LogLevel): string {
  // Lazy-access config to avoid circular dependency issues during module
  // evaluation.
  const config = window.owntracks?.config ?? {};
  const primaryColor = config.primaryColor ?? "#3f51b5";

  const logColors: Record<LogLevel, string> = {
    [LOG_INFO]: primaryColor,
    [LOG_WARNING]: "#cf8429",
    [LOG_ERROR]: "#ad1515",
  };

  return `
    background: ${logColors[level]};
    border-radius: 5px;
    color: #fff;
    padding: 3px;
  `;
}

/**
 * Log a message to the browser's console.
 *
 * Convenience wrapper for `console.{info,warn,error}` doing some formatting
 * and taking the `verbose` config option into account.
 *
 * @param label Log message label, useful for filtering
 * @param message Log message, or a function returning one
 * @param level Log level, use the `LOG_*` constants
 */
export function log(
  label: string,
  message: unknown,
  level: LogLevel = LOG_INFO
): void {
  const config = window.owntracks?.config ?? {};

  // The union makes this unreachable from TypeScript, but the console is not
  // type checked and this is a convenient thing to call from it.
  if (level !== LOG_INFO && level !== LOG_WARNING && level !== LOG_ERROR) {
    console.warn(`[logging] invalid log level: ${level}`, label);
    return;
  }

  if (level !== LOG_ERROR && !config.verbose) {
    return;
  }

  const logFunc: Record<LogLevel, (...args: unknown[]) => void> = {
    [LOG_INFO]: console.info,
    [LOG_WARNING]: console.warn,
    [LOG_ERROR]: console.error,
  };

  logFunc[level](
    `%c${label}`,
    getLogStyle(level),
    typeof message === "function" ? (message as LogMessageFunction)() : message
  );
}
