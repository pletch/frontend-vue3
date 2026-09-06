<template>
  <div v-if="entries.length > 1" :class="legendClass" role="list">
    <div
      v-for="entry in entries"
      :key="entry.user"
      class="flex items-center gap-1.5"
      role="listitem"
    >
      <span
        class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        :style="{ backgroundColor: entry.color }"
        aria-hidden="true"
      ></span>
      <span class="truncate max-w-[8rem]">{{ entry.user }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useLocationStore } from "@/store/location";

const locationStore = useLocationStore();

// Only the users actually on the map, so the legend describes what is visible
// rather than everything the recorder knows about.
const entries = computed(() => {
  const visible = new Set<User>();
  locationStore.mapGeoData.pointsByUser.forEach((coordinates, user) => {
    if (coordinates.length > 0) {
      visible.add(user);
    }
  });
  locationStore.filteredLastLocations.forEach((location) => {
    if (location.username) {
      visible.add(location.username);
    }
  });

  // A user whose marker the stale filter removed should not be named here
  // either, even though their history is still drawn.
  const stale = locationStore.staleFilteredUsers;

  return [...visible]
    .filter((user) => user && !stale.has(user))
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((user) => ({ user, color: locationStore.userColor(user) }));
});

// The playback bar spans nearly the full width on phones, so on small screens
// the legend has to clear it rather than sit underneath. It is also capped and
// scrollable: a long roster would otherwise run off the bottom of the display.
const hasPlayback = computed(
  () => locationStore.selectedDeviceHistory.length > 0
);

const legendClass = computed(() =>
  [
    "absolute left-2 z-10 safe-bottom",
    "max-h-[40vh] overflow-y-auto overscroll-contain",
    hasPlayback.value ? "bottom-24 sm:bottom-8" : "bottom-8",
    "flex flex-col gap-1 rounded-md border px-2.5 py-2 text-xs shadow-md",
    "bg-white/90 border-gray-200 text-gray-800 backdrop-blur-sm",
    "dark:bg-gray-900/90 dark:border-gray-700 dark:text-gray-100",
  ].join(" ")
);
</script>
