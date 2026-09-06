<template>
  <div
    v-if="locationStore.loadError"
    :class="bannerClass"
    role="alert"
    aria-live="assertive"
  >
    <TriangleAlertIcon class="w-5 h-5 mt-0.5 shrink-0" />
    <div class="flex-1 min-w-0">
      <p class="font-semibold">{{ $t("Could not load data") }}</p>
      <p class="opacity-90 break-words">{{ locationStore.loadError }}</p>
    </div>
    <button
      type="button"
      :class="retryClass"
      :disabled="locationStore.isLoading"
      @click="locationStore.retryLoadData()"
    >
      {{ $t("Retry") }}
    </button>
    <button
      type="button"
      :class="dismissClass"
      :title="$t('Dismiss')"
      @click="locationStore.loadError = null"
    >
      <XIcon class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup>
import { TriangleAlertIcon, XIcon } from "lucide-vue-next";

import { useLocationStore } from "@/store/location";

const locationStore = useLocationStore();

const bannerClass = [
  "absolute top-2 left-1/2 -translate-x-1/2 z-20",
  "w-[calc(100%-1rem)] max-w-xl flex items-start gap-3",
  "rounded-lg border px-4 py-3 text-sm shadow-lg",
  "border-red-300 bg-red-50 text-red-900",
  "dark:border-red-700 dark:bg-red-950/95 dark:text-red-100",
].join(" ");

const retryClass = [
  "shrink-0 self-center rounded-md px-3 py-1.5 font-medium",
  "bg-red-600 text-white hover:bg-red-700",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "focus-visible:outline focus-visible:outline-2",
  "focus-visible:outline-offset-2",
].join(" ");

const dismissClass = [
  "shrink-0 self-start rounded p-0.5",
  "hover:bg-red-200/70 dark:hover:bg-red-800/70",
  "focus-visible:outline focus-visible:outline-2",
  "focus-visible:outline-offset-1",
].join(" ");
</script>
