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
  const features = locationStore.filteredLocationHistoryLatLngGroups
    .filter(group => group.latLngs.length > 1)
    .map(group => ({
      type: 'Feature',
      properties: {
        color: getUserColor(group.user)
      },
      geometry: {
        type: 'LineString',
        coordinates: group.latLngs.map(ll => [ll.lng !== undefined ? ll.lng : ll[1], ll.lat !== undefined ? ll.lat : ll[0]]) // [lng, lat]
      }
    }));

  return { type: 'FeatureCollection', features };
};

const getHeatmapGeoJSON = () => {
  const features = locationStore.filteredLocationHistoryLatLngs.map(ll => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [ll.lng !== undefined ? ll.lng : ll[1], ll.lat !== undefined ? ll.lat : ll[0]]
    }
  }));

  return { type: 'FeatureCollection', features };
};

const createGeoJSONCircle = (center, radiusInMeters, points = 64) => {
    const coords = { latitude: center[1], longitude: center[0] };
    const km = radiusInMeters / 1000;
    const ret = [];
    const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
    const distanceY = km / 110.574;

    for(let i = 0; i < points; i++) {
        const theta = (i / points) * (2 * Math.PI);
        const x = distanceX * Math.cos(theta);
        const y = distanceY * Math.sin(theta);
        ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]); // close the polygon
    return { type: 'Polygon', coordinates: [ret] };
};

const getAccuracyCirclesGeoJSON = () => {
  const features = locationStore.filteredLastLocations.filter(l => l.acc).map(l => ({
    type: 'Feature',
    properties: { color: getUserColor(l.username) },
    geometry: createGeoJSONCircle([l.lon, l.lat], l.acc)
  }));
  return { type: 'FeatureCollection', features };
};

const getPointsGeoJSON = () => {
  const features = [];
  Object.keys(locationStore.filteredLocationHistory).forEach(user => {
    Object.keys(locationStore.filteredLocationHistory[user]).forEach(device => {
      locationStore.filteredLocationHistory[user][device].forEach(location => {
        if (locationStore.layers.poi && location.poi) {
          features.push({
            type: 'Feature',
            properties: { type: 'poi', poi: location.poi, color: getUserColor(user) },
            geometry: { type: 'Point', coordinates: [location.lon, location.lat] }
          });
        }
        if (locationStore.layers.points) {
          features.push({
            type: 'Feature',
            properties: { type: 'point', color: getUserColor(user) },
            geometry: { type: 'Point', coordinates: [location.lon, location.lat] }
          });
        }
      });
    });
  });
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

  // Accuracy Circles Source & Layer
  if (!map.getSource('accuracy-circles')) {
    map.addSource('accuracy-circles', { type: 'geojson', data: getAccuracyCirclesGeoJSON() });
    map.addLayer({
      id: 'accuracy-circles-layer',
      type: 'fill',
      source: 'accuracy-circles',
      layout: { 'visibility': locationStore.layers.last ? 'visible' : 'none' },
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': config.map.circle?.fillOpacity || 0.2 }
    });
    map.addLayer({
      id: 'accuracy-circles-outline',
      type: 'line',
      source: 'accuracy-circles',
      layout: { 'visibility': locationStore.layers.last ? 'visible' : 'none' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.5 }
    });
  }

  // Points Source & Layers
  if (!map.getSource('history-points')) {
    map.addSource('history-points', { type: 'geojson', data: getPointsGeoJSON() });
    
    // Regular History Points
    map.addLayer({
      id: 'history-points-layer',
      type: 'circle',
      source: 'history-points',
      filter: ['==', 'type', 'point'],
      layout: { 'visibility': locationStore.layers.points ? 'visible' : 'none' },
      paint: {
        'circle-radius': config.map.circleMarker?.radius || 4,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff'
      }
    });

    // POI Markers
    map.addLayer({
      id: 'history-poi-layer',
      type: 'circle',
      source: 'history-points',
      filter: ['==', 'type', 'poi'],
      layout: { 'visibility': locationStore.layers.poi ? 'visible' : 'none' },
      paint: {
        'circle-radius': config.map.poiMarker?.radius || 12,
        'circle-color': ['get', 'color'],
        'circle-opacity': config.map.poiMarker?.fillOpacity || 0.4,
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'color']
      }
    });

    // POI Labels
    map.addLayer({
      id: 'history-poi-label-layer',
      type: 'symbol',
      source: 'history-points',
      filter: ['==', 'type', 'poi'],
      layout: {
        'visibility': locationStore.layers.poi ? 'visible' : 'none',
        'text-field': ['get', 'poi'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom'
      },
      paint: {
        'text-color': '#000000',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
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
  if (map.getLayer('accuracy-circles-layer')) {
    map.setLayoutProperty('accuracy-circles-layer', 'visibility', locationStore.layers.last ? 'visible' : 'none');
    map.setLayoutProperty('accuracy-circles-outline', 'visibility', locationStore.layers.last ? 'visible' : 'none');
  }
  if (map.getLayer('history-points-layer')) {
    map.setLayoutProperty('history-points-layer', 'visibility', locationStore.layers.points ? 'visible' : 'none');
  }
  if (map.getLayer('history-poi-layer')) {
    map.setLayoutProperty('history-poi-layer', 'visibility', locationStore.layers.poi ? 'visible' : 'none');
    map.setLayoutProperty('history-poi-label-layer', 'visibility', locationStore.layers.poi ? 'visible' : 'none');
  }
  
  const accuracySource = map.getSource('accuracy-circles');
  if (accuracySource) accuracySource.setData(getAccuracyCirclesGeoJSON());

  const pointsSource = map.getSource('history-points');
  if (pointsSource) pointsSource.setData(getPointsGeoJSON());
};

const fitView = () => {
  if (!map) return;
  const { layers } = locationStore;
  const historyLatLngs = locationStore.filteredLocationHistoryLatLngs;
  
  if ((layers.line || layers.points || layers.poi || layers.heatmap) && historyLatLngs.length > 0) {
    const bounds = new maplibregl.LngLatBounds();
    historyLatLngs.forEach(ll => bounds.extend([ll.lng !== undefined ? ll.lng : ll[1], ll.lat !== undefined ? ll.lat : ll[0]]));
    map.fitBounds(bounds, { padding: 50 });
  } else if (layers.last && locationStore.lastLocations.length > 0) {
    const bounds = new maplibregl.LngLatBounds();
    locationStore.lastLocations.forEach(l => bounds.extend([l.lon, l.lat]));
    map.fitBounds(bounds, { padding: 50, maxZoom: config.map.maxNativeZoom || 16 });
  }
};

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: currentStyle.value,
    center: [parseFloat(locationStore.map.center.lng) || 0, parseFloat(locationStore.map.center.lat) || 0], // [lng, lat]
    zoom: locationStore.map.zoom,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');

  map.on('style.load', () => {
    initSourcesAndLayers();
    fitView();
  });

  map.on('load', () => {
    renderMarkers();
    initSourcesAndLayers();
    fitView();
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

watch(() => locationStore.fitViewToggle, fitView);
watch(() => locationStore.lastLocations, () => {
  if (config.onLocationChange?.fitView) fitView();
}, { deep: true });
watch(() => locationStore.locationHistory, () => {
  fitView();
});

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