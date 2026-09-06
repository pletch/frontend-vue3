import { defineStore } from "pinia";
import { ref, shallowRef, triggerRef, computed, reactive } from "vue";
import { useLocalStorage } from "@vueuse/core";
import config from "@/config";
import * as api from "@/api";
import { log, LOG_ERROR } from "@/logging";
import {
  distanceBetweenCoordinates,
  isIsoDateTime,
  getLocationHistoryCount,
  buildUserColorMap,
  getUserColor,
} from "@/util";
import * as bench from "@/bench";

function formatInitialDate(date) {
  return (date instanceof Date ? date.toISOString() : date).slice(0, 19);
}

export const useLocationStore = defineStore("location", () => {
  // State
  const isLoading = ref(false);
  // Set when talking to the recorder fails, so the UI can say so rather than
  // showing an empty map.
  const loadError = ref(null);
  // Byte-level progress of the history request, aggregated across the
  // per-device requests that make it up.
  const loadProgress = ref({ received: 0, total: 0, reliable: false });
  const isInformationModalVisible = ref(false);
  // Shared so that interacting with the map can dismiss the mobile nav panel,
  // which would otherwise cover what the user just tapped.
  const isMobileNavOpen = ref(false);
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
  // An empty selection means "all users". Device selection only applies when
  // exactly one user is selected, since devices are scoped to a user.
  const selectedUsers = ref(
    config.selectedUser !== null ? [config.selectedUser] : []
  );
  const selectedDevice = ref(
    config.selectedUser !== null ? config.selectedDevice : null
  );

  // Retained so that everything keyed on a single selected user keeps working;
  // it is only meaningful when exactly one user is selected.
  const selectedUser = computed(() =>
    selectedUsers.value.length === 1 ? selectedUsers.value[0] : null
  );

  /**
   * Whether a user is currently shown.
   *
   * @param {User} user Username
   * @returns {Boolean} True if shown
   */
  function isUserSelected(user) {
    return (
      selectedUsers.value.length === 0 || selectedUsers.value.includes(user)
    );
  }
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
    const locations = lastLocations.value.filter((location) =>
      isUserSelected(location.username)
    );
    // If the stale filter is disabled, or users are explicitly selected,
    // show everything that is selected.
    if (!layers.value.hideStale || selectedUsers.value.length > 0) {
      return locations;
    }
    const now = Date.now();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    return locations.filter((location) => {
      if (!location.tst) return true;
      return now - location.tst * 1000 <= twoDaysInMs;
    });
  });

  // Configuration that shapes the derivation. Read once: the user config is
  // merged at module evaluation time and does not change at runtime.
  const { minAccuracy } = config.filters;
  const maxPointDistance =
    typeof config.map.maxPointDistance === "number" &&
    config.map.maxPointDistance > 0
      ? config.map.maxPointDistance
      : null;

  /**
   * Create an empty derivation state.
   *
   * `devices` holds the per-device cursor needed to extend the derivation one
   * point at a time; it is internal and never published.
   *
   * @returns {Object} Fresh derivation state
   */
  function createDerivedState() {
    return {
      segments: [],
      pointsByUser: new Map(),
      pois: [],
      bounds: {
        minLat: Infinity,
        minLng: Infinity,
        maxLat: -Infinity,
        maxLng: -Infinity,
      },
      count: 0,
      devices: new Map(),
    };
  }

  let derived = createDerivedState();

  /**
   * Everything the map needs: line segments, per-user coordinate arrays, POIs
   * and bounds, with coordinates as `[lng, lat]` to match GeoJSON order.
   *
   * This is maintained incrementally rather than recomputed, so that a single
   * incoming location costs a constant amount of work instead of a full pass
   * over the history. A fresh wrapper object is published on every change so
   * that watchers comparing by identity still fire.
   */
  const mapGeoData = shallowRef(null);

  /** Publish the current derivation state to `mapGeoData`. */
  function publishDerived() {
    mapGeoData.value = {
      segments: derived.segments,
      pointsByUser: derived.pointsByUser,
      pois: derived.pois,
      bounds: derived.count > 0 ? { ...derived.bounds } : null,
      count: derived.count,
    };
  }

  /**
   * Extend the derivation with one location, assumed to come after everything
   * already recorded for that device.
   *
   * @param {User} user Username
   * @param {Device} device Device name
   * @param {OTLocation} location Location to add
   */
  function extendDerived(user, device, location) {
    if (minAccuracy !== null && location.acc > minAccuracy) {
      return;
    }

    const { lat, lon } = location;
    const key = `${user}\u0000${device}`;
    let cursor = derived.devices.get(key);
    if (!cursor) {
      cursor = { coordinates: [], inSegments: false, lastLatLng: null };
      derived.devices.set(key, cursor);
    }

    // Break the line rather than drawing across a large jump.
    if (
      maxPointDistance !== null &&
      cursor.lastLatLng !== null &&
      distanceBetweenCoordinates(cursor.lastLatLng, { lat, lng: lon }) >
        maxPointDistance
    ) {
      cursor.coordinates = [];
      cursor.inSegments = false;
    }

    const coordinate = [lon, lat];
    cursor.coordinates.push(coordinate);
    // A segment only becomes a line once it has a second point.
    if (!cursor.inSegments && cursor.coordinates.length === 2) {
      derived.segments.push({ user, device, coordinates: cursor.coordinates });
      cursor.inSegments = true;
    }

    let userPoints = derived.pointsByUser.get(user);
    if (!userPoints) {
      userPoints = [];
      derived.pointsByUser.set(user, userPoints);
    }
    userPoints.push(coordinate);

    const { bounds } = derived;
    if (lat < bounds.minLat) bounds.minLat = lat;
    if (lat > bounds.maxLat) bounds.maxLat = lat;
    if (lon < bounds.minLng) bounds.minLng = lon;
    if (lon > bounds.maxLng) bounds.maxLng = lon;

    if (location.poi) {
      derived.pois.push({ user, poi: location.poi, coordinate });
    }

    cursor.lastLatLng = { lat, lng: lon };
    derived.count += 1;
  }

  /** Rebuild the derivation from scratch over the whole history. */
  function rebuildDerived() {
    bench.mark("store:rebuildDerived");
    derived = createDerivedState();
    const history = locationHistory.value;

    Object.keys(history).forEach((user) => {
      Object.keys(history[user]).forEach((device) => {
        const locations = history[user][device];
        for (let i = 0; i < locations.length; i++) {
          extendDerived(user, device, locations[i]);
        }
      });
    });

    bench.measure("store:rebuildDerived", derived.count);
    publishDerived();
  }

  // Publish the (empty) initial state so consumers never see `null`.
  publishDerived();

  /**
   * Distinct colour per known user, so the map, markers and legend agree.
   *
   * @returns {Function} Lookup returning the colour for a username
   */
  const userColor = computed(() => {
    const colors = buildUserColorMap(users.value);
    return (user) => colors.get(user) || getUserColor(user);
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
    rebuildDerived();
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
    if (query.users) {
      selectedUsers.value = query.users.split(",").filter(Boolean);
    } else if (query.user) {
      // The single-user parameter predates multi-select; keep reading it.
      selectedUsers.value = [query.user];
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

    // A shared link to a past window should stay on that window. Leaving
    // real-time updates on would let the ticker drag the end date to the
    // present and silently widen the range.
    if (new Date(`${endDateTime.value}Z`) < new Date()) {
      realTimeUpdatesEnabled.value = false;
    }
  }

  async function loadData() {
    loadError.value = null;
    try {
      await Promise.all([getUsers(), getRecorderVersion()]);
      await getDevices();
      await Promise.all([getLastLocations(), getLocationHistory()]);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      log("STORE", error, LOG_ERROR);
      loadError.value = error.message || String(error);
      isLoading.value = false;
      return;
    }
    await connectWebsocket();
  }

  async function reloadData() {
    loadError.value = null;
    try {
      await Promise.all([getLastLocations(), getLocationHistory()]);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      log("STORE", error, LOG_ERROR);
      loadError.value = error.message || String(error);
      isLoading.value = false;
    }
  }

  /** Clear the current error and try loading everything again. */
  async function retryLoadData() {
    loadError.value = null;
    await loadData();
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
    let appended = false;
    if (!last || last.tst < location.tst) {
      next = current.concat(location);
      appended = true;
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
    triggerRef(locationHistory);

    if (appended) {
      // The common case: extend the derivation by one point instead of
      // recomputing it over the whole history.
      bench.mark("store:extendDerived");
      extendDerived(username, device, location);
      bench.measure("store:extendDerived", 1);
      publishDerived();
    } else {
      // An out-of-order or replacing point invalidates the tail of the
      // derivation, so fall back to a full rebuild.
      rebuildDerived();
    }
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
    // The API takes at most one user, so a multi-user selection is fetched in
    // full and narrowed here.
    const single = selectedUsers.value.length === 1;
    let locations = await api.getLastLocations(
      single ? selectedUsers.value[0] : null,
      single ? selectedDevice.value : null
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
    if (selectedUsers.value.length === 1 && selectedDevice.value) {
      targetDevices = { [selectedUsers.value[0]]: [selectedDevice.value] };
    } else if (selectedUsers.value.length > 0) {
      targetDevices = {};
      selectedUsers.value.forEach((user) => {
        if (devices.value[user]) {
          targetDevices[user] = devices.value[user];
        }
      });
    } else {
      targetDevices = devices.value;
    }

    if (requestAbortController.value) {
      requestAbortController.value.abort();
    }
    requestAbortController.value = new AbortController();

    loadProgress.value = { received: 0, total: 0, reliable: false };
    let received = 0;
    let total = 0;
    let reliable = true;

    /**
     * Aggregate progress across the per-device requests.
     *
     * The total is only meaningful if every request reported a usable one.
     *
     * @param {Object} chunk Progress for one chunk
     */
    const onProgress = (chunk) => {
      received += chunk.received;
      total += chunk.total;
      reliable = reliable && chunk.reliable;
      loadProgress.value = {
        received,
        total: reliable ? total : 0,
        reliable,
      };
    };

    try {
      const history = await bench.timeAsync(
        "api:getLocationHistory",
        () =>
          api.getLocationHistory(
            targetDevices,
            startDateTime.value,
            endDateTime.value,
            { signal: requestAbortController.value.signal },
            onProgress
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
        log("STORE", error, LOG_ERROR);
        loadError.value = error.message || String(error);
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

  /**
   * Replace the set of shown users.
   *
   * @param {User[]} value Usernames, empty for all
   */
  async function setSelectedUsers(value) {
    const next = [...new Set(value)];
    // A device belongs to one user, so any other selection clears it.
    if (next.length !== 1 || next[0] !== selectedUsers.value[0]) {
      selectedDevice.value = null;
    }
    selectedUsers.value = next;
    await reloadData();
  }

  /**
   * Show or hide a single user without disturbing the rest of the selection.
   *
   * @param {User} user Username
   * @param {Boolean} selected Whether the user should be shown
   */
  async function toggleSelectedUser(user, selected) {
    const next = selectedUsers.value.filter((u) => u !== user);
    if (selected) {
      next.push(user);
    }
    await setSelectedUsers(next);
  }

  async function setSelectedUser(user) {
    await setSelectedUsers(user === null ? [] : [user]);
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
    loadError,
    loadProgress,
    isInformationModalVisible,
    isMobileNavOpen,
    frontendVersion,
    recorderVersion,
    users,
    devices,
    lastLocations,
    filteredLastLocations,
    locationHistory,
    historyReloadVersion,
    selectedDeviceHistory,
    userColor,
    selectedUser,
    selectedUsers,
    isUserSelected,
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
    mapGeoData,
    notifyHistoryChanged,
    appendLocationToHistory,
    populateStateFromQuery,
    loadData,
    reloadData,
    retryLoadData,
    connectWebsocket,
    getUsers,
    getDevices,
    getLastLocations,
    getLocationHistory,
    updateTravelStats,
    triggerFitView,
    getRecorderVersion,
    setSelectedUser,
    setSelectedUsers,
    toggleSelectedUser,
    setSelectedDevice,
    setStartDateTime,
    setEndDateTime,
    setUnits,
    setMapLayerVisibility,
    setMapCenter,
    setMapZoom,
  };
});
