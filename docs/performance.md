# Performance

This document records the measured behaviour of the location data pipeline and
the baseline that optimisation work is measured against.

## Benchmarking

Enable the harness with `?bench` in the URL, or `bench: true` in
[`config.js`](config.md#bench). This exposes `window.__otBench`:

```js
await __otBench.load(100000); // load 100k synthetic points into the store
__otBench.report(); // print collected timings
await __otBench.tick(20); // simulate 20 live WebSocket updates
await __otBench.sweep(); // run a range of dataset sizes
```

Datasets are generated in the browser from a seeded PRNG
([`src/bench/dataset.js`](../src/bench/dataset.js)), so no fixture files are
needed and every run measures identical data. The walk includes teleports,
periodic low-accuracy points and sparse POIs so that grouping, accuracy
filtering and POI rendering all see representative input.

Timings are collected by [`src/bench/index.js`](../src/bench/index.js), which
is a no-op unless benchmarking is enabled. The instrumentation can therefore
live permanently in the hot paths.

## Methodology

All figures below come from the same pinned configuration (`minAccuracy: 50`,
`maxPointDistance: 1000`) so that runs are comparable. Numbers were taken in
headless Chromium with a SwiftShader (software) WebGL backend; absolute values
on real hardware are lower, but the relative costs and the scaling behaviour
are the point.

One methodology change happened between the baseline and the first round of
optimisation: `tick()` originally waited two animation frames between updates,
which added roughly 33 ms of unrelated floor to every measurement, and it
mutated the store directly. It now drives the same `appendLocationToHistory`
action the WebSocket handler uses and waits only for `nextTick()`, since the
store getters and the MapLibre `setData` calls all run synchronously in
pre-flush watchers. Baseline per-update figures are therefore overstated by
about 33 ms; that does not change any conclusion below.

## Baseline

Measured on the commit that introduced this document.

| Dataset | Full load pipeline | Per live WebSocket update |
| ------- | ------------------ | ------------------------- |
| 10,000  | 156 ms             | 131 ms                    |
| 100,000 | 1281 ms            | 1015 ms                   |

Breakdown of the 100,000 point load:

| Stage                                       | Time   | Per point |
| ------------------------------------------- | ------ | --------- |
| `store:filteredLocationHistoryLatLngGroups` | 75 ms  | 0.76 µs   |
| `store:filteredLocationHistory`             | 57 ms  | 0.58 µs   |
| `store:filteredLocationHistoryLatLngs`      | 43 ms  | 0.44 µs   |
| `map:fitView`                               | 11 ms  | -         |
| `store:assign`                              | 0.1 ms | -         |

### What the numbers say

**Live updates cost the same as a full reload.** A single WebSocket message
costs 1015 ms at 100k points, against 1281 ms for loading the entire dataset
from scratch. Every message re-derives and re-uploads everything, so live
tracking degrades in proportion to how much history is on screen. This is the
dominant problem.

**Assignment is cheap; traversal is not.** `store:assign` is 0.1 ms even at
100k points, because Vue's `ref` proxies lazily rather than converting the
structure up front. The proxy cost is instead paid on every pass over the data,
inside the three chained computeds. Those three passes cost 175 ms combined and
each allocates a fresh copy of the whole dataset.

**Deriving the same data three times.** `filteredLocationHistory` rebuilds every
object, then `filteredLocationHistoryLatLngs` and
`filteredLocationHistoryLatLngGroups` each walk that result and allocate another
N objects. `Map.vue` then walks the result again to build four GeoJSON
`FeatureCollection`s. One update therefore allocates several times the size of
the dataset in intermediates.

**Updates can be silently dropped.** `updateGeoJSON()` guards on
`map.isStyleLoaded()`, which reports `false` whenever MapLibre has pending
source or tile work, not merely before the initial style load. After loading
100k points it was still `false` three seconds later, and a subsequent live
update ran the full derive chain and then discarded the result without
reaching the map. There is no retry, so the map stays stale until some later
update happens to arrive while the style reports ready.

## After: explicit invalidation

The first round of optimisation replaced deep reactivity on the location
history with explicit invalidation. Median of three runs:

| Dataset | Full load         | Per live WebSocket update |
| ------- | ----------------- | ------------------------- |
| 10,000  | 44 ms (was 156)   | 6.1 ms (was 131)          |
| 100,000 | 176 ms (was 1281) | 39.5 ms (was 1015)        |

Per-point costs in the derived getters fell by roughly an order of magnitude,
which is the reactive `Proxy` overhead disappearing now that the history is
held in a `shallowRef` of raw objects:

| Getter                                      | Before  | After    |
| ------------------------------------------- | ------- | -------- |
| `store:filteredLocationHistory`             | 0.58 µs | 0.022 µs |
| `store:filteredLocationHistoryLatLngs`      | 0.44 µs | 0.031 µs |
| `store:filteredLocationHistoryLatLngGroups` | 0.76 µs | 0.093 µs |

### What is still outstanding

Per-update cost still grows with the size of the history (6 ms at 10k against
40 ms at 100k), because every update re-derives all three getters and rebuilds
all four GeoJSON `FeatureCollection`s from scratch. Making an update cost
something proportional to what actually changed, rather than to how much
history is loaded, is the next piece of work, along with client-side sampling
and a streaming JSON decode of the initial fetch.
