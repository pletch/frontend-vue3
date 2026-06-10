<template>
  <div class="h-full w-full" ref="mapContainer"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLocationStore } from "@/store/location";
import config from "@/config";
import { useDark } from "@vueuse/core";

const mapContainer = ref(null);
let map = null;
const locationStore = useLocationStore();
const isDark = useDark();

const currentStyle = computed(() => 
  isDark.value ? "https://tiles.openfreemap.org/styles/dark" : "https://tiles.openfreemap.org/styles/liberty"
);

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
    // Add sources and layers here in the future
  });
});

watch(currentStyle, (newStyle) => {
  if (map) {
    map.setStyle(newStyle);
  }
});

onUnmounted(() => {
  if (map) map.remove();
});
</script>