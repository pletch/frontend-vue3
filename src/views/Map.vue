<template>
  <div class="h-full w-full">
    <l-map
      ref="mapRef"
      v-model:zoom="locationStore.map.zoom"
      v-model:center="locationStore.map.center"
      :options="{ zoomControl: false }"
      @ready="onMapReady"
    >
      <l-control-zoom
        v-if="config.map.controls.zoom.display"
        :position="config.map.controls.zoom.position"
      />
      <l-control-scale
        v-if="config.map.controls.scale.display"
        :position="config.map.controls.scale.position"
        :max-width="config.map.controls.scale.maxWidth"
        :metric="config.map.controls.scale.metric"
        :imperial="config.map.controls.scale.imperial"
      />
      <l-tile-layer
        :url="config.map.url"
        :class-name="isDark ? 'map-tiles-dark' : ''"
        :attribution="config.map.attribution"
        :tile-size="config.map.tileSize"
        :max-native-zoom="config.map.maxNativeZoom"
        :max-zoom="config.map.maxZoom"
        :zoom-offset="config.map.zoomOffset"
      />

      <!-- History Lines Layer -->
      <template v-if="locationStore.layers.line">
        <l-polyline
          v-for="(group, index) in locationStore.filteredLocationHistoryLatLngGroups"
          :key="`line-${group.user}-${group.device}-${index}`"
          :lat-lngs="group.latLngs"
          v-bind="{ ...polylineOptions, color: getUserColor(group.user) }"
        />
      </template>

      <!-- Points of Interest and History Points Layers -->
      <template v-for="(devices, user) in locationStore.filteredLocationHistory" :key="user">
        <template v-for="(locations, device) in devices" :key="device">
          <template
            v-for="(location, index) in deviceLocationsWithNameAndFace(user, device, locations)"
            :key="`${user}-${device}-${location.tst}-${index}`"
          >
            <!-- POI Layer -->
            <l-circle-marker
              v-if="locationStore.layers.poi && location.poi"
              :lat-lng="[location.lat, location.lon]"
              v-bind="{ ...poiMarkerOptions, color: getUserColor(user), fillColor: getUserColor(user) }"
            >
              <l-tooltip :options="{ permanent: true }">
                {{ location.poi }}
              </l-tooltip>
            </l-circle-marker>

            <!-- History Points Layer -->
            <l-circle-marker
              v-if="locationStore.layers.points"
              :lat-lng="[location.lat, location.lon]"
              v-bind="{ ...circleMarkerOptions, color: getUserColor(user) }"
            >
              <l-device-location-popup v-bind="getPopupProps(user, device, location)" />
            </l-circle-marker>
          </template>
        </template>
      </template>

      <!-- Last Known Locations Layer -->
      <template v-if="locationStore.layers.last">
        <!-- Accuracy Circles -->
        <l-circle
          v-for="location in locationStore.filteredLastLocations"
          :key="`acc-${location.username}-${location.device}`"
          :lat-lng="[location.lat, location.lon]"
          :radius="location.acc"
          v-bind="{ ...circleOptions, color: getUserColor(location.username), fillColor: getUserColor(location.username) }"
        />
        <!-- Pin Markers -->
        <l-marker
          v-for="location in locationStore.filteredLastLocations"
          :key="`marker-${location.username}-${location.device}`"
          :lat-lng="[location.lat, location.lon]"
        >
          <l-icon class-name="" :icon-size="[44, 44]" :icon-anchor="[22, 22]">
            <div 
              class="relative flex items-center justify-center w-11 h-11 rounded-full text-white font-bold shadow-md border-2 border-white" 
              :style="{ backgroundColor: getUserColor(location.username) }"
            >
              {{ location.tid || location.username.substring(0, 2).toUpperCase() }}
              
              <div 
                v-if="getActivityIconDetails(location)" 
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white" 
                :class="getActivityIconDetails(location).colorClass"
              >
                <component :is="getActivityIconDetails(location).icon" class="w-3 h-3" />
              </div>
            </div>
          </l-icon>
          <l-device-location-popup
            v-bind="getPopupProps(location.username, location.device, location)"
            :options="{ className: 'leaflet-popup--for-pin', maxWidth: 400 }"
          />
        </l-marker>
      </template>

      <!-- Heatmap Layer -->
      <l-heatmap
        v-if="locationStore.layers.heatmap && locationStore.filteredLocationHistoryLatLngs.length"
        :lat-lng="locationStore.filteredLocationHistoryLatLngs"
        v-bind="heatmapOptions"
      />
    </l-map>
  </div>
</template>

<script setup>
import { ref, computed, watch, markRaw, provide } from "vue";
import { useDark } from "@vueuse/core";
import {
  LMap,
  LTileLayer,
  LControlScale,
  LControlZoom,
  LMarker,
  LCircleMarker,
  LCircle,
  LPolyline,
  LTooltip,
  LIcon,
} from "@vue-leaflet/vue-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useLocationStore } from "@/store/location";
import config from "@/config";
import LDeviceLocationPopup from "@/components/LDeviceLocationPopup.vue";
import LHeatmap from "@/components/LHeatmap.vue";
import { getUserColor } from "@/util";
import { PersonStandingIcon, BikeIcon, CarIcon } from "lucide-vue-next";

const locationStore = useLocationStore();
const mapRef = ref(null);
const isDark = useDark();

provide("map", computed(() => mapRef.value?.leafletObject));
let mapInstance = null;

const onMapReady = (leafletMap) => {
  fitView();
};



// Style Options from Config
const polylineOptions = computed(() => ({
  ...config.map.polyline,
  color: config.map.polyline.color || config.primaryColor,
}));
const poiMarkerOptions = computed(() => ({
  ...config.map.poiMarker,
  color: config.map.poiMarker.color || config.primaryColor,
  fillColor: config.map.poiMarker.fillColor || config.primaryColor,
}));
const circleMarkerOptions = computed(() => ({
  ...config.map.circleMarker,
  color: config.map.circleMarker.color || config.primaryColor,
}));
const circleOptions = computed(() => ({
  ...config.map.circle,
  color: config.map.circle.color || config.primaryColor,
  fillColor: config.map.circle.fillColor || config.primaryColor,
}));
const heatmapOptions = computed(() => ({
  ...config.map.heatmap,
  gradient: config.map.heatmap.gradient || {
    0.4: "blue",
    0.6: "cyan",
    0.7: "lime",
    0.8: "yellow",
    1.0: config.primaryColor,
  },
}));

// Data transformation helpers
const deviceLocationsWithNameAndFace = (username, device, locations) => {
  const lastLoc = locationStore.lastLocations.find((l) => l.username === username && l.device === device);
  return lastLoc ? locations.map((loc) => ({ ...loc, name: lastLoc.name, face: lastLoc.face })) : locations;
};

const getPopupProps = (user, device, location) => ({
  user, device, name: location.name, face: location.face, timestamp: location.tst, createdAt: location.created_at, isorcv: location.isorcv, isoLocal: location.isolocal, timeZone: location.tzname, lat: location.lat, lon: location.lon, alt: location.alt, battery: location.batt, batteryStatus: location.bs, speed: location.vel, regions: location.inregions, wifi: { ssid: location.SSID, bssid: location.BSSID }, address: location.addr, activity: Array.isArray(location.motionactivities) ? location.motionactivities.join(", ") : null
});

const getActivityIconDetails = (location) => {
  const acts = location.motionactivities;
  if (!Array.isArray(acts) || acts.length === 0) return null;
  const a = acts.join(" ").toLowerCase();

  if (a.includes("automative") || a.includes("automotive") || a.includes("driving")) {
    return { icon: CarIcon, colorClass: "bg-blue-500" };
  } else if (a.includes("cycling") || a.includes("bike")) {
    return { icon: BikeIcon, colorClass: "bg-orange-500" };
  } else if (a.includes("walking") || a.includes("running") || a.includes("foot")) {
    return { icon: PersonStandingIcon, colorClass: "bg-green-500" };
  }
  // Returns null for "stationary", "unknown", or anything else
  return null;
};

const fitView = () => {
  const mapInstance = mapRef.value?.leafletObject;
  if (!mapInstance) return;
  const { layers } = locationStore;
  const historyLatLngs = locationStore.filteredLocationHistoryLatLngs;
  if ((layers.line || layers.points || layers.poi || layers.heatmap) && historyLatLngs.length > 0) {
    mapInstance.fitBounds(L.latLngBounds(historyLatLngs));
  } else if (layers.last && locationStore.lastLocations.length > 0) {
    const bounds = L.latLngBounds(locationStore.lastLocations.map((l) => [l.lat, l.lon]));
    mapInstance.fitBounds(bounds, { maxZoom: config.map.maxNativeZoom });
  }
};

watch(() => locationStore.fitViewToggle, fitView);
watch(() => locationStore.lastLocations, () => {
  if (config.onLocationChange?.fitView) fitView();
}, { deep: true });
watch(() => locationStore.locationHistory, () => {
  // Always auto-fit when the entire history is explicitly reloaded (e.g. initial load or date change)
  fitView();
});
</script>
<style>
.map-tiles-dark {
  filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
}
</style>
