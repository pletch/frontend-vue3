import { defineStore } from "pinia";
import { ref, shallowRef, triggerRef, computed, reactive } from "vue";
import { useLocalStorage } from "@vueuse/core";
import config from "@/config";
import * as api from "@/api";
import { log } from "@/logging";
import {
  distanceBetweenCoordinates,
  isIsoDateTime,
  getLocationHistoryCount,
} from "@/util";
import * as bench from "@/bench";

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
  const lastLocations = shallowRef([]);
  // Held in a shallowRef so that reading the history does not pay the cost of
  // wrapping every location object in a reactive Proxy. Nested changes are
  // signalled with `triggerRef` rather than by deep reactivity.
  const locationHistory = shallowRef({});
  // Bumped only when the history is replaced wholesale, so consumers can
  // distinguish "a new data set" from "one more point arrived".
  const historyReloadVersion = ref(0);
  const selectedUser = ref(config.selectedUser);
  const selectedDevice = ref(
    config.selectedUser !== null ? config.selectedDevice : null
  );
  const units = useLocalStorage("owntracks-units", config.units);
  const layers = useLocalStorage("owntracks-layers", {
    ...config.map.layers,
    hideStale: false,
  });
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
  const playbackPoint = ref(null);

  // Automatically tick the endDateTime forward if real-time updates are enabled
  setInterval(() => {
    if (realTimeUpdatesEnabled.value) {
      endDateTime.value = new Date().toISOString().slice(0, 19);
    }
  }, 10000); // tick every 10s

  // Getters
  const filteredLastLocations = computed(() => {
    // If the stale filter is disabled, or a specific user is selected,
    // show everything.
    if (!layers.value.hideStale || selectedUser.value)
      return lastLocations.value;
    const now = Date.now();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    return lastLocations.value.filter((location) => {
      if (!location.tst) return true;
      return now - location.tst * 1000 <= twoDaysInMs;
    });
  });

  const filteredLocationHistory = computed(() => {
    bench.mark("store:filteredLocationHistory");
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
    bench.measure(
      "store:filteredLocationHistory",
      getLocationHistoryCount(history)
    );
    return history;
  });

  const filteredLocationHistoryLatLngs = computed(() => {
    bench.mark("store:filteredLocationHistoryLatLngs");
    const latLngs = [];
    const history = filteredLocationHistory.value;
    Object.keys(history).forEach((user) => {
      Object.keys(history[user]).forEach((device) => {
        history[user][device].forEach((location) => {
          latLngs.push({ lat: location.lat, lng: location.lon });
        });
      });
    });
    bench.measure("store:filteredLocationHistoryLatLngs", latLngs.length);
    return latLngs;
  });

  const filteredLocationHistoryLatLngGroups = computed(() => {
    bench.mark("store:filteredLocationHistoryLatLngGroups");
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
    bench.measure(
      "store:filteredLocationHistoryLatLngGroups",
      groups.reduce((total, group) => total + group.latLngs.length, 0)
    );
    return groups;
  });

  const selectedDeviceHistory = computed(() => {
    if (!selectedUser.value || !selectedDevice.value) {
      return [];
    }
    const userHistory = locationHistory.value[selectedUser.value];
    return (userHistory && userHistory[selectedDevice.value]) || [];
  });

  // Actions
  /**
   * Signal that the location history changed.
   *
   * `locationHistory` is a shallowRef, so nested mutations do not notify on
   * their own. Call this after any change to it.
   *
   * @param {Boolean} [replaced] True if the whole history was replaced
   */
  function notifyHistoryChanged(replaced = false) {
    triggerRef(locationHistory);
    if (replaced) {
      historyReloadVersion.value += 1;
    }
  }

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

  /**
   * Find the index at which a timestamp should be inserted to keep an array of
   * locations sorted oldest first.
   *
   * @param {OTLocation[]} locations Sorted array of locations
   * @param {Number} tst Timestamp to place
   * @returns {Number} Insertion index
   */
  function findInsertIndex(locations, tst) {
    let low = 0;
    let high = locations.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (locations[mid].tst < tst) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /**
   * Insert a single location into the history, keeping it sorted by timestamp.
   *
   * The common case is a new point that is newer than everything already held,
   * so appending is checked first. Anything else is placed with a binary
   * search, which avoids re-sorting the entire range for every message.
   *
   * The device's array is replaced rather than mutated so that consumers
   * comparing by identity see the change.
   *
   * @param {OTLocation} location Location to insert
   */
  function appendLocationToHistory(location) {
    const { username, device } = location;
    const history = locationHistory.value;
    if (!history[username]) {
      history[username] = {};
    }
    const current = history[username][device] || [];
    const last = current[current.length - 1];

    let next;
    if (!last || last.tst < location.tst) {
      next = current.concat(location);
    } else {
      const index = findInsertIndex(current, location.tst);
      if (current[index] && current[index].tst === location.tst) {
        // Replace an update for a timestamp we already hold.
        next = current.slice();
        next[index] = location;
      } else {
        next = current.slice(0, index).concat(location, current.slice(index));
      }
    }

    history[username][device] = next;
    notifyHistoryChanged();
  }

  async function connectWebsocket() {
    api.connectWebsocket(async (location) => {
      if (!realTimeUpdatesEnabled.value) return;

      if (location && location._type === "location") {
        const index = lastLocations.value.findIndex(
          (l) =>
            l.username === location.username && l.device === location.device
        );
        if (index !== -1) {
          // shallowRef: replace the array rather than mutating in place.
          const next = lastLocations.value.slice();
          next[index] = { ...next[index], ...location };
          lastLocations.value = next;
        } else {
          await getLastLocations();
        }

        // Append the new location to the history so lines update instantly,
        // without re-fetching or re-sorting the whole range.
        appendLocationToHistory(location);
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
        targetDevices = {
          [selectedUser.value]: devices.value[selectedUser.value],
        };
      }
    } else {
      targetDevices = devices.value;
    }

    if (requestAbortController.value) {
      requestAbortController.value.abort();
    }
    requestAbortController.value = new AbortController();

    try {
      const history = await bench.timeAsync(
        "api:getLocationHistory",
        () =>
          api.getLocationHistory(
            targetDevices,
            startDateTime.value,
            endDateTime.value,
            { signal: requestAbortController.value.signal }
          ),
        getLocationHistoryCount
      );
      bench.time("store:assignLocationHistory", () => {
        locationHistory.value = history;
        notifyHistoryChanged(true);
      });

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
          const latLng = {
            lat: location.lat,
            lng: location.lon,
            alt: location.alt ?? 0,
          };
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
    const count = getLocationHistoryCount(history);
    bench.record("store:updateTravelStats", end - start, count);
    log("PERFORMANCE", () => {
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
    historyReloadVersion,
    selectedDeviceHistory,
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
    playbackPoint,
    filteredLocationHistory,
    filteredLocationHistoryLatLngs,
    filteredLocationHistoryLatLngGroups,
    notifyHistoryChanged,
    appendLocationToHistory,
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
