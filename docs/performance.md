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

## Baseline

Measured on the commit that introduced this document, in headless Chromium with
a SwiftShader (software) WebGL backend. Absolute numbers on real hardware will
be lower; the relative costs and the scaling behaviour are the point.

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
