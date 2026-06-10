<template>
  <div class="h-full w-full relative">
    <div class="absolute inset-0" ref="mapContainer"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, h, render, getCurrentInstance } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLocationStore } from "@/store/location";
import config from "@/config";
import { useDark } from "@vueuse/core";
import { getUserColor } from "@/util";
import LDeviceLocationPopup from "@/components/LDeviceLocationPopup.vue";
import { PersonStandingIcon, BikeIcon, CarIcon } from "lucide-vue-next";

const mapContainer = ref(null);
let map = null;
const locationStore = useLocationStore();
const isDark = useDark();
const instance = getCurrentInstance();

const currentStyle = computed(() => 
  isDark.value ? "https://tiles.openfreemap.org/styles/dark" : "https://tiles.openfreemap.org/styles/liberty"
);

// Map of active markers: key -> { marker, popupApp, elementApp }
const activeMarkers = new Map();

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
  return null;
};

const getPopupProps = (user, device, location) => ({
  user, device, name: location.name, face: location.face, timestamp: location.tst, createdAt: location.created_at, isorcv: location.isorcv, isoLocal: location.isolocal, timeZone: location.tzname, lat: location.lat, lon: location.lon, alt: location.alt, battery: location.batt, batteryStatus: location.bs, speed: location.vel, regions: location.inregions, wifi: { ssid: location.SSID, bssid: location.BSSID }, address: location.addr, activity: Array.isArray(location.motionactivities) ? location.motionactivities.join(", ") : null
});

const renderMarkers = () => {
  if (!map) return;

  const currentKeys = new Set();

  locationStore.filteredLastLocations.forEach(location => {
    const key = `marker-${location.username}-${location.device}`;
    currentKeys.add(key);

    if (activeMarkers.has(key)) {
      // Update existing marker position
      activeMarkers.get(key).marker.setLngLat([location.lon, location.lat]);
    } else {
      // Create new DOM element for the pin
      const el = document.createElement('div');
      
      const pinApp = createApp({
        render: () => {
          return null; // Will just manually build innerHTML for performance instead of full vue app for pin
        }
      });
      
      // Build raw HTML for the pin to save memory
      const color = getUserColor(location.username);
      const initials = location.tid || location.username.substring(0, 2).toUpperCase();
      const activity = getActivityIconDetails(location);
      
      let activityHtml = '';
      if (activity) {
        // Simple raw html for activity icon
        activityHtml = `<div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white ${activity.colorClass}">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>
        </div>`;
      }

      el.innerHTML = `
        <div class="relative flex items-center justify-center w-11 h-11 rounded-full text-white font-bold shadow-md border-2 border-white" style="background-color: ${color}">
          ${initials}
          ${activityHtml}
        </div>
      `;

      // Create Popup using Vue Component
      const popupContainer = document.createElement('div');
      const vnode = h(LDeviceLocationPopup, getPopupProps(location.username, location.device, location));
      vnode.appContext = instance.appContext;
      render(vnode, popupContainer);

      const popup = new maplibregl.Popup({ offset: 25, className: 'maplibre-popup-custom' })
        .setDOMContent(popupContainer);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
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
};

const getLinesGeoJSON = () => {
  const features = locationStore.filteredLocationHistoryLatLngGroups.map(group => ({
    type: 'Feature',
    properties: {
      color: getUserColor(group.user)
    },
    geometry: {
      type: 'LineString',
      coordinates: group.latLngs.map(latLng => [latLng[1], latLng[0]]) // [lng, lat]
    }
  }));

  return { type: 'FeatureCollection', features };
};

const getHeatmapGeoJSON = () => {
  const features = locationStore.filteredLocationHistoryLatLngs.map(latLng => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [latLng[1], latLng[0]]
    }
  }));

  return { type: 'FeatureCollection', features };
};

const initSourcesAndLayers = () => {
  if (!map) return;

  // Lines Source & Layer
  if (!map.getSource('history-lines')) {
    map.addSource('history-lines', {
      type: 'geojson',
      data: getLinesGeoJSON()
    });

    map.addLayer({
      id: 'history-lines-layer',
      type: 'line',
      source: 'history-lines',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        'visibility': locationStore.layers.line ? 'visible' : 'none'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': config.map.polyline?.weight || 3,
        'line-opacity': config.map.polyline?.opacity || 0.8
      }
    });
  }

  // Heatmap Source & Layer
  if (!map.getSource('history-heatmap')) {
    map.addSource('history-heatmap', {
      type: 'geojson',
      data: getHeatmapGeoJSON()
    });

    map.addLayer({
      id: 'history-heatmap-layer',
      type: 'heatmap',
      source: 'history-heatmap',
      layout: {
        'visibility': locationStore.layers.heatmap ? 'visible' : 'none'
      },
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': 1,
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(33,102,172,0)',
          0.2, 'rgb(103,169,207)',
          0.4, 'rgb(209,229,240)',
          0.6, 'rgb(253,219,199)',
          0.8, 'rgb(239,138,98)',
          1, config.primaryColor || 'rgb(178,24,43)'
        ],
        'heatmap-radius': config.map.heatmap?.radius || 15,
        'heatmap-opacity': 0.8
      }
    });
  }
};

const updateGeoJSON = () => {
  if (!map || !map.isStyleLoaded()) return;

  const linesSource = map.getSource('history-lines');
  if (linesSource) linesSource.setData(getLinesGeoJSON());

  const heatmapSource = map.getSource('history-heatmap');
  if (heatmapSource) heatmapSource.setData(getHeatmapGeoJSON());

  if (map.getLayer('history-lines-layer')) {
    map.setLayoutProperty('history-lines-layer', 'visibility', locationStore.layers.line ? 'visible' : 'none');
  }
  if (map.getLayer('history-heatmap-layer')) {
    map.setLayoutProperty('history-heatmap-layer', 'visibility', locationStore.layers.heatmap ? 'visible' : 'none');
  }
};

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: currentStyle.value,
    center: [locationStore.map.center[1], locationStore.map.center[0]], // [lng, lat]
    zoom: locationStore.map.zoom,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');

  map.on('style.load', () => {
    initSourcesAndLayers();
  });

  map.on('load', () => {
    renderMarkers();
    initSourcesAndLayers();
  });
});

watch(currentStyle, (newStyle) => {
  if (map) {
    map.setStyle(newStyle);
  }
});

watch(() => locationStore.filteredLastLocations, () => {
  renderMarkers();
}, { deep: true });

watch([
  () => locationStore.filteredLocationHistoryLatLngGroups, 
  () => locationStore.filteredLocationHistoryLatLngs,
  () => locationStore.layers
], () => {
  updateGeoJSON();
}, { deep: true });

onUnmounted(() => {
  if (map) map.remove();
  activeMarkers.forEach(data => render(null, data.popupContainer));
});
</script>

<style>
.maplibre-popup-custom .maplibregl-popup-content {
  padding: 0;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
</style>