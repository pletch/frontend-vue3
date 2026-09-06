/**
 * Interactive benchmark runner.
 *
 * Loaded lazily from `main.js` only when benchmarking is enabled, so neither
 * this module nor the dataset generator end up in the default bundle.
 *
 * Usage from the browser console:
 *
 *   await __otBench.load(100000)   // load 100k synthetic points
 *   __otBench.report()             // print collected timings
 *   await __otBench.sweep()        // run a range of sizes and print a summary
 *   __otBench.tick(50)             // simulate 50 live WebSocket updates
 */

import { nextTick } from "vue";

import { useLocationStore } from "@/store/location";
import { log } from "@/logging";
import * as bench from "@/bench";
import {
  generateLocationHistory,
  lastLocationsFromHistory,
} from "@/bench/dataset";

const DEFAULT_SWEEP = [1000, 10000, 50000, 100000, 250000];

/**
 * Wait until the browser has finished painting the current frame.
 *
 * Vue's `nextTick` only flushes the reactivity queue; the MapLibre work
 * triggered by our watchers lands in the frame after that.
 *
 * @returns {Promise<void>} Resolves after the next animation frame
 */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Wait for reactivity and rendering triggered by a store mutation to settle.
 *
 * @returns {Promise<void>} Resolves once the pipeline is idle
 */
async function settle() {
  await nextTick();
  await nextFrame();
  await nextFrame();
}

/**
 * Replace the store's location history with a generated dataset and measure
 * the full derive -> GeoJSON -> setData pipeline.
 *
 * @param {Number} [points] Total number of points to generate
 * @param {Object} [options] Extra options for `generateLocationHistory`
 * @returns {Promise<Object>} Summary of the run
 */
export async function load(points = 100000, options = {}) {
  bench.setEnabled(true);
  const store = useLocationStore();

  const history = bench.time("bench:generate", () =>
    generateLocationHistory({ points, ...options })
  );
  const lastLocations = lastLocationsFromHistory(history);

  bench.mark("bench:pipeline");
  // Timed separately: assigning into a deeply reactive ref is where Vue walks
  // the whole dataset and wraps every location object in a Proxy.
  bench.time("store:assign", () => {
    store.locationHistory = history;
    store.lastLocations = lastLocations;
  });
  await settle();
  const pipelineMs = bench.measure("bench:pipeline", points);

  const summary = {
    points,
    pipelineMs: Number(pipelineMs.toFixed(2)),
    historyBytes: bench.approximateSize(history),
  };
  log("PERFORMANCE", () => `[bench] load ${JSON.stringify(summary)}`);
  return summary;
}

/**
 * Simulate live WebSocket location updates against the current dataset.
 *
 * Each tick appends one point to the first device in the store, which is the
 * path that currently re-derives and re-uploads the entire history.
 *
 * @param {Number} [count] Number of updates to simulate
 * @returns {Promise<Object>} Summary of the run
 */
export async function tick(count = 50) {
  bench.setEnabled(true);
  const store = useLocationStore();

  const user = Object.keys(store.locationHistory)[0];
  const device = user && Object.keys(store.locationHistory[user])[0];
  if (!device) {
    throw new Error("No location history loaded, call load() first");
  }

  const deviceHistory = store.locationHistory[user][device];
  const template = deviceHistory[deviceHistory.length - 1];

  bench.mark("bench:liveUpdates");
  for (let i = 0; i < count; i++) {
    const location = {
      ...template,
      tst: template.tst + (i + 1) * 30,
      lat: template.lat + (i + 1) * 0.0001,
      lon: template.lon + (i + 1) * 0.0001,
    };
    store.locationHistory[user][device].push(location);
    store.lastLocations = [location];
    await settle();
  }
  const totalMs = bench.measure("bench:liveUpdates", count);

  const summary = {
    updates: count,
    totalMs: Number(totalMs.toFixed(2)),
    msPerUpdate: Number((totalMs / count).toFixed(2)),
    historyPoints: deviceHistory.length,
  };
  log("PERFORMANCE", () => `[bench] tick ${JSON.stringify(summary)}`);
  return summary;
}

/**
 * Run `load()` across a range of dataset sizes, resetting timings each time.
 *
 * @param {Number[]} [sizes] Dataset sizes to run
 * @returns {Promise<Object[]>} One summary row per size
 */
export async function sweep(sizes = DEFAULT_SWEEP) {
  const rows = [];
  for (const size of sizes) {
    bench.reset();
    const summary = await load(size);
    rows.push({ ...summary, series: bench.results() });
  }
  // eslint-disable-next-line no-console
  console.table(rows.map(({ series, ...row }) => row));
  return rows;
}

/** Attach the runner to `window.__otBench`. */
export function install() {
  window.__otStore = useLocationStore();
  window.__otBench = {
    load,
    tick,
    sweep,
    report: bench.report,
    results: bench.results,
    reset: bench.reset,
    setEnabled: bench.setEnabled,
  };
  log("PERFORMANCE", "[bench] runner available as window.__otBench");
}
