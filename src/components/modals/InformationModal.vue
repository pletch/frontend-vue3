<template>
  <teleport to="body">
    <div
      v-if="locationStore.isInformationModalVisible"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000]"
      @click.self="close"
    >
      <div class="bg-white p-6 rounded-md shadow-xl max-w-[90%] w-[400px] border border-separator">
        <ul class="list-none p-0 m-0 space-y-4 mb-6">
          <li class="flex items-center space-x-3">
            <GithubIcon class="w-5 h-5 text-primary" aria-hidden="true" role="img" />
            <div class="flex items-baseline space-x-1">
              <a
                href="https://github.com/owntracks/frontend"
                target="_blank"
                rel="noopener"
                class="font-bold text-gray-800 hover:underline"
                >owntracks/frontend</a
              >
              <span class="text-xs text-gray-500">({{ locationStore.frontendVersion }})</span>
            </div>
          </li>
          <li class="flex items-center space-x-3">
            <GithubIcon class="w-5 h-5 text-primary" aria-hidden="true" role="img" />
            <div class="flex items-baseline space-x-1">
              <a
                href="https://github.com/owntracks/recorder"
                target="_blank"
                rel="noopener"
                class="font-bold text-gray-800 hover:underline"
                >owntracks/recorder</a
              >
              <span class="text-xs text-gray-500">({{ locationStore.recorderVersion || $t("Loading version...") }})</span>
            </div>
          </li>
          <li class="flex items-center space-x-3">
            <GlobeIcon class="w-5 h-5 text-primary" aria-hidden="true" role="img" />
            <a href="https://owntracks.org" target="_blank" rel="noopener" class="font-bold text-gray-800 hover:underline">
              {{ $t("OwnTracks website") }}
            </a>
          </li>
          <li class="flex items-center space-x-3">
            <BookIcon class="w-5 h-5 text-primary" aria-hidden="true" role="img" />
            <a
              href="https://owntracks.org/booklet/"
              target="_blank"
              rel="noopener"
              class="font-bold text-gray-800 hover:underline"
            >
              {{ $t("OwnTracks documentation") }}
            </a>
          </li>
          <li class="flex items-center space-x-3">
            <AtSignIcon class="w-5 h-5 text-primary" aria-hidden="true" role="img" />
            <a
              href="https://fosstodon.org/@owntracks"
              target="_blank"
              rel="noopener"
              class="font-bold text-gray-800 hover:underline"
            >
              {{ $t("OwnTracks on Mastodon") }}
            </a>
          </li>
        </ul>
        <div class="flex justify-end">
          <button
            class="btn-primary"
            type="button"
            @click="close"
          >
            {{ $t("Close") }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { useLocationStore } from "@/store/location";
import { AtSignIcon, BookIcon, GithubIcon, GlobeIcon } from "lucide-vue-next";

const locationStore = useLocationStore();

const close = () => {
  locationStore.isInformationModalVisible = false;
};
</script>

<style lang="scss" scoped></style>
