import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { useLocalStorage } from "@vueuse/core";
import config from "@/config";
import * as api from "@/api";
import { log } from "@/logging";
import {
  distanceBetweenCoordinates,
  isIsoDateTime,
  getLocationHistoryCount,
} from "@/util";

function formatInitialDate(date) {
  return (date instanceof Date ? date.toISOString() : date).slice(0, 19);
}

export const useLocationStore = defineStore("location", () => {
  // State
  const isLoading = ref(false);
  const isInformationModalVisible = ref(false);
  const frontendVersion = ref(import.meta.env.PACKAGE_VERSION);
  const recorderVersion = ref("");
  const users = ref([]);
  const devices = ref({});
  const lastLocations = ref([]);
  const locationHistory = ref({});
  const selectedUser = ref(config.selectedUser);
  const selectedDevice = ref(config.selectedUser !== null ? config.selectedDevice : null);
  const units = useLocalStorage("owntracks-units", config.units);
  const layers = useLocalStorage("owntracks-layers", { ...config.map.layers, hideStale: false });
  const startDateTime = ref(formatInitialDate(config.startDateTime));
  const endDateTime = ref(formatInitialDate(config.endDateTime));
  const map = reactive({
    center: {
      lat: 0,
      lng: 0,
    },
    zoom: 19,
  });
  const distanceTravelled = ref(0);
  const elevationGain = ref(0);
  const elevationLoss = ref(0);
  const requestAbortController = ref(null);
  const fitViewToggle = ref(false);
  const realTimeUpdatesEnabled = ref(true);

  // Automatically tick the endDateTime forward if real-time updates are enabled
  setInterval(() => {
    if (realTimeUpdatesEnabled.value) {
      endDateTime.value = new Date().toISOString().slice(0, 19);
    }
  }, 10000); // tick every 10s

  // Getters
  const filteredLastLocations = computed(() => {
    // If stale filter is disabled, or if a specific user is selected, show everything.
    if (!layers.value.hideStale || selectedUser.value) return lastLocations.value;
    const now = Date.now();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    return lastLocations.value.filter((location) => {
      if (!location.tst) return true;
      return (now - (location.tst * 1000)) <= twoDaysInMs;
    });
  });

  const filteredLocationHistory = computed(() => {
    const history = {};
    Object.keys(locationHistory.value).forEach((user) => {
      history[user] = {};
      Object.keys(locationHistory.value[user]).forEach((device) => {
        history[user][device] = [];
        locationHistory.value[user][device].forEach((location) => {
          if (
            config.filters.minAccuracy !== null &&
            location.acc > config.filters.minAccuracy
          )
            return;
          history[user][device].push(location);
        });
      });
    });
    return history;
  });

  const filteredLocationHistoryLatLngs = computed(() => {
    const latLngs = [];
    const history = filteredLocationHistory.value;
    Object.keys(history).forEach((user) => {
      Object.keys(history[user]).forEach((device) => {
        history[user][device].forEach((location) => {
          latLngs.push({ lat: location.lat, lng: location.lon });
        });
      });
    });
    return latLngs;
  });

  const filteredLocationHistoryLatLngGroups = computed(() => {
    const groups = [];
    const history = filteredLocationHistory.value;
    Object.keys(history).forEach((user) => {
      Object.keys(history[user]).forEach((device) => {
        let latLngs = [];
        history[user][device].forEach((location) => {
          const latLng = { lat: location.lat, lng: location.lon };
          if (
            typeof config.map.maxPointDistance === "number" &&
            config.map.maxPointDistance > 0 &&
            latLngs.length > 0
          ) {
            const lastLatLng = latLngs.slice(-1)[0];
            if (
              distanceBetweenCoordinates(lastLatLng, latLng) >
              config.map.maxPointDistance
            ) {
              groups.push({ user, device, latLngs });
              latLngs = [];
            }
          }
          latLngs.push(latLng);
        });
        if (latLngs.length > 0) {
          groups.push({ user, device, latLngs });
        }
      });
    });
    return groups;
  });

  // Actions
  function populateStateFromQuery(query) {
    if (query.lat && !isNaN(parseFloat(query.lat))) {
      map.center.lat = query.lat;
      map.center.lng = parseFloat(map.center.lng);
    }
    if (query.lng && !isNaN(parseFloat(query.lng))) {
      map.center.lat = parseFloat(map.center.lat);
      map.center.lng = query.lng;
    }
    if (query.zoom && !isNaN(parseInt(query.zoom))) {
      map.zoom = parseInt(query.zoom);
    }
    if (query.start && isIsoDateTime(query.start)) {
      startDateTime.value = query.start;
    }
    if (query.end && isIsoDateTime(query.end)) {
      endDateTime.value = query.end;
    }
    if (query.user) {
      selectedUser.value = query.user;
    }
    if (query.device) {
      selectedDevice.value = query.device;
    }
    if (query.layers) {
      const activeLayers = query.layers.split(",");
      Object.keys(layers.value).forEach((layer) => {
        layers.value[layer] = activeLayers.includes(layer);
      });
    }
  }

  async function loadData() {
    await Promise.all([getUsers(), getRecorderVersion()]);
    await getDevices();
    await Promise.all([getLastLocations(), getLocationHistory()]);
    await connectWebsocket();
  }

  async function reloadData() {
    await Promise.all([getLastLocations(), getLocationHistory()]);
  }

  async function connectWebsocket() {
    api.connectWebsocket(async (location) => {
      if (!realTimeUpdatesEnabled.value) return;

      if (location && location._type === "location") {
        const index = lastLocations.value.findIndex(
          (l) => l.username === location.username && l.device === location.device
        );
        if (index !== -1) {
          lastLocations.value[index] = { ...lastLocations.value[index], ...location };
        } else {
          await getLastLocations();
        }

        // Dynamically append the new location to the history array so lines update instantly
        if (!locationHistory.value[location.username]) {
          locationHistory.value[location.username] = {};
        }
        if (!locationHistory.value[location.username][location.device]) {
          locationHistory.value[location.username][location.device] = [];
        }
        
        const devHistory = locationHistory.value[location.username][location.device];
        const existingIndex = devHistory.findIndex(l => l.tst === location.tst);
        if (existingIndex !== -1) {
          devHistory[existingIndex] = location;
        } else {
          devHistory.push(location);
          devHistory.sort((a, b) => a.tst - b.tst);
        }

      } else {
        await getLastLocations();
      }

      if (config.onLocationChange.reloadHistory) {
        await getLocationHistory();
      }
    });
  }

  async function getUsers() {
    users.value = await api.getUsers();
  }

  async function getDevices() {
    devices.value = await api.getDevices(users.value);
  }

  async function getLastLocations() {
    let locations = await api.getLastLocations(
      selectedUser.value,
      selectedDevice.value
    );
    if (config.ignorePingLocation) {
      locations = locations.filter(
        (l) => !(l.username === "ping" && l.device === "ping")
      );
    }
    lastLocations.value = locations;
  }

  async function getLocationHistory() {
    isLoading.value = true;
    let targetDevices;
    if (selectedUser.value) {
      if (selectedDevice.value) {
        targetDevices = { [selectedUser.value]: [selectedDevice.value] };
      } else {
        targetDevices = { [selectedUser.value]: devices.value[selectedUser.value] };
      }
    } else {
      targetDevices = devices.value;
    }

    if (requestAbortController.value) {
      requestAbortController.value.abort();
    }
    requestAbortController.value = new AbortController();

    try {
      const history = await api.getLocationHistory(
        targetDevices,
        startDateTime.value,
        endDateTime.value,
        { signal: requestAbortController.value.signal }
      );
      locationHistory.value = history;

      if (config.showDistanceTravelled) {
        updateTravelStats(history);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        log("STORE", error, "ERROR");
      }
    } finally {
      requestAbortController.value = null;
      isLoading.value = false;
    }
  }

  function updateTravelStats(history) {
    const start = Date.now();
    let dist = 0;
    let gain = 0;
    let loss = 0;

    Object.keys(history).forEach((user) => {
      Object.keys(history[user]).forEach((device) => {
        let lastLatLng = null;
        history[user][device].forEach((location) => {
          if (
            config.filters.minAccuracy !== null &&
            location.acc > config.filters.minAccuracy
          )
            return;
          const latLng = L.latLng(location.lat, location.lon, location.alt ?? 0);
          if (lastLatLng !== null) {
            const distance = distanceBetweenCoordinates(lastLatLng, latLng);
            const elevationChange = latLng.alt - lastLatLng.alt;
            if (
              typeof config.map.maxPointDistance === "number" &&
              config.map.maxPointDistance > 0
                ? distance <= config.map.maxPointDistance
                : true
            ) {
              dist += distance;
              if (elevationChange >= 0) gain += elevationChange;
              else loss += -elevationChange;
            }
          }
          lastLatLng = latLng;
        });
      });
    });

    distanceTravelled.value = dist;
    elevationGain.value = gain;
    elevationLoss.value = loss;

    const end = Date.now();
    log("PERFORMANCE", () => {
      const count = getLocationHistoryCount(history);
      const duration = (end - start) / 1000;
      return `[updateTravelStats] Took ${duration}s for ${count} locations`;
    });
  }

  function triggerFitView() {
    fitViewToggle.value = !fitViewToggle.value;
  }

  async function getRecorderVersion() {
    recorderVersion.value = await api.getVersion();
  }

  async function setSelectedUser(user) {
    selectedDevice.value = null;
    selectedUser.value = user;
    await reloadData();
  }

  async function setSelectedDevice(device) {
    selectedDevice.value = device;
    await reloadData();
  }

  async function setStartDateTime(val) {
    startDateTime.value = val;
    await reloadData();
  }

  async function setEndDateTime(val) {
    endDateTime.value = val;
    await reloadData();
  }

  function setUnits(val) {
    units.value = val;
  }

  function setMapLayerVisibility({ layer, visibility }) {
    layers.value[layer] = visibility;
  }

  function setMapCenter(center) {
    map.center = center;
  }

  function setMapZoom(zoom) {
    map.zoom = zoom;
  }

  return {
    isLoading,
    isInformationModalVisible,
    frontendVersion,
    recorderVersion,
    users,
    devices,
    lastLocations,
    filteredLastLocations,
    locationHistory,
    selectedUser,
    selectedDevice,
    units,
    layers,
    startDateTime,
    endDateTime,
    map,
    distanceTravelled,
    elevationGain,
    elevationLoss,
    requestAbortController,
    fitViewToggle,
    realTimeUpdatesEnabled,
    filteredLocationHistory,
    filteredLocationHistoryLatLngs,
    filteredLocationHistoryLatLngGroups,
    populateStateFromQuery,
    loadData,
    reloadData,
    connectWebsocket,
    getUsers,
    getDevices,
    getLastLocations,
    getLocationHistory,
    updateTravelStats,
    triggerFitView,
    getRecorderVersion,
    setSelectedUser,
    setSelectedDevice,
    setStartDateTime,
    setEndDateTime,
    setUnits,
    setMapLayerVisibility,
    setMapCenter,
    setMapZoom,
  };
});