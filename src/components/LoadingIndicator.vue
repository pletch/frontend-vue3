<template>
  <div v-if="locationStore.isLoading" :class="containerClass" role="status">
    <LoaderIcon class="w-4 h-4 shrink-0 text-primary animate-spin" />
    <div class="flex-1 min-w-0">
      <p class="font-medium truncate">{{ $t("Loading data...") }}</p>
      <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          v-if="percent !== null"
          class="h-full rounded-full bg-primary transition-[width]"
          :style="{ width: `${percent}%` }"
        ></div>
        <div
          v-else
          class="h-full w-1/3 rounded-full bg-primary animate-pulse"
        ></div>
      </div>
      <p class="mt-1 text-xs text-gray-600 tabular-nums truncate">
        <span v-if="progress.slices > 1">
          {{
            $t("Part {done} of {total}", {
              done: Math.min(progress.slice + 1, progress.slices),
              total: progress.slices,
            })
          }}
          &middot; {{ humanReadableBytes(progress.received) }}
        </span>
        <span v-else-if="percent !== null">
          {{ humanReadableBytes(progress.received) }} /
          {{ humanReadableBytes(progress.total) }}
        </span>
        <span v-else>
          {{
            $t("{size} received", {
              size: humanReadableBytes(progress.received),
            })
          }}
        </span>
      </p>
    </div>
    <button
      type="button"
      :class="cancelClass"
      :title="$t('Cancel')"
      @click="cancelRequest"
    >
      <XIcon class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { LoaderIcon, XIcon } from "lucide-vue-next";

import { useLocationStore } from "@/store/location";
import { humanReadableBytes } from "@/util";

const locationStore = useLocationStore();

const progress = computed(() => locationStore.loadProgress);

const percent = computed(() => {
  const { received, total, reliable, slice, slices } = progress.value;
  // With a sliced request, completed slices are a more honest measure than
  // bytes: each slice only reports its own total once it has started.
  if (slices > 1) {
    return Math.min(100, Math.round((slice / slices) * 100));
  }
  if (!reliable || !total) {
    return null;
  }
  return Math.min(100, Math.round((received / total) * 100));
});

// Deliberately not a modal: data is rendered as it arrives, so covering the
// map would hide the very thing the user is waiting for.
const containerClass = [
  "absolute top-2 left-1/2 -translate-x-1/2 z-30",
  "w-[calc(100%-1rem)] max-w-xs flex items-center gap-3",
  "rounded-lg border px-3 py-2 text-sm shadow-lg",
  "border-gray-200 bg-white/95 text-gray-800 backdrop-blur-sm",
  "dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-100",
].join(" ");

const cancelClass = [
  "touch-target shrink-0 self-start rounded p-0.5",
  "hover:bg-gray-200/70 dark:hover:bg-gray-700/70",
  "focus-visible:outline focus-visible:outline-2",
  "focus-visible:outline-offset-1",
].join(" ");

const cancelRequest = () => {
  if (locationStore.requestAbortController) {
    locationStore.requestAbortController.abort();
  }
};
</script>
