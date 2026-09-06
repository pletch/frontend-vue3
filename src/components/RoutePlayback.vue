<template>
  <div v-if="history.length > 0" :class="containerClass">
    <button
      @click="togglePlayback"
      class="touch-target shrink-0 text-primary hover:text-blue-600 focus:outline-none transition-colors"
      type="button"
      :title="isPlaying ? $t('Pause') : $t('Play')"
    >
      <PlayIcon v-if="!isPlaying" class="w-6 h-6" />
      <PauseIcon v-else class="w-6 h-6" />
    </button>
    <div class="flex flex-col flex-1 min-w-0 sm:w-64 sm:flex-none">
      <input
        type="range"
        :min="0"
        :max="history.length - 1"
        v-model.number="currentIndex"
        class="w-full h-6 accent-primary"
        :aria-label="$t('Playback position')"
        @input="pausePlayback"
      />
      <span v-if="currentTime" class="text-xs text-center text-gray-500 mt-1">
        {{ currentTime }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import { useLocationStore } from "@/store/location";
import { PlayIcon, PauseIcon } from "lucide-vue-next";

const locationStore = useLocationStore();

// Sits above the map attribution and clear of the home indicator on phones,
// and spans the width on small screens rather than using a fixed slider width.
const containerClass = [
  "fixed safe-inset-bottom left-1/2 -translate-x-1/2 z-[1000]",
  "w-[calc(100%-1.5rem)] max-w-md sm:w-auto",
  "flex items-center gap-3 sm:gap-4",
  "rounded-full border px-4 sm:px-6 py-3 shadow-xl",
  "bg-white border-gray-200",
  "dark:bg-gray-800 dark:border-gray-700",
].join(" ");
const isPlaying = ref(false);
const currentIndex = ref(0);
let interval = null;

// The store owns this derivation so that components do not need to know how
// changes to the (columnar, in-place mutated) history are signalled.
const history = computed(() => locationStore.selectedDeviceHistory);

// Locations are materialised one at a time from columnar storage, which is all
// playback ever needs.
const currentPoint = computed(() =>
  history.value.track ? history.value.track.at(currentIndex.value) : null
);

const currentTime = computed(() =>
  currentPoint.value
    ? new Date(currentPoint.value.tst * 1000).toLocaleString()
    : ""
);

const togglePlayback = () => {
  if (isPlaying.value) {
    pausePlayback();
  } else {
    if (currentIndex.value >= history.value.length - 1) {
      currentIndex.value = 0;
    }
    isPlaying.value = true;
    interval = setInterval(() => {
      if (currentIndex.value < history.value.length - 1) {
        currentIndex.value++;
      } else {
        pausePlayback();
      }
    }, 100);
  }
};

const pausePlayback = () => {
  isPlaying.value = false;
  if (interval) clearInterval(interval);
};

onUnmounted(() => {
  if (interval) clearInterval(interval);
});

watch(currentIndex, () => {
  if (currentPoint.value) {
    locationStore.playbackPoint = currentPoint.value;
  }
});

watch(history, (next) => {
  if (next.length === 0) {
    pausePlayback();
    locationStore.playbackPoint = null;
  } else if (currentIndex.value >= next.length) {
    currentIndex.value = 0;
  }
});
</script>
