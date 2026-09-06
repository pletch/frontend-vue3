import deepmerge from "deepmerge";

const endDateTime = new Date();
endDateTime.setHours(23, 59, 59, 0);

const startDateTime = new Date(endDateTime);
startDateTime.setMonth(startDateTime.getMonth() - 1);
startDateTime.setHours(0, 0, 0, 0);

const DEFAULT_CONFIG: Config = {
  api: {
    baseUrl: `${window.location.protocol}//${window.location.host}`,
    fetchOptions: {},
    // Request long date ranges in slices so results appear progressively
    // rather than all at once when the whole body has arrived.
    historySlice: {
      enabled: true,
      days: 7,
      maxSlices: 32,
    },
  },
  endDateTime,
  filters: {
    minAccuracy: null,
  },
  ignorePingLocation: true,
  locale: "en-US",
  map: {
    circle: {
      color: null,
      fillColor: null,
      fillOpacity: 0.2,
    },
    circleMarker: {
      color: null,
      fillColor: "#fff",
      fillOpacity: 1,
      radius: 4,
    },
    heatmap: {
      blur: 15,
      gradient: null,
      max: 20,
      radius: 25,
    },
    blockSoftwareWebGL: false,
    directionArrows: true,
    layers: {
      heatmap: false,
      last: true,
      line: true,
      poi: true,
      points: false,
    },
    maxNativeZoom: 19,
    sampling: {
      enabled: true,
      maxZoom: 15,
      minPoints: 5000,
      tolerancePixels: 1.5,
    },
    maxPointDistance: null,
    poiMarker: {
      color: null,
      fillColor: null,
      fillOpacity: 0.2,
      radius: 12,
    },
    polyline: {
      color: null,
      fillColor: "transparent",
      opacity: 0.8,
      weight: 3,
    },
  },
  onLocationChange: {
    fitView: false,
    reloadHistory: false,
  },
  primaryColor: "#3f51b5",
  router: {
    basePath: "/",
  },
  selectedDevice: null,
  selectedUser: null,
  showDistanceTravelled: true,
  startDateTime,
  units: null,
  verbose: false,
  bench: false,
};

// Use deepmerge to combine the default and user-defined configuration.
// This enables the user to use a fairly small config object which only
// needs to contain actual changes, not all default values - and these
// stay up-to-date automatically.
// There might not be a user-defined config, default to an empty object.
// The user config is a partial override of the defaults, so the merged result
// is a complete `Config` even though the override is not.
export default deepmerge(
  DEFAULT_CONFIG,
  (window.owntracks || {}).config || {}
) as Config;
