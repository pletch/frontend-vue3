<template>
  <div v-if="historyPoints.length > 0" class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center space-x-4 z-[1000]">
    <button @click="togglePlayback" class="text-primary hover:text-blue-600 focus:outline-none transition-colors">
      <PlayIcon v-if="!isPlaying" class="w-6 h-6" />
      <PauseIcon v-else class="w-6 h-6" />
    </button>
    <div class="flex flex-col w-64">
      <input type="range" :min="0" :max="historyPoints.length - 1" v-model.number="currentIndex" class="w-full" @input="pausePlayback" />
      <span class="text-xs text-center text-gray-500 mt-1" v-if="historyPoints[currentIndex]">
        {{ new Date(historyPoints[currentIndex].tst * 1000).toLocaleString() }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useLocationStore } from '@/store/location';
import { PlayIcon, PauseIcon } from 'lucide-vue-next';

const locationStore = useLocationStore();
const isPlaying = ref(false);
const currentIndex = ref(0);
let interval = null;

const historyPoints = computed(() => {
  if (!locationStore.selectedUser || !locationStore.selectedDevice) return [];
  const userHistory = locationStore.locationHistory[locationStore.selectedUser];
  if (!userHistory) return [];
  return userHistory[locationStore.selectedDevice] || [];
});

const togglePlayback = () => {
  if (isPlaying.value) {
    pausePlayback();
  } else {
    if (currentIndex.value >= historyPoints.value.length - 1) {
      currentIndex.value = 0;
    }
    isPlaying.value = true;
    interval = setInterval(() => {
      if (currentIndex.value < historyPoints.value.length - 1) {
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

watch(currentIndex, (val) => {
  const point = historyPoints.value[val];
  if (point) {
    locationStore.playbackPoint = point;
  }
});
</script>
