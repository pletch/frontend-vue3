<template>
  <header class="flex items-center justify-between px-4 h-[50px] bg-primary text-white shadow-sm sticky top-0 z-50">
    <div v-if="isSmallScreen" class="flex items-center px-2">
      <button
        class="p-2 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white text-white"
        type="button"
        @click="showMobileNav = !showMobileNav"
      >
        <MenuIcon class="w-5 h-5" aria-hidden="true" role="img" />
      </button>
    </div>
    <nav
      v-if="!isSmallScreen || showMobileNav"
      :class="[
        isSmallScreen
          ? 'absolute top-[50px] left-0 w-full flex flex-col bg-primary text-white p-4 border-b border-separator shadow-md z-40 space-y-4'
          : 'flex flex-grow items-center space-x-4 ml-4',
      ]"
    >
      <div class="flex items-center space-x-2 px-2">
        <CrosshairIcon v-if="isSmallScreen" class="w-5 h-5" aria-hidden="true" role="img" />
        <button
          class="btn-primary py-1.5 px-3 text-sm border border-white"
          type="button"
          :title="
            $t('Automatically center the map view and zoom in to relevant data')
          "
          @click="fitView"
        >
          {{ $t("Fit view") }}
        </button>
      </div>
      <div class="flex items-center space-x-2 px-2">
        <LayersIcon class="w-5 h-5" aria-hidden="true" role="img" />
        <DropdownButton
          :label="$t('Display settings')"
          :title="$t('Show/hide layers')"
        >
          <label
            v-for="option in layerSettingsOptions"
            :key="option.layer"
            class="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors whitespace-nowrap text-sm text-gray-800"
          >
            <input
              type="checkbox"
              class="mr-3 cursor-pointer accent-primary"
              :checked="locationStore.layers[option.layer]"
              @change="
                locationStore.setMapLayerVisibility({
                  layer: option.layer,
                  visibility: $event.target.checked,
                })
              "
            />
            {{ $t(option.label) }}
          </label>
        </DropdownButton>
      </div>
      <div class="flex items-center space-x-1 px-2">
        <CalendarIcon class="w-5 h-5 mr-1" aria-hidden="true" role="img" />
        <button
          class="p-1 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white"
          type="button"
          :title="$t('Shift backward')"
          @click="shiftDateRange(-1)"
        >
          <ChevronLeftIcon class="w-4 h-4" />
        </button>
        <DatePicker
          v-model:value="dateTimeRange"
          type="datetime"
          :format="$t('date_time_format')"
          :editable="false"
          :clearable="false"
          confirm
          :show-second="false"
          range
          :range-separator="$t('range_separator')"
          :shortcuts="shortcuts"
          :show-time-panel="showTimeRangePanel"
          :disabled-date="(date) => date > new Date()"
          @change="showTimeRangePanel = false"
        >
          <template #footer>
            <button
              class="mx-btn w-full py-1 text-xs font-semibold text-primary hover:bg-gray-50 border-t border-separator transition-colors"
              type="button"
              @click="showTimeRangePanel = !showTimeRangePanel"
            >
              {{ showTimeRangePanel ? $t("Select date") : $t("Select time") }}
            </button>
          </template>
        </DatePicker>
        <button
          class="p-1 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white"
          type="button"
          :title="$t('Shift forward')"
          @click="shiftDateRange(1)"
        >
          <ChevronRightIcon class="w-4 h-4" />
        </button>
      </div>
      <div class="flex items-center px-1">
        <button
          class="p-1.5 border border-white hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white text-white"
          type="button"
          :title="locationStore.realTimeUpdatesEnabled ? $t('Pause real-time updates') : $t('Resume real-time updates')"
          @click="locationStore.realTimeUpdatesEnabled = !locationStore.realTimeUpdatesEnabled"
        >
          <PauseIcon v-if="locationStore.realTimeUpdatesEnabled" class="w-4 h-4" aria-hidden="true" role="img" />
          <PlayIcon v-else class="w-4 h-4" aria-hidden="true" role="img" />
        </button>
      </div>
      <div class="flex items-center space-x-2 px-2">
        <UserIcon class="w-5 h-5" aria-hidden="true" role="img" />
        <select
          v-model="selectedUser"
          class="form-select"
          :title="$t('Select user')"
        >
          <option :value="null">{{ $t("Show all") }}</option>
          <option v-for="user in locationStore.users" :key="user" :value="user">
            {{ user }}
          </option>
        </select>
      </div>
      <div v-if="locationStore.selectedUser" class="flex items-center space-x-2 px-2">
        <SmartphoneIcon class="w-5 h-5" aria-hidden="true" role="img" />
        <select
          v-model="selectedDevice"
          class="form-select"
          :title="$t('Select device')"
        >
          <option :value="null">{{ $t("Show all") }}</option>
          <option
            v-for="device in locationStore.devices[locationStore.selectedUser]"
            :key="`${locationStore.selectedUser}-${device}`"
            :value="device"
          >
            {{ device }}
          </option>
        </select>
      </div>
    </nav>
    <nav class="flex items-center space-x-4 px-2">
      <div
        v-if="config.showDistanceTravelled && locationStore.distanceTravelled"
        class="text-right text-xs leading-tight"
      >
        <span :title="$t('Distance travelled')">
          {{ humanReadableDistance(locationStore.distanceTravelled, locationStore.units) }}
        </span>
        <br />
        <span :title="$t('Elevation gain / loss')">
          <ArrowUpIcon class="w-4 h-4 inline mt-[3px]" role="img" />
          {{ humanReadableDistance(locationStore.elevationGain, locationStore.units) }}
          {{ $t("/") }}
          <ArrowDownIcon class="w-4 h-4 inline mt-[3px]" role="img" />
          {{ humanReadableDistance(locationStore.elevationLoss, locationStore.units) }}
        </span>
      </div>
      <div class="flex items-center px-2">
        <button
          class="p-2 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white text-white"
          type="button"
          :title="$t('Information')"
          @click="locationStore.isInformationModalVisible = true"
        >
          <InfoIcon class="w-5 h-5" :aria-label="$t('Information')" role="img" />
        </button>
      </div>
    </nav>
  </header>
</template>

<script setup>
import { ref, computed } from "vue";
import { useLocationStore } from "@/store/location";
import { useWindowSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import config from "@/config";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CrosshairIcon,
  InfoIcon,
  LayersIcon,
  MenuIcon,
  PauseIcon,
  PlayIcon,
  SmartphoneIcon,
  UserIcon,
} from "lucide-vue-next";
import DatePicker from "vue-datepicker-next";
import "vue-datepicker-next/index.css";
import DropdownButton from "@/components/DropdownButton.vue";
import { humanReadableDistance } from "@/util";
import moment from "moment";

const locationStore = useLocationStore();
const { t } = useI18n();
const { width } = useWindowSize();

const layerSettingsOptions = [
  { layer: "last", label: "layers.last" },
  { layer: "line", label: "layers.line" },
  { layer: "points", label: "layers.points" },
  { layer: "heatmap", label: "layers.heatmap" },
  { layer: "poi", label: "layers.poi" },
  { layer: "hideStale", label: "Hide stale markers (> 2 days)" },
];

const showMobileNav = ref(false);
const showTimeRangePanel = ref(false);

const shortcuts = computed(() => [
  {
    text: t("Today"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("Yesterday"),
    onClick() {
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 0);
      const start = new Date(end);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("4 hours"),
    onClick() {
      const end = new Date();
      const start = new Date(end.getTime() - 4 * 60 * 60 * 1000);
      return [start, end];
    },
  },
  {
    text: t("8 hours"),
    onClick() {
      const end = new Date();
      const start = new Date(end.getTime() - 8 * 60 * 60 * 1000);
      return [start, end];
    },
  },
  {
    text: t("12 hours"),
    onClick() {
      const end = new Date();
      const start = new Date(end.getTime() - 12 * 60 * 60 * 1000);
      return [start, end];
    },
  },
  {
    text: t("3 days"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setDate(end.getDate() - 3);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("7 days"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setDate(end.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("15 days"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setDate(end.getDate() - 15);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("30 days"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setDate(end.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("3 months"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setMonth(end.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("6 months"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setMonth(end.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
  {
    text: t("1 year"),
    onClick() {
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      const start = new Date();
      start.setFullYear(end.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    },
  },
]);

const isSmallScreen = computed(() => width.value < 1300);

const selectedUser = computed({
  get: () => locationStore.selectedUser,
  set: (val) => locationStore.setSelectedUser(val),
});

const selectedDevice = computed({
  get: () => locationStore.selectedDevice,
  set: (val) => locationStore.setSelectedDevice(val),
});

const dateTimeRange = computed({
  get: () => [
    moment.utc(locationStore.startDateTime).local().toDate(),
    moment.utc(locationStore.endDateTime).local().toDate(),
  ],
  set: ([start, end]) => {
    if (start && end) {
      const newEnd = moment(end).set("seconds", 59).utc();
      if (newEnd.isBefore(moment.utc())) {
        locationStore.realTimeUpdatesEnabled = false;
      }
      locationStore.setStartDateTime(moment(start).utc().format("YYYY-MM-DDTHH:mm:ss"));
      locationStore.setEndDateTime(newEnd.format("YYYY-MM-DDTHH:mm:ss"));
    }
  },
});

const shiftDateRange = (direction) => {
  const start = moment.utc(locationStore.startDateTime);
  const end = moment.utc(locationStore.endDateTime);
  const diffMs = end.diff(start);
  const shiftMs = Math.floor((diffMs / 2) * direction);
  
  const newStart = start.clone().add(shiftMs, 'milliseconds');
  const newEnd = end.clone().add(shiftMs, 'milliseconds');

  if (newEnd.isBefore(moment.utc())) {
    locationStore.realTimeUpdatesEnabled = false;
  }
  
  locationStore.startDateTime = newStart.format("YYYY-MM-DDTHH:mm:ss");
  locationStore.endDateTime = newEnd.format("YYYY-MM-DDTHH:mm:ss");
  locationStore.reloadData();
};

const fitView = () => {
  locationStore.triggerFitView();
};
</script>

<style lang="scss" scoped>
</style>
