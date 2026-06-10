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

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: currentStyle.value,
    center: [locationStore.map.center[1], locationStore.map.center[0]], // [lng, lat]
    zoom: locationStore.map.zoom,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');

  map.on('load', () => {
    renderMarkers();
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