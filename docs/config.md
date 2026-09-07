# Configuration

## Overview

All _custom_ configuation is stored in `window.owntracks.config`,
which is a regular JavaScript object - so you can use template strings, spread syntax,
comments and other JS features.

Some of the application state is synced to the URL's query parameters. If a parameter
exists in the URL query, it takes precedence over the configured value - otherwise the
configured value will be used and appended to the URL query.

Start with this:

```js
window.owntracks = window.owntracks || {};
window.owntracks.config = {};
```

**WARNING: if your configuration contains private data (most commonly your tile server**
**access key), make sure to protect access to it properly, e.g. with basic authentication.**

## Options

- `api`
  - [`baseUrl`](#apibaseurl)
  - [`historySlice`](#apihistoryslice)
  - [`fetchOptions`](#apifetchoptions)
- [`endDateTime`](#enddatetime)
- `filters`
  - [`minAccuracy`](#filtersminaccuracy)
- [`ignorePingLocation`](#ignorepinglocation)
- [`locale`](#locale)
- `map`
  - [`circle`](#mapcircle)
  - [`circleMarker`](#mapcirclemarker)
  - `heatmap`
    - [`radius`](#mapheatmapradius)
  - `layers`
    - [`heatmap`](#maplayersheatmap)
    - [`last`](#maplayerslast)
    - [`line`](#maplayersline)
    - [`poi`](#maplayerspoi)
    - [`points`](#maplayerspoints)
  - [`maxNativeZoom`](#mapmaxnativezoom)
  - [`sampling`](#mapsampling)
  - [`controls.scale`](#mapcontrolsscale)
  - [`culling`](#mapculling)
  - [`directionArrows`](#mapdirectionarrows)
  - [`blockSoftwareWebGL`](#mapblocksoftwarewebgl)
  - [`maxPointDistance`](#mapmaxpointdistance)
  - [`poiMarker`](#mappoimarker)
  - [`polyline`](#mappolyline)
  - [`polyline.opacity`](#mappolylineopacity)
  - [`polyline.weight`](#mappolylineweight)
- `onLocationChange`
  - [`fitView`](#onlocationchangefitview)
  - [`reloadHistory`](#onlocationchangereloadhistory)
- [`primaryColor`](#primarycolor)
- `router`
  - [`basePath`](#routerbasepath)
- [`selectedDevice`](#selecteddevice)
- [`selectedUser`](#selecteduser)
- [`showDistanceTravelled`](#showdistancetravelled)
- [`startDateTime`](#startdatetime)
- [`units`](#units)
- [`verbose`](#verbose)
- [`bench`](#bench)

### `api.baseUrl`

Base URL for the recorder's HTTP and WebSocket API. Keep CORS in mind.

- Type: [`String`]
- Default: current protocol and host
- Examples:
  ```js
  // API requests will be made to https://owntracks.example.com/api/0/...
  window.owntracks.config = {
    api: {
      baseUrl: "https://owntracks.example.com",
    },
  };
  ```
  ```js
  // API requests will be made to https://example.com/owntracks/api/0/...
  window.owntracks.config = {
    api: {
      baseUrl: "https://example.com/owntracks/",
    },
  };
  ```

### `api.fetchOptions`

Options for API requests (made with `fetch()`). See [`fetch()` docs on MDN] for details.

You can use this for example to send custom HTTP headers or to include cookies in the request.

- Type: [`Object`]
- Default: `{}`
- Example:
  ```js
  // Include credentials (e.g. cookies)
  window.owntracks.config = {
    api: {
      fetchOptions: {
        credentials: "include",
      },
    },
  };
  ```

### `endDateTime`

Initial end date and time (browser timezone) for fetched data.

- Type: [`Date`]
- Default: today, 23:59:59
- Example:
  ```js
  // Data will be fetched up to 1970-01-01
  window.owntracks.config = {
    endDateTime: new Date(1970, 1, 1),
  };
  ```

### `filters.minAccuracy`

Minimum accuracy in meters for location points to be rendered & included in the travelled distance.

This filter is disabled by default as accuracies can vary across devices and locations, but you're
encouraged to set it as it can be a simple way to remove outliers and vastly improve the travelled
distance calculation.

This setting is the starting value for a live control: "Display settings" carries an accuracy slider,
so the threshold can be tuned against what is actually on screen rather than guessed in advance. The
choice is remembered per browser and takes precedence over this setting on later visits, in the same
way as the unit system and layer visibility. Changing it re-derives from the history already loaded,
so it costs no request.

- Type: [`Number`] or `null`
- Default: `null`
- Example:
  ```js
  // Don't include location points with an accuracy exceeding 100 meters
  window.owntracks.config = {
    filters: {
      minAccuracy: 100,
    },
  };
  ```

### `ignorePingLocation`

Remove the `ping/ping` location from the fetched data. This is useful when using the
`owntracks/recorder` Docker image which has it [enabled for health checks by default](https://github.com/owntracks/recorder/issues/195#issuecomment-304004436).

- Type: [`Boolean`]
- Default: `true`
- Example:
  ```js
  // Don't ignore ping/ping location. Not sure why you'd do this :)
  window.owntracks.config = {
    ignorePingLocation: false,
  };
  ```

### `locale`

The locale to use for the user interface, this affects the language and date/time
formats.

Available languages:

- `cs-CZ` (Standard Czech)
- `da-DK` (Standard Danish)
- `de-DE` (Standard German)
- `en-GB` (British English)
- `en-US` (American English)
- `es-ES` (Castilian Spanish)
- `fr-FR` (Standard French)
- `sk-SK` (Standard Slovak)
- `tr-TR` (Standard Turkish)

Using a locale with non-existent translations is possible and will affect date/time formats, but
use `en-US` for translations.

- Type: [`String`]
- Default: `"en-US"`

### `map.circle`

Appearance of the accuracy circle drawn around each last known location. The
colour comes from the per-user palette and is not configurable.

- Type: [`Object`]
- Default:
  ```js
  {
    fillOpacity: 0.2,
  }
  ```

### `map.circleMarker`

Appearance of the individual history points. The radius is the size at high
zoom; points shrink and lose their outline as you zoom out so that dense tracks
stay readable. The colour comes from the per-user palette.

- Type: [`Object`]
- Default:
  ```js
  {
    radius: 4,
  }
  ```

### `map.heatmap.radius`

Heatmap point radius.

- Type: [`Number`]
- Default: `25`

### `map.layers.heatmap`

Initial visibility of the heatmap layer.

The `map.layers.*` options set what a layer does until it is toggled in
"Display settings". A layer that has been toggled keeps the chosen visibility
per browser and no longer follows its option; one that has not been toggled
follows the option, including after the option is changed.

- Type: [`Boolean`]
- Default: `false`

### `map.layers.last`

Initial visibility of the last locations layer.

- Type: [`Boolean`]
- Default: `true`

### `map.layers.line`

Initial visibility of the line layer.

- Type: [`Boolean`]
- Default: `true`

### `map.layers.poi`

Initial visibility of the POI layer.

- Type: [`Boolean`]
- Default: `true`

### `map.layers.points`

Initial visibility of the location points layer.

- Type: [`Boolean`]
- Default: `false`

### `map.maxNativeZoom`

This is being used to fetch tiles in different resolutions - set to the highest value
the configured tileserver supports.

- Type: [`Number`]
- Default: `19`

### `api.historySlice`

How a history request covering a long date range is split into successive
requests. Each slice is rendered as it arrives, so the track draws
progressively instead of the map staying empty until the whole range has been
transferred.

Slices are contiguous and fetched oldest first. A point appearing at both ends
of adjacent slices is dropped, so an inclusive recorder range does not produce
duplicates.

Set `enabled` to `false` to issue a single request per device as before.

- Type: [`Object`]
- Default:
  ```js
  {
    enabled: true,
    // Slice length in days.
    days: 7,
    // Slices are widened rather than exceeding this, so a very long range
    // cannot turn into hundreds of requests.
    maxSlices: 32,
  }
  ```

### `map.sampling`

Client-side sampling of the location history, so that large data sets stay
responsive at low zoom levels. Points that would land on the same pixel are
dropped before being handed to the renderer, which materially reduces GPU work
and battery use on mobile devices.

Lines are simplified with Douglas-Peucker and the point/heatmap layers are
reduced to one point per grid cell. Sampling is skipped entirely for small data
sets and when zoomed in far enough that individual points are visible, so it
never costs anything in those cases.

- Type: [`Object`]
- Default:
  ```js
  {
    enabled: true,
    // Above this zoom level, draw every point.
    maxZoom: 15,
    // Data sets smaller than this are never sampled.
    minPoints: 5000,
    // How far a point may be from the simplified line, in screen pixels.
    tolerancePixels: 1.5,
  }
  ```

### `map.controls.scale`

Scale bars on the map, drawn bottom right above the attribution.

`metric` and `imperial` are `null` by default, which means "follow the
[`units`](#units) setting" - so a metric install gets a metric bar and an
imperial one gets an imperial bar, with nothing to configure. Set either to
`true` or `false` to show or hide that bar regardless of the units setting;
setting both to `true` draws two bars, one above the other.

- Type: [`Object`]
- Default:
  ```js
  {
    // null follows the `units` setting; true or false overrides it.
    metric: null,
    imperial: null,
    // Widest the bar may be drawn, in pixels.
    maxWidth: 100,
  }
  ```

### `map.culling`

Restrict the geometry handed to the renderer to what is near the viewport.

Sampling reduces detail when zoomed out; culling reduces extent when zoomed in.
Without it, panning around a large history at high zoom hands the renderer every
point of every track on every redraw, even though almost all of it is off
screen. With it, that work is bounded by what is actually visible.

A padded viewport is used so that small pans reuse the previous result, and
culling is skipped entirely when the whole history already fits on screen, which
is the common case for a short date range.

Lines keep the vertices immediately either side of the visible run, so a track
that crosses the viewport still enters and leaves at the correct angle rather
than being clipped to its visible vertices.

- Type: [`Object`]
- Default:
  ```js
  {
    enabled: true,
    // Data sets smaller than this are never culled.
    minPoints: 5000,
    // Extra viewport-widths kept either side, so small pans need no rebuild.
    padding: 0.5,
  }
  ```

### `map.directionArrows`

Whether to draw arrows along the history line showing the direction of travel.

- Type: [`Boolean`]
- Default: `true`

### `map.blockSoftwareWebGL`

Whether to refuse to render the map when only a software WebGL renderer is
available. Software rendering is slow but usable, so by default the map is
shown with a dismissible warning instead.

- Type: [`Boolean`]
- Default: `false`

### `map.maxPointDistance`

Maximum distance (in meters) between points for them to be part of the the same line.
This avoids straight lines going across the map when there's a ceartain distance between
two points (which often indicates that they're not related). Set to `null` to disable
splitting into separate lines.

- Type: [`Number`] or `null`
- Default: `null`
- Example:
  ```js
  // Don't connect points with a distance of more than 1km
  window.owntracks.config = {
    map: {
      maxPointDistance: 1000,
    },
  };
  ```

### `map.polyline.opacity`

Opacity of the location history line.

- Type: [`Number`]
- Default: `0.8`

### `map.polyline.weight`

Width of the location history line, in pixels.

- Type: [`Number`]
- Default: `3`

### `map.poiMarker`

Appearance of points of interest. The colour comes from the per-user palette.

- Type: [`Object`]
- Default:
  ```js
  {
    fillOpacity: 0.2,
    radius: 12,
  }
  ```

### `map.polyline`

Appearance of the history line. See
[`map.polyline.weight`](#mappolylineweight) and
[`map.polyline.opacity`](#mappolylineopacity). The colour comes from the
per-user palette.

- Type: [`Object`]
- Default:
  ```js
  {
    opacity: 0.8,
    weight: 3,
  }
  ```

### `onLocationChange.fitView`

Whether to re-fit the map's content into view or not when a location update is received.

This can be useful if you're showing live locations and don't want them to "leave" the map.

- Type: [`Boolean`]
- Default: `false`

### `onLocationChange.reloadHistory`

Whether to reload the location history (of selected date range) or not when a location
update is received.

- Type: [`Boolean`]
- Default: `false`

### `primaryColor`

Primary color for the user interface (navigation bar and various map elements).

- Type: [`String`] ([CSS `<color>`])
- Default: `"#3f51b5"` (primary color from the OwnTracks Android app)
- Example:
  ```js
  // Set the UI's primary color to 'rebeccapurple'
  window.owntracks.config = {
    primaryColor: "rebeccapurple",
  };
  ```

### `router.basePath`

Base path of the application deployment.

- Type: [`String`]
- Default: `"/"`
- Example:
  ```js
  // Frontend will be reachable at https://example.com/owntracks
  window.owntracks.config = {
    router: {
      basePath: "/owntracks",
    },
  };
  ```

### `selectedDevice`

Initial selected device. All devices will be shown by default if `null`. Will be ignored
if [`selectedUser`](#selectedUser) is `null`.

Only data for the selected user/device will be fetched, so you can use this to limit the
amount of data fetched after page load.

- Type: [`String`] or `null`
- Default: `null`
- Example:
  ```js
  // Select the device 'phone' from user 'foo' by default
  window.owntracks.config = {
    selectedUser: "foo",
    selectedDevice: "phone",
  };
  ```

### `selectedUser`

Initial selected user. All users will be shown by default if `null`.

Only data for the selected user/device will be fetched, so you can use this to limit the
amount of data fetched after page load.

- Type: [`String`] or `null`
- Default: `null`
- Example:
  ```js
  // Select all devices from user 'foo' by default
  window.owntracks.config = {
    selectedUser: "foo",
  };
  ```

### `showDistanceTravelled`

Whether to calculate and show the travelled distance of the last fetched data in the
header bar. `maxPointDistance` is being takein into account, if a distance between two
subsequent points is greater than `maxPointDistance`, it will not contibute to the
calculated travelled distance.

This also includes a calculation of elevation gain / loss.

- Type: [`Boolean`]
- Default: `true`

### `startDateTime`

Initial start date and time (browser timezone) for fetched data.

- Type: [`Date`]
- Default: one month ago, 00:00:00
- Example:
  ```js
  // Data will be fetched from the first day of the current month
  const startDateTime = new Date();
  startDateTime.setHours(0, 0, 0, 0);
  startDateTime.setDate(1);
  window.owntracks.config = {
    startDateTime,
  };
  ```

### `units`

Unit system used for speed, distance and altitude displays. Speed is shown as
km/h or mph, distance switches between m / km or ft / mi, and altitude is
shown in m or ft.

When set to `null` (the default), the unit system is derived from
[`locale`](#locale): `en-US` defaults to imperial, every other locale defaults
to metric. Set this option explicitly to override the locale-based guess.

This option applies unless a unit system has been chosen at runtime, in which
case the choice is remembered per browser and wins. Nothing in the interface
makes that choice today, so in practice this option is what decides.

- Type: [`String`] (`"metric"` or `"imperial"`) or `null`
- Default: `null`
- Example:
  ```js
  // Force imperial units regardless of the configured locale
  window.owntracks.config = {
    units: "imperial",
  };
  ```

### `verbose`

Whether to enable verbose mode or not.

- Type: [`Boolean`]
- Default: `false`

### `bench`

Whether to enable the performance benchmarking harness. When enabled, timings
are collected for the location data pipeline and a runner is exposed as
`window.__otBench` for loading synthetic datasets and printing reports. This is
a development aid and adds a lazily loaded chunk to the page.

Can also be enabled per-page-load by adding `?bench` to the URL.

- Type: [`Boolean`]
- Default: `false`
- Example:
  ```js
  // In the browser console, with benchmarking enabled:
  await __otBench.load(100000); // load 100k synthetic points
  __otBench.report(); // print collected timings
  await __otBench.tick(50); // simulate 50 live WebSocket updates
  ```

[`boolean`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean
[`date`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
[`number`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number
[`object`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object
[`string`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String
[css `<color>`]: https://developer.mozilla.org/en-US/docs/Web/CSS/color_value
[`fetch()` docs on mdn]: https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch#parameters
