/**
 * Log levels as constants.
 * We use individual exports to avoid TDZ issues with objects.
 */
export const LOG_INFO = "INFO";
export const LOG_WARNING = "WARNING";
export const LOG_ERROR = "ERROR";

function getLogStyle(level) {
  // Lazy-access config to avoid circular dependency issues during module evaluation
  const config = (window.owntracks && window.owntracks.config) || {};
  const primaryColor = config.primaryColor || "#3f51b5";

  var logColors = {
    [LOG_INFO]: primaryColor,
    [LOG_WARNING]: "#cf8429",
    [LOG_ERROR]: "#ad1515",
  };

  return `
    background: ${logColors[level] || "#999"};
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
 * @param {String} label Log message label, useful for filtering
 * @param {String|LogMessageFunction} message Log message
 * @param {String} [level] Log level, use `logLevels` constants
 */
export function log(label, message, level = LOG_INFO) {
  const config = (window.owntracks && window.owntracks.config) || {};

  if (level !== LOG_INFO && level !== LOG_WARNING && level !== LOG_ERROR) {
    console.warn(`[logging] invalid log level: ${level}`, label);
    return;
  }

  if (level !== LOG_ERROR && !config.verbose) {
    return;
  }

  const logFunc =
    {
      [LOG_INFO]: console.info,
      [LOG_WARNING]: console.warn,
      [LOG_ERROR]: console.error,
    }[level] || console.log;

  logFunc(
    `%c${label}`,
    getLogStyle(level),
    typeof message === "function" ? message() : message
  );
}
