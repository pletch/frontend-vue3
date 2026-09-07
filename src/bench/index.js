/**
 * Lightweight benchmarking harness for the location data pipeline.
 *
 * Everything here is a no-op unless benchmarking is explicitly enabled, so the
 * instrumentation can stay in the hot paths permanently without costing
 * anything in normal use. Enable with `?bench` in the URL, `config.bench`, or
 * by setting `window.__otBench.enabled = true` from the console.
 */

import { log } from "@/logging";

const samples = new Map();
const openMarks = new Map();

let enabled = false;

function detectEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    if (new URLSearchParams(window.location.search).has("bench")) {
      return true;
    }
  } catch {
    // No usable location (unit tests), fall through to the config check.
  }
  return Boolean(window.owntracks?.config?.bench);
}

/**
 * One row of `results()`: a series and its aggregated timings.
 *
 * @typedef {Object} BenchRow
 * @property {string} name Series name
 * @property {number} calls How many samples were recorded
 * @property {number} total Total duration in milliseconds
 * @property {number} mean Mean duration in milliseconds
 * @property {number} min Shortest sample in milliseconds
 * @property {number} max Longest sample in milliseconds
 * @property {number} items Total items processed across the samples
 * @property {number | null} usPerItem Microseconds per item, or null
 */

/**
 * Whether benchmarking is currently active.
 *
 * @returns {Boolean} True if timings are being recorded
 */
export function isEnabled() {
  return enabled;
}

/**
 * Enable or disable timing collection at runtime.
 *
 * @param {Boolean} [value] New state, defaults to enabling
 */
export function setEnabled(value = true) {
  enabled = Boolean(value);
}

/**
 * Record a single duration against a named series.
 *
 * @param {String} name Series name
 * @param {Number} duration Duration in milliseconds
 * @param {Number} [count] Number of items processed, for per-item stats
 */
export function record(name, duration, count = 0) {
  if (!enabled) {
    return;
  }
  let sample = samples.get(name);
  if (!sample) {
    sample = { name, calls: 0, total: 0, min: Infinity, max: 0, items: 0 };
    samples.set(name, sample);
  }
  sample.calls += 1;
  sample.total += duration;
  sample.min = Math.min(sample.min, duration);
  sample.max = Math.max(sample.max, duration);
  sample.items += count;
}

/**
 * Start an open-ended measurement. Pair with `measure()`.
 *
 * @param {String} name Series name
 */
export function mark(name) {
  if (!enabled) {
    return;
  }
  openMarks.set(name, performance.now());
}

/**
 * Close a measurement opened with `mark()`.
 *
 * @param {String} name Series name
 * @param {Number} [count] Number of items processed
 * @returns {Number} Duration in milliseconds, or 0 if not enabled/marked
 */
export function measure(name, count = 0) {
  if (!enabled) {
    return 0;
  }
  const start = openMarks.get(name);
  if (start === undefined) {
    return 0;
  }
  openMarks.delete(name);
  const duration = performance.now() - start;
  record(name, duration, count);
  return duration;
}

/**
 * Time a synchronous function.
 *
 * @param {String} name Series name
 * @param {Function} fn Function to time
 * @param {Function} [countFn] Called with the result to derive an item count
 * @returns {*} Whatever `fn` returned
 */
export function time(name, fn, countFn) {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  const result = fn();
  record(name, performance.now() - start, countFn ? countFn(result) : 0);
  return result;
}

/**
 * Time an asynchronous function.
 *
 * @param {String} name Series name
 * @param {Function} fn Async function to time
 * @param {Function} [countFn] Called with the result to derive an item count
 * @returns {Promise<*>} Whatever `fn` resolved to
 */
export async function timeAsync(name, fn, countFn) {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  const result = await fn();
  record(name, performance.now() - start, countFn ? countFn(result) : 0);
  return result;
}

/**
 * Get the collected timings as plain objects, slowest total first.
 *
 * @returns {BenchRow[]} One row per series, slowest first
 */
export function results() {
  return [...samples.values()]
    .map((sample) => ({
      name: sample.name,
      calls: sample.calls,
      total: Number(sample.total.toFixed(2)),
      mean: Number((sample.total / sample.calls).toFixed(3)),
      min: Number(sample.min.toFixed(3)),
      max: Number(sample.max.toFixed(3)),
      items: sample.items,
      usPerItem: sample.items
        ? Number(((sample.total * 1000) / sample.items).toFixed(3))
        : null,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Print the collected timings to the console as a table.
 *
 * @returns {BenchRow[]} The same rows returned by `results()`
 */
export function report() {
  const rows = results();
  // eslint-disable-next-line no-console
  console.table(rows);
  log("PERFORMANCE", () => `[bench] ${rows.length} series recorded`);
  return rows;
}

/** Discard all collected timings. */
export function reset() {
  samples.clear();
  openMarks.clear();
}

/**
 * Approximate the retained size of a value by walking it.
 *
 * This is deliberately crude - it exists to compare the same structure before
 * and after a change, not to report absolute memory use.
 *
 * @param {*} value Value to measure
 * @returns {Number} Approximate size in bytes
 */
export function approximateSize(value) {
  const seen = new WeakSet();
  const stack = [value];
  let bytes = 0;

  while (stack.length) {
    const current = stack.pop();
    if (current === null || current === undefined) {
      continue;
    }
    switch (typeof current) {
      case "boolean":
        bytes += 4;
        break;
      case "number":
        bytes += 8;
        break;
      case "string":
        bytes += current.length * 2;
        break;
      case "object":
        if (seen.has(current)) {
          continue;
        }
        seen.add(current);
        for (const key of Object.keys(current)) {
          bytes += key.length * 2;
          stack.push(current[key]);
        }
        break;
      default:
        break;
    }
  }

  return bytes;
}

enabled = detectEnabled();
