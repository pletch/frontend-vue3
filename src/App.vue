<template>
  <div
    id="app"
    class="flex flex-col h-screen w-screen overflow-hidden text-sm sm:text-base font-sans text-gray-900 bg-gray-50 dark:bg-gray-900 dark:text-gray-100"
  >
    <AppHeader />
    <main class="relative flex-grow h-full w-full bg-gray-200 dark:bg-gray-800">
      <router-view />
      <RoutePlayback />
      <ConnectionErrorBanner />
      <UserLegend />
      <LoadingIndicator />
    </main>
    <InformationModal />
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
import RoutePlayback from "@/components/RoutePlayback.vue";
import ConnectionErrorBanner from "@/components/ConnectionErrorBanner.vue";
import UserLegend from "@/components/UserLegend.vue";
import InformationModal from "@/components/modals/InformationModal.vue";
import LoadingIndicator from "@/components/LoadingIndicator.vue";

const route = useRoute();
const router = useRouter();
const locationStore = useLocationStore();
const { locale } = useI18n();

// Applied during setup rather than on mount: Vue mounts children before their
// parent, so the map is created from the store before this component's
// `onMounted` would run, and a shared link's position would be ignored.
locationStore.populateStateFromQuery(route.query);

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
    selectedUsers: users,
    selectedDevice: device,
  } = locationStore;
  const activeLayers = Object.keys(layers).filter(
    (key) => layers[key] === true
  );
  const query = {
    lat: map.center.lat,
    lng: map.center.lng,
    zoom: map.zoom,
    start,
    end,
    ...(users.length > 0 && { users: users.join(",") }),
    ...(users.length === 1 && device !== null && { device }),
    ...(activeLayers.length > 0 && { layers: activeLayers.join(",") }),
  };
  log("STATE", "Updating URL query from state");
  log("STATE", JSON.parse(JSON.stringify({ map, start, end, users, device })));
  router.replace({ query }).catch(() => {}); // https://github.com/vuejs/vue-router/issues/2872#issuecomment-519073998
};

// Update URL query params when relevant values change
watch(
  [
    () => locationStore.selectedUsers,
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
  document.documentElement.style.setProperty(
    "--color-primary",
    config.primaryColor
  );
  document.documentElement.style.setProperty("--color-separator", "#eee");
  locationStore.loadData();
  // Initially update URL query params from state
  updateUrlQuery();
});
</script>

<style lang="scss"></style>
