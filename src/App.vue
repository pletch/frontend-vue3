<template>
  <div id="app" class="flex flex-col h-screen overflow-hidden">
    <AppHeader />
    <main class="flex-grow relative overflow-hidden z-0">
      <router-view />
    </main>
    <InformationModal />
    <LoadingModal />
  </div>
</template>

<script setup>
import { onMounted, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useLocationStore } from "@/store/location";
import config from "@/config";
import { log } from "@/logging";
import AppHeader from "@/components/AppHeader.vue";
import InformationModal from "@/components/modals/InformationModal.vue";
import LoadingModal from "@/components/modals/LoadingModal.vue";

const route = useRoute();
const router = useRouter();
const locationStore = useLocationStore();
const { locale } = useI18n();

// Keep html lang attribute in sync with the i18n locale
watchEffect(() => {
  document.documentElement.setAttribute("lang", locale.value);
});

// Log locale changes to verify functionality
watch(locale, (val) => {
  log("I18N", `Locale initialized/changed to: ${val}`);
});

/**
 * Update all URL query parameters. This is called whenever any
 * of the relevant values change in the Pinia store.
 */
const updateUrlQuery = () => {
  const {
    map,
    layers,
    startDateTime: start,
    endDateTime: end,
    selectedUser: user,
    selectedDevice: device,
  } = locationStore;
  const activeLayers = Object.keys(layers).filter((key) => layers[key] === true);
  const query = {
    lat: map.center.lat,
    lng: map.center.lng,
    zoom: map.zoom,
    start,
    end,
    ...(user !== null && { user }),
    ...(user !== null && device !== null && { device }),
    ...(activeLayers.length > 0 && { layers: activeLayers.join(",") }),
  };
  log("STATE", "Updating URL query from state");
  log("STATE", JSON.parse(JSON.stringify({ map, start, end, user, device })));
  router.replace({ query }).catch(() => {}); // https://github.com/vuejs/vue-router/issues/2872#issuecomment-519073998
};

// Update URL query params when relevant values change
watch(
  [
    () => locationStore.selectedUser,
    () => locationStore.selectedDevice,
    () => locationStore.startDateTime,
    () => locationStore.endDateTime,
    () => locationStore.map,
    () => locationStore.layers,
  ],
  () => updateUrlQuery(),
  { deep: true }
);

onMounted(() => {
  document.documentElement.style.setProperty("--color-primary", config.primaryColor);
  document.documentElement.style.setProperty("--color-separator", "#eee");
  locationStore.populateStateFromQuery(route.query);
  locationStore.loadData();
  // Initially update URL query params from state
  updateUrlQuery();
});
</script>

<style lang="scss"></style>
