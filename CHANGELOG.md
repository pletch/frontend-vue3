# Changelog

Dates are in UTC.

## [Unreleased] (2026-06-09)

### Added

- Added locale units configuration (default: metric) for distance, speed, and elevation.
- Completed full migration of frontend application to Vue 3 Composition API.
- Implemented Tailwind CSS and removed extensive legacy SCSS code.
- Added Pinia for robust state management, replacing legacy Vuex store files.
- Added dynamic color assignments per user route, ensuring high-contrast colors distinct from terrain.
- Introduced custom circular map markers to replace static SVG pins, complete with initials and Tracker IDs.
- Display real-time dynamic user activity glyphs (Driving, Cycling, Walking) on map markers using `motionactivities` payload.
- Automatically track and render live route lines efficiently as new points stream via WebSockets without heavy API reloads.
- Upgraded the pop-up modal to gracefully display current Activity states and Velocity.
- Parse Battery Status (`bs`) payload to dynamically display a green charging icon when device is plugged in.
- Implemented an option in "Display settings" to hide users whose last fix is more than 48 hours old. It hides the user entirely: marker, track, points, POIs and legend entry, and "fit view" ignores their extent.
- Integrated Photon API to dynamically reverse-geocode and display the closest address in the map popup when a device location lacks a predefined address.
- Guaranteed that individually selected users bypass the stale marker filter to always display.
- Enhanced Date Picker with additional shortcuts for "4 hours", "8 hours", "12 hours", and "24 hours".
- Fixed mobile rendering bugs in the Date Picker by injecting responsive CSS overrides to correctly stack the time selection panels without overflowing the screen.
- Resolved race conditions in map marker popups by replacing static DOM manipulation with dynamic Vue `render()` loops, ensuring real-time metadata stays in sync.
- Implemented rapid interval-shifting Left/Right arrow navigation to quickly skip through time blocks.
- Added a new real-time Play/Pause button in the header to easily suspend live websocket ingestion.
- Implemented automatic real-time ticking for the `endDateTime` display while streaming live data.
- Automatically pause real-time updates when shifting or selecting a historic time window entirely in the past.
- Completely replaced the legacy Leaflet map engine with a high-performance MapLibre GL JS WebGL engine, bringing support for modern vector tiles and high-frame-rate rendering.
- Ported the Route Playback feature to native MapLibre GL JS, allowing smooth animation of historic user routes.
- Upgraded the playback ghost marker to dynamically render motion activity icons based on `motionactivities`.
- Display exact speed and elevation data directly inside the playback marker popup using automatic unit conversion.
- Added a custom WebGL support check and fallback modal to warn users when hardware acceleration is disabled.
- Fixed an issue where the velocity unit system would flap between mph and km/h when a user stopped moving.
- Resolved an issue where playback markers would linger on the map after clearing the active device context.
- Cleaned up the standard location popup to prevent timezone information from overflowing the modal container.
- Added a benchmarking harness (`?bench` or `bench: true`) that measures the location data pipeline and can load synthetic datasets via `window.__otBench`. See `docs/performance.md`.
- Software WebGL renderers no longer trigger the full-screen "hardware acceleration required" block; they show a dismissible warning instead, restoring the map for users on VMs, over RDP, or without a GPU driver. The old behaviour is available via `map.blockSoftwareWebGL`.
- Added a connection error banner with a retry action, shown when the recorder cannot be reached.
- History points and the heatmap now share one map source and are drawn from a single `MultiPoint` feature per user rather than one feature per location, and all map data is derived in a single pass over the history. Building the map's GeoJSON at 100k points went from 29 ms to under 0.1 ms.
- Live location updates are now applied incrementally rather than re-deriving the whole history, making the cost of an update independent of how much history is loaded (0.6 ms at 100k points, against 1015 ms originally).
- Added client-side sampling of the location history (`map.sampling`). Lines are simplified and points reduced to one per grid cell at low zoom, cutting a 98k point history to 1,429 line coordinates at zoom 4 with no visible difference. Sampling is incremental, so it does not slow down live updates, and is skipped entirely for small data sets and at high zoom.
- Added viewport culling of the drawn geometry (`map.culling`). Sampling reduces detail when zoomed out; this reduces extent when zoomed in, where sampling is deliberately off and the whole history was otherwise handed to the renderer on every redraw regardless of how little of it was on screen. Lines keep the vertex either side of the visible run, and an edge that crosses the viewport with both ends outside it is kept, so tracks still enter and leave at the correct angle. The viewport is padded, so an ordinary pan reuses the previous result; culling is skipped entirely when the whole history already fits on screen.
- MapLibre is now loaded as its own chunk rather than in the entry bundle, and the framework and date-handling dependencies are split out from application code so that a redeploy does not invalidate them in the browser cache. The JavaScript needed before the interface can render dropped from 414 KB to 130 KB gzipped; the map library is fetched in parallel as the app boots. Its stylesheet stays in the main bundle deliberately - loaded as a separate file it lands after the application's own CSS and its `.maplibregl-map { position: relative }` beats Tailwind's `.absolute` on the map container, collapsing the map to zero height.
- Added arrows along the history line showing direction of travel (`map.directionArrows`).
- History points now shrink and lose their outline as you zoom out, so dense tracks no longer turn into a solid mass.
- Mobile: interactive controls now meet the 44px touch target minimum. Controls keep their visual size and gain a larger hit area on coarse pointers only, so the desktop layout is unchanged.
- Mobile: the map zoom and compass buttons are hidden on touch devices, where pinch-zoom is the natural gesture and they only take up a corner of an already small map.
- Mobile: added safe-area handling (`viewport-fit=cover` plus insets) so the playback bar and map attribution clear the home indicator on notched phones.
- Mobile: the route playback bar spans the available width and sits above the map attribution instead of colliding with it.
- The loading dialog now shows a byte-level progress bar for the history request instead of an unchanging spinner, falling back to the amount received when the recorder does not provide a usable `Content-Length`.
- Multiple users can now be shown at once. The user dropdown is a multi-select with a colour dot per user, and the selection is shared in the URL as `users=alice,bob` (the older `user=` parameter is still read).
- Added a colour legend on the map when more than one user is visible.
- Each user now keeps a distinct, stable colour. Colours were previously assigned in the order users happened to be drawn, so they changed between reloads and as users appeared.
- The date range arrows now step by the whole shown interval rather than half of it, giving contiguous non-overlapping windows for browsing history day by day. Stepping forward stops at the present.
- The date range is now typeable, so a specific date can be entered directly instead of clicking through the calendar.
- Long date ranges are now requested in slices (`api.historySlice`) and rendered as each slice arrives, so the map fills in progressively instead of staying empty until the whole range has transferred.
- The loading indicator is no longer a blocking modal; it is a compact progress pill so the map stays visible while data loads.
- The location history is now stored in typed arrays column by column rather than as one object per location, cutting retained memory for a 250k point history from about 59 MB to about 35 MB. Fields the app never reads are no longer kept at all.
- Began converting the codebase to TypeScript, starting with the pure-logic modules: `track`, `history`, `simplify` and `sampler`. `allowJs` is on and `checkJs` off, so the remaining JavaScript is unaffected and conversion can continue file by file. Added a `npm run typecheck` script.
- Corrected the `OTLocation` type declaration, which was missing `motionactivities` and `addr` despite both being used, and marked `_http` and `disptst` required when they are not.
- Moved `puppeteer` from `dependencies` to `devDependencies`; it is a test-harness dependency and was being installed in production installs.
- Converted the store, API client, `util` and `config` to TypeScript, alongside the pure-logic modules.
- Converted every component to TypeScript, so all application code is now type checked.
- Converted the last JavaScript in `src/` - `main`, `router`, `i18n`, `constants` and `logging` - to TypeScript. `logging` gains a `LogLevel` union, so an invalid level is now a compile error rather than a message silently dropped at runtime.
- Turned on `checkJs` and put the remaining JavaScript (the benchmark harness) and every test file into the type checker's `include`. Nothing outside `src/**/*.ts` and `*.vue` had ever been checked, which was about 3,400 lines.
- Wired `npm run typecheck` into the test workflow. The script existed but no workflow ran it.
- `map.polyline.weight` and `map.polyline.opacity` now work. Both were read by the map but never declared, defaulted or documented, so setting either had no effect.

- Removed the orphaned SCSS files (`src/styles/*.scss`) and the empty `<style lang="scss">` blocks that were the only remaining reason to compile SCSS, along with the `sass` dependency. Styling has been Tailwind-only since the Vue 3 migration; none of these files were imported by anything.
- Removed the `lint:scss` step from the lint workflow. There is no `lint:scss` script in `package.json`, so the step failed on every push.

- Added scale bars to the map (`map.controls.scale`), drawn bottom right above the attribution. By default they follow the `units` setting, so there is nothing to configure; `metric` and `imperial` can each be set explicitly to override that, and setting both draws two bars.

- The accuracy filter is now a live control rather than a fixed setting. "Display settings" carries a slider over useful thresholds, so it can be tuned against what is on screen instead of being guessed in advance and deployed. `filters.minAccuracy` becomes its starting value; the choice is then remembered per browser. Changing it re-derives from the history already loaded, so it costs a single pass and no request. Upstream owntracks/frontend#84.

- Added a units control to "Display settings". It offers metric, imperial, and automatic - automatic being the absence of a choice, where the unit system comes from the `units` option or, failing that, the locale. The option label names what automatic resolves to. Everything follows immediately: the accuracy filter's label, the scale bar, popups and travel statistics.

### Fixed

- `OTLocation.created_at` was declared as a string, but the recorder sends epoch seconds. Nothing broke because the popup that reads it already accepted both, which is how the mistake survived. Found by type checking the benchmark harness.
- `getLocationHistoryCount` was declared to take a `TrackHistory`, but the load path passes it the raw API response as a progress counter. It only ever reads `.length`, so both work; the signature now says so.
- Removed `tests/setup.js`, which required `jest-fetch-mock` - a package that is not a dependency and is not installed. No test configuration referenced the file, so it had simply been dead.
- `units` and `map.layers` were written into browser storage from the configuration on first load, after which every later change to either was silently ignored. Only an explicit choice is stored now, so the configuration applies until the user makes one. Existing installations keep the layers they have actually toggled: a stored snapshot is reduced to the entries that differ from the configuration, which changes nothing visible and frees the rest to follow it again. This also means a layer added to the schema later shows up for existing installations instead of being missing from their snapshot.
- The units value left in storage by earlier versions is discarded rather than honoured. No interface has ever written it - there is no units control - so any value there was a frozen configuration default rather than a preference.
- The close button on a device popup was all but invisible. MapLibre ships it unstyled - a 12px glyph pinned to the corner with no padding of its own - which works against the library's default content padding but not against ours, which is zero: it landed on the border radius as a 7px sliver. It is now a 28px button with its own background, growing to 44px on touch devices, and the device name is kept clear of it.

- A location history crossing the 180th meridian was drawn as a line all the way back around the world. Recorded longitudes wrap into -180..180, so a two-degree step across the seam reads as 358 degrees the other way. Each point's longitude is now shifted by whole turns to sit nearest the one before it, which is what GeoJSON allows longitudes outside the normal range for. Upstream owntracks/frontend#157.
- A shared link's map position was ignored. `populateStateFromQuery` ran in the app's `onMounted`, but Vue mounts children before parents, so the map had already been created from the default centre and zoom. It now runs during setup.
- `populateStateFromQuery` assigned the unparsed latitude string to the map state while parsing only the longitude, and the mirror image for longitude, leaving a string where a number was expected.
- URL parameters were silently discarded on load: the app mounted before the router had resolved its initial navigation, so `route.query` was empty and every shared link fell back to the defaults. Shared links now restore the date range, users, layers and map position.
- Loading a link to a past date range no longer has its end date dragged to the present by the real-time ticker.
- Mobile: opening a device popup no longer leaves it clipped behind the navigation panel; the panel now closes when a popup opens or the map is tapped.
- Mobile: the user legend was drawn behind the playback bar, which spans nearly the full width on phones, so the lower entries were hidden. The legend now sits above the bar when playback is available, and a long roster scrolls within a capped height instead of running off the bottom of the display.
- The "hide stale users" filter only removed a user's marker, leaving their track, points and POIs drawn and their name in the legend. It now hides the user's geometry entirely, and "fit view" no longer zooms out to include an extent that is not being drawn.
- Staleness was measured against the wall clock, so browsing any date range that ended more than two days ago hid every user. It is now measured back from the end of the displayed window, clamped to the present so an end date set in the future cannot loosen the filter instead.
- Mobile: the date range is no longer truncated. It now fits down to 320px-wide screens, verified at 320, 360, 390 and 430px.
- Requests to an unreachable recorder no longer crash the page. `fetchApi()` swallowed network errors and returned `undefined`, and every caller then dereferenced `response.json()`, producing an unhandled `TypeError` and a blank map. Failures now surface as an `ApiError` and are reported in the UI.
- Live location updates no longer cost time proportional to the entire loaded history. The history is held in a `shallowRef` with explicit invalidation instead of deep reactivity, cutting a live update at 100k points from ~1015 ms to ~40 ms and a full load from ~1281 ms to ~176 ms.
- Live updates are no longer silently discarded. `updateGeoJSON()` guarded on `map.isStyleLoaded()`, which reports false whenever MapLibre has pending source or tile work, so after a large load every subsequent update did the full derive work and then threw it away, leaving the map stale.
- The map no longer re-fits to the data on every live location update, which ignored `onLocationChange.fitView` and dragged the view out from under the user. It now re-fits only when the history is replaced wholesale.
- Incoming WebSocket locations are placed with a binary search instead of re-sorting the whole device history on every message.

### Changed

- Removed configuration options that stopped doing anything when the map moved from Leaflet to MapLibre: `map.attribution`, `map.controls`, `map.maxZoom`, `map.tileSize`, `map.url`, `map.urlDark` and `map.zoomOffset`. Setting them had no effect; they are now gone from the defaults, the types and the documentation.
- Removed the per-layer colour options superseded by per-user colouring, and the heatmap options the MapLibre heatmap does not read: `color` and `fillColor` on `map.circle`, `map.circleMarker`, `map.poiMarker` and `map.polyline`, `map.circleMarker.fillOpacity`, and `map.heatmap.blur`, `map.heatmap.gradient` and `map.heatmap.max`. All were documented but inert.

- Converted core components (`AppHeader.vue`, `Map.vue`, `LDeviceLocationPopup.vue`, `LHeatmap.vue`) to native `<script setup>` syntax.
- Completely rebuilt map rendering logic to be proxy-aware and avoid infinite recursion crashes with Leaflet and Vue 3.
- Renamed "Layer settings" button to "Display settings" for better clarity.

## 2.15.3 (2024-06-15)

- Force relative path for `config/config.js` even if it doesn't exist at build time

## 2.15.2 (2024-06-14)

- Fix npm lockfile

## 2.15.1 (2024-06-14)

- Update `index.html` to emit relative paths again, allowing deployment under a subpath
- Update Docker image to use nginx 1.27
- Upgrade dependencies

## 2.15.0 (2024-06-10)

- Implement POI map layer (see [Booklet](https://owntracks.org/booklet/features/poi/))
  - Use the `map.poiMarker` config option to tweak the appearance, defaults to a red circle slightly larger than the default location points
  - Use `map.layers.poi` to change the layer visibility, defaults to `true`

## 2.14.0 (2024-06-09)

- Implement new date/time range picker ([#116](https://github.com/owntracks/frontend/pull/116), [@jduar](https://github.com/jduar) / [@Tofee](https://github.com/Tofee))

## 2.13.1 (2024-06-09)

- Bump versions, just to make sure the frontend shows the right one

## 2.13.0 (2024-06-09)

- Enable use of the frontend as a progressive web app (PWA) ([#98](https://github.com/owntracks/frontend/pull/98), [@RobinMeis](https://github.com/RobinMeis))
- Add Turkish translations ([#94](https://github.com/owntracks/frontend/pull/94), [@ramazansancar](https://github.com/ramazansancar))
- Add Slovak translations ([#110](https://github.com/owntracks/frontend/pull/110), [@aasami](https://github.com/aasami))
- Add Czech translations ([#115](https://github.com/owntracks/frontend/pull/115), [@jmencak](https://github.com/jmencak))
- Add action for uploading dist/ on release ([#114](https://github.com/owntracks/frontend/pull/114), [@abaumg](https://github.com/abaumg))
- Replace outdated Twitter link with Mastodon
- Remove the download modal
- Show isolocal and tzname properties on the popup
- Various changes to the underlying frontend build system:
  - Bump node to version 20
  - Switch from yarn to npm
  - Migrate from vue-cli / webpack to vite
- Upgrade dependencies

## 2.12.0 (2022-09-06)

- Add Danish translation ([#87](https://github.com/owntracks/frontend/pull/87), [@atjn](https://github.com/atjn))
- Ensure correct display of larger (192x192) face images ([#83](https://github.com/owntracks/frontend/pull/83), [@atjn](https://github.com/atjn))
- Add `map.tileSize` and `map.zoomOffset` options ([#75](https://github.com/owntracks/frontend/pull/75), [@saesh](https://github.com/saesh))
- Upgrade dependencies

## 2.11.0 (2022-03-16)

- Show WiFi SSID and BSSID in location popup, if available
- Show address in location popup, if available ([#73](https://github.com/owntracks/frontend/pull/73), [@saesh](https://github.com/saesh))
- Upgrade dependencies

## 2.10.0 (2021-11-28)

- Ensure location history line segments are drawn in chronological order ([#67](https://github.com/owntracks/frontend/issues/67))
- Add trailing slashes to paths used by Docker nginx config ([#63](https://github.com/owntracks/frontend/pull/63), [@growse](https://github.com/growse))
- Upgrade dependencies

## 2.9.0 (2021-05-01)

- Add a cancel button to the loading data modal
- Replace remaining uses of "OwnTracks UI" with "OwnTracks Frontend"
- Upgrade dependencies

## 2.8.0 (2021-02-19)

- Add elevation gain / loss to "distance travelled" calculation ([#51](https://github.com/owntracks/frontend/issues/51))

## 2.7.0 (2021-02-14)

- Rename translation files from `xx` to `xx-XX` format to allow different language variants
- Separate `en` translations into British English (`en-GB`) and American English (`en-US`, default)
- Add French translations ([#49](https://github.com/owntracks/frontend/pull/49), [@Elu43](https://github.com/Elu43))
- Update Docker image to use Node 14 and nginx 1.18
- Upgrade dependencies

## 2.6.0 (2020-12-29)

- Add `router.basePath` config option for non-webroot deployments
- Configure Vue to not assume it's on the web root ([#47](https://github.com/owntracks/frontend/pull/47), [@growse](https://github.com/growse))
- Update Docker NGINX config to listen on IPv6 as well ([#46](https://github.com/owntracks/frontend/pull/46), [@growse](https://github.com/growse))
- Upgrade dependencies

## 2.5.1 (2020-10-27)

- Fix incorrect handling of `api.baseUrl` with trailing slash ([#44](https://github.com/owntracks/frontend/pull/44), [@karmanyaahm](https://github.com/karmanyaahm))
- Upgrade dependencies

## 2.5.0 (2020-09-07)

- Add `filters.fitView` config option - this will prevent the map from re-fitting automatically by default when a live location changes ([#41](https://github.com/owntracks/frontend/issues/41))
- Show regions for location on popup
- Fix vertical offset of non-pin popups
- Build Docker images for multiple architectures (linux/amd64, linux/arm/v7, linux/arm64) using GitHub Actions ([#38](https://github.com/owntracks/frontend/pull/38), [@wollew](https://github.com/wollew))
- Replace Travis CI with GitHub Actions build/lint/test workflows ([#39](https://github.com/owntracks/frontend/pull/39))
- Replace node-sass with sass (dart-sass)
- Upgrade dependencies

## 2.4.0 (2020-06-01)

- Add `filters.minAccuracy` config option - this allows ignoring location points which do
  not meet the configured accuracy requirement ([#35](https://github.com/owntracks/frontend/issues/35))
- Upgrade dependencies

## 2.3.1 (2020-05-09)

- Fix linting issue in `config.md`

## 2.3.0 (2020-05-09)

- Add `api.fetchOptions` config option - this allows sending custom HTTP headers or including
  cookies in the request
- Upgrade dependencies

## 2.2.0 (2020-03-18)

- Improve mobile layout further:
  - Reduce header paddings
  - Align buttons/dropdowns
- Upgrade dependencies

## 2.1.0 (2020-03-18)

- Replace default Leaflet marker with a custom one ([#2](https://github.com/owntracks/frontend/issues/2))
- Improve verbose mode logging
- Improve mobile usability ([#19](https://github.com/owntracks/frontend/issues/19))
- Upgrade dependencies

## 2.0.0 (2020-03-01)

Stable release of v2, finally! 🎉

_This is just a version bump, see all the beta releases below, especially the first one, for a list of changes._

## 2.0.0-beta.11 (2020-03-01)

- Add Spanish translations ([#25](https://github.com/owntracks/frontend/pull/25), [@dtorner](https://github.com/dtorner))
- Change "distance travelled" label to `title`
- Replace map initial center/zoom config with auto fitting ([#23](https://github.com/owntracks/frontend/issues/23))
- Enhance code type definitions using TypeScript features ([#20](https://github.com/owntracks/frontend/pull/20))
- Upgrade dependencies

## 2.0.0-beta.10 (2020-02-07)

- Add "distance travelled" feature

## 2.0.0-beta.9 (2020-02-06)

- Support locale with language and region part (`en-GB`)
- Update docs (screenshot, changelog improvements, typo fix)
- Add funding information

## 2.0.0-beta.8 (2020-01-26)

- Add friendly device name and face images to location history popups
- Add missing `alt`/`title` to device face image
- Fix all JSDoc `@return` directives to `@returns`
- Use computed prop for device name in location popup
- Enable ESLint `max-len` rule

## 2.0.0-beta.7 (2020-01-24)

This release doesn't really affect end-users but greatly improves the development experience.

- Add `jsconfig.json`
- Set `no-console`/`no-debugger` to `"warn"` in dev mode
- Linting and formatting:
  - Separate npm scripts for linting and formatting
  - Lint/format Markdown files
  - Run lint on Travis CI
- Upgrade dependencies

## 2.0.0-beta.6 (2019-12-14)

- Fix heatmap - the upgrade of `vue2-leaflet` from 2.2.1 to 2.3.0 added an `activated` attribute to layers causing the heatmap to not show ([#18](https://github.com/owntracks/frontend/issues/18))

## 2.0.0-beta.5 (2019-12-14)

- Add Leaflet popup close button background color transition
- Add `$config` Vue instance property
- Improve accessibility ([#9](https://github.com/owntracks/frontend/issues/9))
- Use configured locale for timestamp formatting
- Upgrade dependencies

## 2.0.0-beta.4 (2019-12-14)

- Add support for time selection ([#10](https://github.com/owntracks/frontend/issues/10))
  - New date/time picker component is properly translated/localised and keyboard accessible
  - Config options are now `startDateTime`/`endDateTime` and format of URL parameters changed
- Changed default start/end date and time to use local timezone
- Fix missing translation of "[date] to [date]"
- Update i18n development notes in `README.md`

## 2.0.0-beta.3 (2019-12-13)

- Add i18 support (currently English and German, `locale` config option)
- Add custom checkbox focus style
- Fix layer dropdown issues ([#1](https://github.com/owntracks/frontend/issues/1))
- Fix checkbox style issues
- Fix hover/focus inconsistencies
- Fix Docker image labels
- `README.md` enhancements
- Upgrade dependencies

## 2.0.0-beta.2 (2019-11-02)

- Add `onLocationChange.reloadHistory` config option
- Add Travis CI config
- Fix timezone issues in tests
- Fix ESLint errors in production mode
- Fix table of content links in config documentation
- Upgrade dependencies

## 2.0.0-beta.1 (2019-10-26)

- Convert codebase to Node.js based development workflow, including:
  - Package management using yarn
  - Build step using Webpack and Babel
  - Usage of Vue single file components
  - SCSS and PostCSS
  - ESLint configuration for linting and consistent code style
  - `package.json` scripts: `serve`, `build`, `lint`, `cors-proxy` and `test`
- Design updates, including:
  - New default primary color (same as OwnTracks Android app)
  - Improved hover and focus styles as a first attempt to improve accessibility
  - Improved modals and location popups
  - Custom checkbox styles
  - Switch from Font Awesome 4 to Feather Icons
- Application now uses Vuex and Vue Router
- Add URL query parameters to load and preserve application state: `lat`, `lng`, `zoom`, `start`, `end`, `user`, `device` and `layers`
- Add a loading indicator
- Add 'download data' modal, currently supporting formatted and minified JSON
- Add a verbose mode
- Add CORS proxy script to easily use a production instance of the OwnTracks recorder in development
- Add unit tests for util and API functions
- Add documentation for all public funtions
- Add documentation for all configuration options
- Add more configuration options, including setting the API base URL ([#4](https://github.com/owntracks/frontend/issues/4)) and hiding the `ping/ping` location ([#12](https://github.com/owntracks/frontend/issues/12))

## 1.1.0 (2019-10-26)

- Add support for Docker ([#7](https://github.com/owntracks/frontend/pull/7), [@sharkoz](https://github.com/sharkoz))
- Move project to the OwnTracks organisation on GitHub ([#8](https://github.com/owntracks/frontend/pull/8), [@jpmens](https://github.com/jpmens))
- Enable compression in nginx configuration used in Docker image ([#11](https://github.com/owntracks/frontend/pull/11), [@sharkoz](https://github.com/sharkoz))

## 1.0.0 (2019-06-18)

- Initial release
