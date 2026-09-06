<template>
  <div class="h-full w-full relative">
    <div
      v-if="!webglSupported"
      class="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-8 z-50"
    >
      <div
        class="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-2xl max-w-lg text-center border border-gray-200 dark:border-gray-700"
      >
        <div
          class="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <MonitorXIcon class="w-8 h-8" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {{ $t("WebGL required") }}
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
          {{ $t("This browser does not appear to support WebGL.") }}
        </p>
        <div
          class="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-lg text-sm text-left"
        >
          <strong class="block mb-1 font-semibold">
            {{ $t("How to fix this") }}
          </strong>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              {{ $t("Enable hardware acceleration in your browser settings.") }}
            </li>
            <li>{{ $t("Ensure your graphics drivers are up to date.") }}</li>
            <li>
              {{ $t("Try a current version of Chrome, Firefox or Safari.") }}
            </li>
          </ul>
        </div>
      </div>
    </div>
    <template v-else>
      <div class="absolute inset-0" ref="mapContainer"></div>
      <div
        v-if="webglIsSoftware && !softwareWarningDismissed"
        :class="softwareWarningClass"
        role="status"
      >
        <TriangleAlertIcon class="w-4 h-4 mt-0.5 shrink-0" />
        <span class="flex-1">
          {{ $t("Software rendering: performance will be limited.") }}
        </span>
        <button
          type="button"
          :class="softwareWarningDismissClass"
          :title="$t('Dismiss')"
          @click="softwareWarningDismissed = true"
        >
          <XIcon class="w-4 h-4" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import {
  ref,
  onMounted,
  onUnmounted,
  watch,
  computed,
  h,
  render,
  getCurrentInstance,
} from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLocationStore } from "@/store/location";
import config from "@/config";
import { useDark } from "@vueuse/core";
import {
  getUserColor,
  humanReadableSpeed,
  humanReadableAltitude,
} from "@/util";
import * as bench from "@/bench";
import LDeviceLocationPopup from "@/components/LDeviceLocationPopup.vue";
import {
  PersonStandingIcon,
  BikeIcon,
  CarIcon,
  MonitorXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-vue-next";

const mapContainer = ref(null);
let map = null;
const locationStore = useLocationStore();

const SOFTWARE_RENDERERS = ["swiftshader", "llvmpipe", "software"];

/**
 * Detect WebGL availability and whether it is hardware accelerated.
 *
 * A software renderer still draws the map correctly, just slowly, so it is
 * reported separately from "no WebGL at all" rather than being treated as an
 * outright failure.
 *
 * @returns {{supported: Boolean, software: Boolean}} Detection result
 */
const checkWebGLSupport = () => {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) return { supported: false, software: false };

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      const renderer = gl
        .getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        .toLowerCase();
      if (SOFTWARE_RENDERERS.some((name) => renderer.includes(name))) {
        return { supported: true, software: true };
      }
    }
    return { supported: true, software: false };
  } catch {
    return { supported: false, software: false };
  }
};

const webgl = checkWebGLSupport();
// Software rendering is slow but usable. Block on it only when the config asks
// us to; benchmarking always needs the real map, so it opts in implicitly.
const blockSoftwareWebGL = config.map.blockSoftwareWebGL && !bench.isEnabled();
const webglSupported =
  webgl.supported && !(webgl.software && blockSoftwareWebGL);
const webglIsSoftware = webgl.supported && webgl.software;
const softwareWarningDismissed = ref(false);

const softwareWarningClass = [
  "absolute top-2 left-1/2 -translate-x-1/2 z-10",
  "max-w-md w-[calc(100%-1rem)] flex items-start gap-2",
  "rounded-lg border px-3 py-2 text-sm shadow-md",
  "border-amber-300 bg-amber-50 text-amber-900",
  "dark:border-amber-700 dark:bg-amber-900/90 dark:text-amber-100",
].join(" ");

const softwareWarningDismissClass = [
  "shrink-0 rounded p-0.5",
  "hover:bg-amber-200/70 dark:hover:bg-amber-800/70",
  "focus-visible:outline focus-visible:outline-2",
  "focus-visible:outline-offset-1",
].join(" ");
const isDark = useDark();
const instance = getCurrentInstance();

const currentStyle = computed(() =>
  isDark.value
    ? "https://tiles.openfreemap.org/styles/dark"
    : "https://tiles.openfreemap.org/styles/liberty"
);

// Map of active markers: key -> { marker, popupApp, elementApp }
const activeMarkers = new Map();

const getActivityIconDetails = (location) => {
  const acts = location.motionactivities;
  if (!Array.isArray(acts) || acts.length === 0) return null;
  const a = acts.join(" ").toLowerCase();

  if (
    a.includes("automative") ||
    a.includes("automotive") ||
    a.includes("driving")
  ) {
    return { icon: CarIcon, colorClass: "bg-blue-500" };
  } else if (a.includes("cycling") || a.includes("bike")) {
    return { icon: BikeIcon, colorClass: "bg-orange-500" };
  } else if (
    a.includes("walking") ||
    a.includes("running") ||
    a.includes("foot")
  ) {
    return { icon: PersonStandingIcon, colorClass: "bg-green-500" };
  }
  return null;
};

const getPopupProps = (user, device, location) => ({
  user,
  device,
  name: location.name,
  face: location.face,
  timestamp: location.tst,
  createdAt: location.created_at,
  isorcv: location.isorcv,
  isoLocal: location.isolocal,
  timeZone: location.tzname,
  lat: location.lat,
  lon: location.lon,
  alt: location.alt,
  battery: location.batt,
  batteryStatus: location.bs,
  speed: location.vel,
  regions: location.inregions,
  wifi: { ssid: location.SSID, bssid: location.BSSID },
  address: location.addr,
  activity: Array.isArray(location.motionactivities)
    ? location.motionactivities.join(", ")
    : null,
});

const MarkerComponent = {
  props: ["color", "initials", "activity"],
  setup(props) {
    return () =>
      h(
        "div",
        {
          class:
            "relative flex items-center justify-center w-11 h-11 rounded-full text-white font-bold shadow-md border-2 border-white",
          style: { backgroundColor: props.color },
        },
        [
          props.initials,
          props.activity
            ? h(
                "div",
                {
                  class: `absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white ${props.activity.colorClass}`,
                },
                [h(props.activity.icon, { class: "w-3 h-3" })]
              )
            : null,
        ]
      );
  },
};

const renderMarkers = () => {
  if (!map) return;
  bench.mark("map:renderMarkers");

  const currentKeys = new Set();

  locationStore.filteredLastLocations.forEach((location) => {
    const key = `marker-${location.username}-${location.device}`;
    currentKeys.add(key);

    const color = getUserColor(location.username);
    const initials =
      location.tid || location.username.substring(0, 2).toUpperCase();
    const activity = getActivityIconDetails(location);
    const popupProps = getPopupProps(
      location.username,
      location.device,
      location
    );

    if (activeMarkers.has(key)) {
      // Update existing marker position and contents
      const data = activeMarkers.get(key);
      data.marker.setLngLat([location.lon, location.lat]);

      // Update marker DOM
      const markerVnode = h(MarkerComponent, { color, initials, activity });
      render(markerVnode, data.marker.getElement());

      // Update popup DOM
      const popupVnode = h(LDeviceLocationPopup, popupProps);
      popupVnode.appContext = instance.appContext;
      render(popupVnode, data.popupContainer);
    } else {
      // Create new DOM elements for pin and popup
      const el = document.createElement("div");
      const markerVnode = h(MarkerComponent, { color, initials, activity });
      render(markerVnode, el);

      const popupContainer = document.createElement("div");
      const popupVnode = h(LDeviceLocationPopup, popupProps);
      popupVnode.appContext = instance.appContext;
      render(popupVnode, popupContainer);

      const popup = new maplibregl.Popup({
        offset: 25,
        className: "maplibre-popup-custom",
      }).setDOMContent(popupContainer);

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([location.lon, location.lat])
        .setPopup(popup)
        .addTo(map);

      activeMarkers.set(key, { marker, popupContainer });
    }
  });

  // Remove stale markers
  for (const [key, data] of activeMarkers.entries()) {
    if (!currentKeys.has(key)) {
      data.marker.remove();
      render(null, data.popupContainer); // unmount vue component
      activeMarkers.delete(key);
    }
  }

  bench.measure("map:renderMarkers", activeMarkers.size);
};

let playbackMarker = null;

const renderPlaybackMarker = () => {
  if (!map) return;
  const point = locationStore.playbackPoint;

  if (!point) {
    if (playbackMarker) {
      playbackMarker.remove();
      playbackMarker = null;
    }
    return;
  }

  const activity = getActivityIconDetails(point);

  const vnode = h(
    "div",
    {
      class:
        "w-6 h-6 rounded-full bg-amber-500 border-[3px] border-black shadow-md relative flex items-center justify-center text-black",
    },
    [activity ? h(activity.icon, { class: "w-4 h-4 text-black" }) : null]
  );

  if (!playbackMarker) {
    const el = document.createElement("div");
    render(vnode, el);

    const speed = humanReadableSpeed(point.vel || 0, locationStore.units);
    const alt =
      point.alt !== undefined
        ? humanReadableAltitude(point.alt, locationStore.units)
        : "0 m";
    const time = new Date(point.tst * 1000).toLocaleString();
    const popupHtml = `<div class="text-gray-900 text-center">
      <div class="font-bold border-b border-gray-200 pb-1 mb-1 text-sm">${time}</div>
      <div class="text-xs text-gray-600 font-medium">${speed} &bull; ${alt}</div>
    </div>`;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: "playback-popup",
    }).setHTML(popupHtml);

    playbackMarker = new maplibregl.Marker({ element: el })
      .setLngLat([point.lon, point.lat])
      .setPopup(popup)
      .addTo(map);

    playbackMarker.togglePopup();
  } else {
    render(vnode, playbackMarker.getElement());
    playbackMarker.setLngLat([point.lon, point.lat]);

    const speed = humanReadableSpeed(point.vel || 0, locationStore.units);
    const alt =
      point.alt !== undefined
        ? humanReadableAltitude(point.alt, locationStore.units)
        : "0 m";
    const time = new Date(point.tst * 1000).toLocaleString();
    const popupHtml = `<div class="text-gray-900 text-center">
      <div class="font-bold border-b border-gray-200 pb-1 mb-1 text-sm">${time}</div>
      <div class="text-xs text-gray-600 font-medium">${speed} &bull; ${alt}</div>
    </div>`;

    playbackMarker.getPopup().setHTML(popupHtml);
  }
};

const getLinesGeoJSON = () => {
  bench.mark("geojson:lines");
  const features = locationStore.filteredLocationHistoryLatLngGroups
    .filter((group) => group.latLngs.length > 1)
    .map((group) => ({
      type: "Feature",
      properties: {
        color: getUserColor(group.user),
      },
      geometry: {
        type: "LineString",
        coordinates: group.latLngs.map((ll) => [
          ll.lng !== undefined ? ll.lng : ll[1],
          ll.lat !== undefined ? ll.lat : ll[0],
        ]), // [lng, lat]
      },
    }));

  bench.measure("geojson:lines", features.length);
  return { type: "FeatureCollection", features };
};

const getHeatmapGeoJSON = () => {
  bench.mark("geojson:heatmap");
  const features = locationStore.filteredLocationHistoryLatLngs.map((ll) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [
        ll.lng !== undefined ? ll.lng : ll[1],
        ll.lat !== undefined ? ll.lat : ll[0],
      ],
    },
  }));

  bench.measure("geojson:heatmap", features.length);
  return { type: "FeatureCollection", features };
};

const createGeoJSONCircle = (center, radiusInMeters, points = 64) => {
  const coords = { latitude: center[1], longitude: center[0] };
  const km = radiusInMeters / 1000;
  const ret = [];
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]); // close the polygon
  return { type: "Polygon", coordinates: [ret] };
};

const getAccuracyCirclesGeoJSON = () => {
  bench.mark("geojson:accuracyCircles");
  const features = locationStore.filteredLastLocations
    .filter((l) => l.acc)
    .map((l) => ({
      type: "Feature",
      properties: { color: getUserColor(l.username) },
      geometry: createGeoJSONCircle([l.lon, l.lat], l.acc),
    }));
  bench.measure("geojson:accuracyCircles", features.length);
  return { type: "FeatureCollection", features };
};

const getPointsGeoJSON = () => {
  bench.mark("geojson:points");
  const features = [];
  Object.keys(locationStore.filteredLocationHistory).forEach((user) => {
    Object.keys(locationStore.filteredLocationHistory[user]).forEach(
      (device) => {
        locationStore.filteredLocationHistory[user][device].forEach(
          (location) => {
            if (locationStore.layers.poi && location.poi) {
              features.push({
                type: "Feature",
                properties: {
                  type: "poi",
                  poi: location.poi,
                  color: getUserColor(user),
                },
                geometry: {
                  type: "Point",
                  coordinates: [location.lon, location.lat],
                },
              });
            }
            if (locationStore.layers.points) {
              features.push({
                type: "Feature",
                properties: { type: "point", color: getUserColor(user) },
                geometry: {
                  type: "Point",
                  coordinates: [location.lon, location.lat],
                },
              });
            }
          }
        );
      }
    );
  });
  bench.measure("geojson:points", features.length);
  return { type: "FeatureCollection", features };
};

const initSourcesAndLayers = () => {
  if (!map) return;

  // Lines Source & Layer
  if (!map.getSource("history-lines")) {
    map.addSource("history-lines", {
      type: "geojson",
      data: getLinesGeoJSON(),
    });

    map.addLayer({
      id: "history-lines-layer",
      type: "line",
      source: "history-lines",
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: locationStore.layers.line ? "visible" : "none",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": config.map.polyline?.weight || 3,
        "line-opacity": config.map.polyline?.opacity || 0.8,
      },
    });
  }

  // Heatmap Source & Layer
  if (!map.getSource("history-heatmap")) {
    map.addSource("history-heatmap", {
      type: "geojson",
      data: getHeatmapGeoJSON(),
    });

    map.addLayer({
      id: "history-heatmap-layer",
      type: "heatmap",
      source: "history-heatmap",
      layout: {
        visibility: locationStore.layers.heatmap ? "visible" : "none",
      },
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": 1,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(33,102,172,0)",
          0.2,
          "rgb(103,169,207)",
          0.4,
          "rgb(209,229,240)",
          0.6,
          "rgb(253,219,199)",
          0.8,
          "rgb(239,138,98)",
          1,
          config.primaryColor || "rgb(178,24,43)",
        ],
        "heatmap-radius": config.map.heatmap?.radius || 15,
        "heatmap-opacity": 0.8,
      },
    });
  }

  // Accuracy Circles Source & Layer
  if (!map.getSource("accuracy-circles")) {
    map.addSource("accuracy-circles", {
      type: "geojson",
      data: getAccuracyCirclesGeoJSON(),
    });
    map.addLayer({
      id: "accuracy-circles-layer",
      type: "fill",
      source: "accuracy-circles",
      layout: { visibility: locationStore.layers.last ? "visible" : "none" },
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": config.map.circle?.fillOpacity || 0.2,
      },
    });
    map.addLayer({
      id: "accuracy-circles-outline",
      type: "line",
      source: "accuracy-circles",
      layout: { visibility: locationStore.layers.last ? "visible" : "none" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1,
        "line-opacity": 0.5,
      },
    });
  }

  // Points Source & Layers
  if (!map.getSource("history-points")) {
    map.addSource("history-points", {
      type: "geojson",
      data: getPointsGeoJSON(),
    });

    // Regular History Points
    map.addLayer({
      id: "history-points-layer",
      type: "circle",
      source: "history-points",
      filter: ["==", "type", "point"],
      layout: { visibility: locationStore.layers.points ? "visible" : "none" },
      paint: {
        "circle-radius": config.map.circleMarker?.radius || 4,
        "circle-color": ["get", "color"],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });

    // POI Markers
    map.addLayer({
      id: "history-poi-layer",
      type: "circle",
      source: "history-points",
      filter: ["==", "type", "poi"],
      layout: { visibility: locationStore.layers.poi ? "visible" : "none" },
      paint: {
        "circle-radius": config.map.poiMarker?.radius || 12,
        "circle-color": ["get", "color"],
        "circle-opacity": config.map.poiMarker?.fillOpacity || 0.4,
        "circle-stroke-width": 2,
        "circle-stroke-color": ["get", "color"],
      },
    });

    // POI Labels
    map.addLayer({
      id: "history-poi-label-layer",
      type: "symbol",
      source: "history-points",
      filter: ["==", "type", "poi"],
      layout: {
        visibility: locationStore.layers.poi ? "visible" : "none",
        "text-field": ["get", "poi"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-offset": [0, -1.5],
        "text-anchor": "bottom",
      },
      paint: {
        "text-color": "#000000",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }
};

const updateGeoJSON = () => {
  // `map.isStyleLoaded()` is false whenever MapLibre has pending source or tile
  // work, not just before the initial style load, so guarding on it silently
  // drops updates on large data sets. What actually matters is whether our own
  // sources exist yet; those are created by `initSourcesAndLayers` on style
  // load.
  if (!map || !map.getSource("history-lines")) return;
  bench.mark("map:updateGeoJSON");

  const linesSource = map.getSource("history-lines");
  if (linesSource) {
    const data = getLinesGeoJSON();
    bench.time("map:setData:lines", () => linesSource.setData(data));
  }

  const heatmapSource = map.getSource("history-heatmap");
  if (heatmapSource) {
    const data = getHeatmapGeoJSON();
    bench.time("map:setData:heatmap", () => heatmapSource.setData(data));
  }

  if (map.getLayer("history-lines-layer")) {
    map.setLayoutProperty(
      "history-lines-layer",
      "visibility",
      locationStore.layers.line ? "visible" : "none"
    );
  }
  if (map.getLayer("history-heatmap-layer")) {
    map.setLayoutProperty(
      "history-heatmap-layer",
      "visibility",
      locationStore.layers.heatmap ? "visible" : "none"
    );
  }
  if (map.getLayer("accuracy-circles-layer")) {
    map.setLayoutProperty(
      "accuracy-circles-layer",
      "visibility",
      locationStore.layers.last ? "visible" : "none"
    );
    map.setLayoutProperty(
      "accuracy-circles-outline",
      "visibility",
      locationStore.layers.last ? "visible" : "none"
    );
  }
  if (map.getLayer("history-points-layer")) {
    map.setLayoutProperty(
      "history-points-layer",
      "visibility",
      locationStore.layers.points ? "visible" : "none"
    );
  }
  if (map.getLayer("history-poi-layer")) {
    map.setLayoutProperty(
      "history-poi-layer",
      "visibility",
      locationStore.layers.poi ? "visible" : "none"
    );
    map.setLayoutProperty(
      "history-poi-label-layer",
      "visibility",
      locationStore.layers.poi ? "visible" : "none"
    );
  }

  const accuracySource = map.getSource("accuracy-circles");
  if (accuracySource) {
    const data = getAccuracyCirclesGeoJSON();
    bench.time("map:setData:accuracyCircles", () =>
      accuracySource.setData(data)
    );
  }

  const pointsSource = map.getSource("history-points");
  if (pointsSource) {
    const data = getPointsGeoJSON();
    bench.time("map:setData:points", () => pointsSource.setData(data));
  }

  bench.measure("map:updateGeoJSON");
};

let isFirstFitView = true;

const fitView = () => {
  if (!map) return;
  bench.mark("map:fitView");
  const { layers } = locationStore;
  const historyLatLngs = locationStore.filteredLocationHistoryLatLngs;

  if (
    (layers.line || layers.points || layers.poi || layers.heatmap) &&
    historyLatLngs.length > 0
  ) {
    const bounds = new maplibregl.LngLatBounds();
    historyLatLngs.forEach((ll) =>
      bounds.extend([
        ll.lng !== undefined ? ll.lng : ll[1],
        ll.lat !== undefined ? ll.lat : ll[0],
      ])
    );
    map.fitBounds(bounds, { padding: 50, animate: !isFirstFitView });
    isFirstFitView = false;
  } else if (layers.last && locationStore.lastLocations.length > 0) {
    const bounds = new maplibregl.LngLatBounds();
    locationStore.lastLocations.forEach((l) => bounds.extend([l.lon, l.lat]));
    map.fitBounds(bounds, {
      padding: 50,
      maxZoom: config.map.maxNativeZoom || 16,
      animate: !isFirstFitView,
    });
    isFirstFitView = false;
  }
  bench.measure("map:fitView");
};

onMounted(() => {
  if (!webglSupported) return;

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: currentStyle.value,
    center: [
      parseFloat(locationStore.map.center.lng) || 0,
      parseFloat(locationStore.map.center.lat) || 0,
    ], // [lng, lat]
    zoom: locationStore.map.zoom,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-left");

  if (bench.isEnabled()) {
    // The benchmark runner needs to wait for the style before measuring.
    window.__otMap = map;
  }

  map.on("style.load", () => {
    initSourcesAndLayers();
    updateGeoJSON();
    fitView();
  });

  map.on("load", () => {
    renderMarkers();
    initSourcesAndLayers();
    updateGeoJSON();
    fitView();
  });
});

watch(currentStyle, (newStyle) => {
  if (map) {
    map.setStyle(newStyle);
  }
});

// `lastLocations` is a shallowRef holding one entry per device, so a plain
// watcher on the derived getter is enough - no deep traversal required.
watch(() => locationStore.filteredLastLocations, renderMarkers);

// The history getters return freshly built structures whenever the underlying
// shallowRef is triggered, so identity comparison is sufficient here. Deep
// watching them would walk the entire data set on every single update.
watch(
  [
    () => locationStore.filteredLocationHistoryLatLngGroups,
    () => locationStore.filteredLocationHistoryLatLngs,
  ],
  updateGeoJSON
);

// Layer visibility is a small object of booleans, so deep watching is cheap.
watch(() => locationStore.layers, updateGeoJSON, { deep: true });

watch(() => locationStore.fitViewToggle, fitView);

// Only re-fit when the history is replaced wholesale. Re-fitting on every live
// append would drag the map out from under the user, and is what
// `onLocationChange.fitView` exists to opt into.
watch(() => locationStore.historyReloadVersion, fitView);
watch(
  () => locationStore.lastLocations,
  () => {
    if (config.onLocationChange?.fitView) fitView();
  }
);

watch(() => locationStore.playbackPoint, renderPlaybackMarker);

onUnmounted(() => {
  if (map) map.remove();
  activeMarkers.forEach((data) => render(null, data.popupContainer));
});
</script>

<style>
.maplibre-popup-custom .maplibregl-popup-content {
  padding: 0;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.playback-popup .maplibregl-popup-content {
  padding: 6px 10px;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  text-align: center;
  color: #111827; /* Force dark text in light mode */
}

/* Dark Mode Playback Popup */
html.dark .playback-popup .maplibregl-popup-content {
  background-color: #1f2937;
  color: #f9fafb;
}
html.dark .playback-popup.maplibregl-popup-anchor-top .maplibregl-popup-tip,
html.dark
  .playback-popup.maplibregl-popup-anchor-top-left
  .maplibregl-popup-tip,
html.dark
  .playback-popup.maplibregl-popup-anchor-top-right
  .maplibregl-popup-tip {
  border-bottom-color: #1f2937;
}
html.dark .playback-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip,
html.dark
  .playback-popup.maplibregl-popup-anchor-bottom-left
  .maplibregl-popup-tip,
html.dark
  .playback-popup.maplibregl-popup-anchor-bottom-right
  .maplibregl-popup-tip {
  border-top-color: #1f2937;
}
html.dark .playback-popup.maplibregl-popup-anchor-left .maplibregl-popup-tip {
  border-right-color: #1f2937;
}
html.dark .playback-popup.maplibregl-popup-anchor-right .maplibregl-popup-tip {
  border-left-color: #1f2937;
}
</style>
