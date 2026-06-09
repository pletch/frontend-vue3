<template>
  <teleport to="body">
    <div
      v-if="locationStore.isLoading"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000]"
    >
      <div class="bg-white p-6 rounded-md shadow-xl max-w-[90%] w-[320px] border border-separator text-center">
        <LoaderIcon class="w-8 h-8 mx-auto mb-4 text-primary animate-spin" />
        <p class="mb-6 text-lg text-gray-800">{{ $t("Loading data, please wait...") }}</p>
        <button
          class="btn-primary"
          type="button"
          @click="cancelRequest"
        >
          {{ $t("Cancel") }}
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { useLocationStore } from "@/store/location";
import { LoaderIcon } from "lucide-vue-next";

const locationStore = useLocationStore();

const cancelRequest = () => {
  if (locationStore.requestAbortController) {
    locationStore.requestAbortController.abort();
  }
};
</script>
<style lang="scss" scoped></style>