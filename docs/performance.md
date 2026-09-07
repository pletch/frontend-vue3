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

## After: single-pass derivation

The second round collapsed the derivation. The three chained store getters and
the four separate `FeatureCollection` rebuilds became one pass over the raw
history (`mapGeoData`) that produces coordinate arrays directly in the shape
MapLibre consumes.

Two changes did most of the work:

- **One `MultiPoint` feature per user instead of one `Point` feature per
  location.** MapLibre renders every coordinate of a `MultiPoint` for both
  circle and heatmap layers, and colour is a per-user property, so 100,000
  feature objects collapse into one per user. The history points and the
  heatmap are the same coordinates rendered two ways, so they now share a
  single source and are uploaded once.
- **Coordinate arrays are shared.** The same `[lng, lat]` arrays back the line
  segments and the point layers, so building the feature collections allocates
  nothing proportional to the number of points. `geojson:points` previously
  cost 22 ms at 100k to emit 50 features, because it walked the whole filtered
  history looking for sparse POIs.

`fitView` also uses bounds accumulated during that pass rather than walking
every point again.

| Dataset | Full load | Per live WebSocket update |
| ------- | --------- | ------------------------- |
| 10,000  | 36 ms     | 2.5 ms                    |
| 100,000 | 113 ms    | 8.3 ms                    |

Building all four feature collections now costs under 0.1 ms at 100k points,
against 29 ms before. Cumulatively against the original baseline:

| Dataset           | Baseline | Now    | Change |
| ----------------- | -------- | ------ | ------ |
| Full load, 100k   | 1281 ms  | 113 ms | 11x    |
| Live update, 100k | 1015 ms  | 8.3 ms | 122x   |

Per-update cost still grows with history size, because an update re-runs the
whole pass rather than touching only what changed. Making updates incremental,
sampling at low zoom, and streaming the initial fetch are the remaining work.

## After: incremental updates

Profiling a live update after the single-pass change showed `mapGeoData` was
89% of the remaining cost (135 ms of 152 ms across 20 updates), because a
single new point still re-derived all 98,000 points.

The derivation is now maintained incrementally instead of recomputed. The
store keeps the derived structure as internal state with a per-device cursor,
and one incoming location extends it in constant time. A full rebuild still
happens whenever the history is replaced, or when a point arrives out of order
or replaces an existing timestamp, since either invalidates the tail.

| Dataset | Full load | Per live WebSocket update |
| ------- | --------- | ------------------------- |
| 10,000  | 36 ms     | 0.42 ms                   |
| 100,000 | 104 ms    | 0.60 ms                   |

The point is not only that this is faster: per-update cost is now effectively
flat in the size of the history (0.42 ms at 10k against 0.60 ms at 100k),
where it had been proportional to it. Live tracking no longer degrades as more
history is loaded.

Because the incremental and full-rebuild paths must agree, the test suite
asserts they produce identical output across multiple users and devices, and
under both accuracy filtering and line splitting.

### Cumulative

| Dataset           | Baseline | Now     | Change |
| ----------------- | -------- | ------- | ------ |
| Full load, 10k    | 156 ms   | 36 ms   | 4.3x   |
| Full load, 100k   | 1281 ms  | 104 ms  | 12x    |
| Live update, 10k  | 131 ms   | 0.42 ms | 310x   |
| Live update, 100k | 1015 ms  | 0.60 ms | 1690x  |

Remaining: client-side sampling at low zoom, and a streaming decode with
byte-level progress for the initial fetch.

## After: client-side sampling

At low zoom most points land on the same pixel, so drawing all of them costs
GPU time and battery without changing what the user sees. Lines are now
simplified with Douglas-Peucker and the point and heatmap layers reduced to one
point per grid cell, with the tolerance derived from the current zoom.

Sampling is skipped for data sets below `map.sampling.minPoints` and above
`map.sampling.maxZoom`, so it never costs anything where it would not help.

Coordinates handed to the renderer, from a 98,000 point history:

| Zoom | Line coordinates | Point coordinates |
| ---- | ---------------- | ----------------- |
| 4    | 1,429            | 2,602             |
| 8    | 6,416            | 43,156            |
| 12   | 40,444           | 95,166            |
| 16   | 98,000           | 98,000            |

At zoom 7.5 the rendered track is visually indistinguishable from the
unsampled one while using 2,975 coordinates instead of 58,800.

### Sampling had to be incremental too

A naive implementation re-simplified everything whenever the data changed,
which cost 9.1 ms per live update at 100k points and undid the incremental
update path entirely. The sampler now extends its previous result with only
the points that have arrived since:

|                         | Naive    | Incremental |
| ----------------------- | -------- | ----------- |
| `map:sample` per update | 9.075 ms | 0.042 ms    |
| Live update at zoom 8   | 10.67 ms | 1.52 ms     |

Because the distance rule applied to new points is weaker than a full
Douglas-Peucker pass, a segment's retained points are periodically
re-simplified. That runs over the reduced set rather than the source data, so
it stays cheap while bounding how far the incremental result can drift.

## Loading feedback

The history request is read as a stream so that progress can be reported in
bytes rather than shown as an unchanging spinner. The loading dialog shows a
determinate bar when the recorder provides a usable `Content-Length`, and how
much has arrived otherwise.

`Content-Length` describes the bytes on the wire while the stream yields
decoded bytes, so with compression enabled the declared total is an
underestimate. Rather than drive a bar past 100%, progress is marked unreliable
once the total is exceeded and the UI falls back to showing the amount
received. Both fields are reported as deltas so that the several per-device
requests making up one load can be aggregated.

Verified against a 4.3 MB payload served in 20 chunks: the dialog counted from
5% to 100% with correct byte formatting.

A streaming JSON _decoder_, which would let points appear as they arrive rather
than after the body is complete, is still outstanding. Byte progress addresses
the "no idea whether it is nearly done" problem; incremental decoding would
additionally shorten time-to-first-pixel.

## Columnar history storage

The location history is the largest thing the app retains. Holding it as one
JavaScript object per location was measured at roughly 33 MB per 250,000
locations when their strings are shared, and 61 MB when each record carries
distinct strings as a real recorder response does.

It is now stored column by column in typed arrays (`src/track.js`), keeping
only the fields the app reads from history. Popups are shown for last-known
locations and for the playback marker, never for a history point, so a full
record is only ever needed one at a time and is materialised on demand by
`Track.at()`.

Measured in the app, median of three runs at 250,000 points:

| Retained heap  | Before | After |
| -------------- | ------ | ----- |
| 250,000 points | 59 MB  | 35 MB |

That is a 1.7x reduction rather than the 5x the isolated measurement of the
raw history suggested, and the gap is worth recording. The derived rendering
data is now the larger share: `mapGeoData` holds one two-element `[lng, lat]`
array per point, because that is what a GeoJSON source requires. Those arrays
are untouched by this change and now dominate what is retained.

Reducing them further would mean not handing MapLibre GeoJSON at all, which is
a much larger change than this one.

### Correction: how much they actually cost

"Dominate" above overstated it, and the figure is worth correcting because it
is the case for converting `mapGeoData` to typed arrays. Measured directly at
250,000 points:

| Retained                     | MB   |
| ---------------------------- | ---- |
| Whole app                    | 30.5 |
| `Track` columnar arrays      | 9.5  |
| `mapGeoData` coordinates     | 11.5 |
| Map, GL, framework, the rest | ~9.5 |

The coordinate pairs are 38% of the heap, not two thirds. The earlier estimate
assumed each point's `[lng, lat]` was allocated twice, once for its segment and
once for the per-user cloud. It is not: one array is allocated and pushed into
both.

Converting them to an interleaved `Float64Array` was measured at 3.8 MB against
11.5 MB, so it would save about 7.7 MB of a 30.5 MB heap. It is not worth
doing. MapLibre's GeoJSON source needs nested arrays, and the builders
currently hand `segment.coordinates` over by reference with no copy at all.
Storing them columnar would force materialisation on every redraw, measured at
30.8 ms to rebuild 250,000 nested pairs - and sampling does not save you,
because above `map.sampling.maxZoom` the sampler passes the source through
untouched, so the full cost would land on exactly the interactive path.

Trading 7.7 MB for a 3x worse redraw is the wrong direction.

## After: viewport culling

Sampling reduces detail when zoomed out. Above `map.sampling.maxZoom` it is
deliberately off, and there was nothing reducing extent: every point of every
track went to the renderer on every redraw no matter how little of it was on
screen.

`src/cull.ts` restricts the drawn geometry to a padded viewport. It runs after
sampling rather than before, because the sampler invalidates its cache on the
identity of the arrays it is handed, and culling upstream would give it a fresh
array every time and force a full re-simplification on every update.

Lines are not simply clipped to their visible vertices. A vertex is kept when
an edge on either side of it touches the viewport, so a track enters and leaves
at the correct angle, and an edge whose endpoints are both outside is tested
with a Liang-Barsky clip so a long jump straight across the viewport is still
drawn. A track that leaves and returns becomes several features.

Measured at 117,600 points, zoom 16, over 20 live updates:

| Per update                     | Without culling | With culling |
| ------------------------------ | --------------- | ------------ |
| Point coordinates handed over  | 117,631         | 7            |
| Line features handed over      | 596             | 2            |
| Main-thread time, 20 updates   | 2,760 ms        | 1,711 ms     |
| Script time, 20 updates        | 276 ms          | 292 ms       |

The script time is the honest part of the story: culling makes the JavaScript
slightly *slower*, because deciding what to keep means walking the points,
where handing the arrays over by reference costs nothing. The 1,049 ms that
disappears is MapLibre's own work - tile building and buffer uploads - which is
proportional to the coordinates it is given.

These runs use software rendering, which overstates rasterisation, so the
painting share of that saving would be smaller on a real GPU. The tile-building
share is CPU-bound either way.

Because the cull bounds are padded by half a viewport, an ordinary pan reuses
the previous result: twelve half-screen pans provoked six rebuilds, not twelve.
Culling is skipped entirely when the whole history already fits on screen,
which is the common case for a short date range, and below
`map.culling.minPoints`.

## Bundle size

The application shipped as a single 1.46 MB chunk that had to be downloaded and
parsed before anything appeared. Splitting it by what actually changes and what
is actually needed first:

| Chunk                        | Raw       | gzip   | On the critical path |
| ---------------------------- | --------- | ------ | -------------------- |
| `index` (application)        | 133.6 kB  | 33.7 kB | yes                 |
| `vendor` (Vue, router, i18n) | 166.0 kB  | 62.1 kB | yes                 |
| `datetime` (moment, picker)  | 102.3 kB  | 33.5 kB | yes                 |
| `maplibre-gl`                | 1,053.9 kB | 284.9 kB | no                 |

| Bytes before first paint | Before | After  |
| ------------------------ | ------ | ------ |
| JavaScript, gzipped      | 414 kB | 130 kB |
| CSS, gzipped             | 18 kB  | 18 kB  |

MapLibre is three quarters of the bundle on its own and is imported dynamically
by `Map.vue`, so the shell renders without waiting for it. `main.js` starts
that fetch as the app boots rather than leaving it until the map mounts, which
would cost an extra round trip.

Its *stylesheet* is deliberately not deferred with it, and the reason is worth
recording because deferring it looks free and is not. Vite emits a dynamically
imported stylesheet as its own file, appended to the head after the
application's own. That inverts the cascade between two single-class rules of
equal specificity: MapLibre's `.maplibregl-map { position: relative }` starts
beating Tailwind's `.absolute` on the map container, which then has no
positioned box and collapses to zero height. The map renders into a 0-pixel
container - `queryRenderedFeatures` still answers, so it looks fine to
anything but a screenshot. Keeping the 10 kB on the critical path keeps the
ordering deterministic.

Moment was the suspect before measuring and turned out not to be the problem:
60.8 kB raw, 19.7 kB gzipped, because Vite drops its locales. Replacing it
would save less than the measurement error on the map library.
