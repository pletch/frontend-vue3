<template>
  <teleport to="body">
    <div v-if="locationStore.isLoading" :class="backdropClass">
      <div :class="panelClass" role="status" aria-live="polite">
        <LoaderIcon class="w-8 h-8 mx-auto mb-4 text-primary animate-spin" />
        <p class="mb-3 text-lg text-gray-800">
          {{ $t("Loading data, please wait...") }}
        </p>

        <!-- A determinate bar when the recorder told us how much to expect,
             otherwise just how much has arrived so far. -->
        <div
          v-if="progress.received > 0"
          class="mb-4 text-sm text-gray-600 tabular-nums"
        >
          <div
            class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 mb-2"
          >
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
          <span v-if="percent !== null">
            {{ humanReadableBytes(progress.received) }} /
            {{ humanReadableBytes(progress.total) }} ({{ percent }}%)
          </span>
          <span v-else>
            {{
              $t("{size} received", {
                size: humanReadableBytes(progress.received),
              })
            }}
          </span>
        </div>

        <button class="btn-primary" type="button" @click="cancelRequest">
          {{ $t("Cancel") }}
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed } from "vue";
import { LoaderIcon } from "lucide-vue-next";

import { useLocationStore } from "@/store/location";
import { humanReadableBytes } from "@/util";

const locationStore = useLocationStore();

const backdropClass = [
  "fixed inset-0 z-[2000] p-4",
  "flex items-center justify-center bg-black/40",
].join(" ");

const panelClass = [
  "w-full max-w-[320px] rounded-md border border-separator",
  "bg-white p-6 text-center shadow-xl",
].join(" ");

const progress = computed(() => locationStore.loadProgress);

const percent = computed(() => {
  const { received, total, reliable } = progress.value;
  if (!reliable || !total) {
    return null;
  }
  return Math.min(100, Math.round((received / total) * 100));
});

const cancelRequest = () => {
  if (locationStore.requestAbortController) {
    locationStore.requestAbortController.abort();
  }
};
</script>
