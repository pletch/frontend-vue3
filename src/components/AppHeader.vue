<template>
  <header
    class="flex items-center justify-between px-4 h-[50px] bg-primary text-white shadow-sm sticky top-0 z-50"
  >
    <div v-if="isSmallScreen" class="flex items-center px-2">
      <button
        class="touch-target p-2 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white text-white"
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
        <CrosshairIcon
          v-if="isSmallScreen"
          class="w-5 h-5"
          aria-hidden="true"
          role="img"
        />
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
            :class="userOptionClass"
          >
            <input
              type="checkbox"
              class="mr-3 cursor-pointer accent-primary"
              :checked="locationStore.layers[option.layer]"
              @change="
                locationStore.setMapLayerVisibility({
                  layer: option.layer,
                  visibility: ($event.target as HTMLInputElement).checked,
                })
              "
            />
            {{ $t(option.label) }}
          </label>
          <div class="border-t border-gray-200 mt-1 pt-2 px-4 pb-1">
            <label
              :for="unitsSelectId"
              class="flex items-center justify-between gap-3 text-sm text-gray-800"
            >
              <span class="whitespace-nowrap">{{ $t("units.label") }}</span>
              <select
                :id="unitsSelectId"
                :value="locationStore.unitsChoice ?? ''"
                class="rounded border border-gray-300 bg-white px-1 py-0.5 text-sm cursor-pointer"
                @change="
                  onUnitsChange(($event.target as HTMLSelectElement).value)
                "
              >
                <option
                  v-for="option in unitsOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
          <div class="border-t border-gray-200 mt-1 pt-2 px-4 pb-2">
            <label
              :for="accuracyInputId"
              class="flex items-baseline justify-between gap-3 text-sm text-gray-800"
            >
              <span class="whitespace-nowrap">{{ $t("filters.accuracy") }}</span>
              <span class="tabular-nums text-gray-500 whitespace-nowrap">
                {{ accuracyLabel }}
              </span>
            </label>
            <input
              :id="accuracyInputId"
              v-model.number="accuracyIndex"
              type="range"
              min="0"
              :max="ACCURACY_STOPS.length - 1"
              step="1"
              class="w-full mt-1 accent-primary cursor-pointer"
              :title="$t('filters.accuracyHint')"
            />
            <p class="mt-1 text-xs text-gray-500 leading-snug">
              {{ $t("filters.accuracyHint") }}
            </p>
          </div>
        </DropdownButton>
      </div>
      <div
        :class="[
          'flex items-center space-x-1',
          isSmallScreen ? 'w-full px-0' : 'px-2',
        ]"
      >
        <!-- The picker's own input carries a calendar icon, so on small
             screens this one only takes width from the date range. -->
        <CalendarIcon
          v-if="!isSmallScreen"
          class="w-5 h-5 mr-1 shrink-0"
          aria-hidden="true"
          role="img"
        />
        <button
          :class="[
            'touch-target hover:bg-white/20 rounded-full transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
            isSmallScreen ? 'p-0' : 'p-1',
          ]"
          type="button"
          :title="$t('Shift backward')"
          @click="shiftDateRange(-1)"
        >
          <ChevronLeftIcon class="w-4 h-4" />
        </button>
        <DatePicker
          :class="isSmallScreen ? 'flex-1 min-w-0' : ''"
          v-model:value="dateTimeRange"
          type="datetime"
          :format="$t('date_time_format')"
          :editable="true"
          :clearable="false"
          confirm
          :show-second="false"
          range
          :range-separator="$t('range_separator')"
          :shortcuts="shortcuts"
          :show-time-panel="showTimeRangePanel"
          @show-time-panel-change="showTimeRangePanel = $event"
          :disabled-date="(date: Date) => date > new Date()"
          @open="showTimeRangePanel = false"
        >
          <template #footer>
            <button
              class="mx-btn w-full py-1 text-xs font-semibold text-primary hover:bg-gray-50 border-t border-separator transition-colors"
              type="button"
              @click.stop.prevent="showTimeRangePanel = !showTimeRangePanel"
            >
              {{ showTimeRangePanel ? $t("Select date") : $t("Select time") }}
            </button>
          </template>
        </DatePicker>
        <button
          :class="[
            'touch-target hover:bg-white/20 rounded-full transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            isSmallScreen ? 'p-0' : 'p-1',
          ]"
          type="button"
          :disabled="!canShiftForward"
          :title="$t('Shift forward')"
          @click="shiftDateRange(1)"
        >
          <ChevronRightIcon class="w-4 h-4" />
        </button>
      </div>
      <div class="flex items-center px-1">
        <button
          class="touch-target p-1.5 border border-white hover:bg-white/20 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white text-white"
          type="button"
          :title="
            locationStore.realTimeUpdatesEnabled
              ? $t('Pause real-time updates')
              : $t('Resume real-time updates')
          "
          @click="
            locationStore.realTimeUpdatesEnabled =
              !locationStore.realTimeUpdatesEnabled
          "
        >
          <PauseIcon
            v-if="locationStore.realTimeUpdatesEnabled"
            class="w-4 h-4"
            aria-hidden="true"
            role="img"
          />
          <PlayIcon v-else class="w-4 h-4" aria-hidden="true" role="img" />
        </button>
      </div>
      <div class="flex items-center space-x-2 px-2">
        <UserIcon class="w-5 h-5" aria-hidden="true" role="img" />
        <DropdownButton :label="userSelectionLabel" :title="$t('Select users')">
          <label :class="[userOptionClass, 'border-b border-separator']">
            <input
              type="checkbox"
              class="mr-3 cursor-pointer accent-primary"
              :checked="locationStore.selectedUsers.length === 0"
              @change="locationStore.setSelectedUsers([])"
            />
            {{ $t("Show all") }}
          </label>
          <label
            v-for="user in locationStore.users"
            :key="user"
            class="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors whitespace-nowrap text-sm text-gray-800"
          >
            <input
              type="checkbox"
              class="mr-3 cursor-pointer accent-primary"
              :checked="locationStore.selectedUsers.includes(user)"
              @change="
                locationStore.toggleSelectedUser(
                  user,
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
            <span
              class="mr-2 inline-block w-3 h-3 rounded-full shrink-0"
              :style="{ backgroundColor: locationStore.userColor(user) }"
              aria-hidden="true"
            ></span>
            {{ user }}
          </label>
        </DropdownButton>
      </div>
      <div
        v-if="locationStore.selectedUser"
        class="flex items-center space-x-2 px-2"
      >
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
          {{
            humanReadableDistance(
              locationStore.distanceTravelled,
              locationStore.units
            )
          }}
        </span>
        <br />
        <span :title="$t('Elevation gain / loss')">
          <ArrowUpIcon class="w-4 h-4 inline mt-[3px]" role="img" />
          {{
            humanReadableDistance(
              locationStore.elevationGain,
              locationStore.units
            )
          }}
          {{ $t("/") }}
          <ArrowDownIcon class="w-4 h-4 inline mt-[3px]" role="img" />
          {{
            humanReadableDistance(
              locationStore.elevationLoss,
              locationStore.units
            )
          }}
        </span>
      </div>
      <div class="flex items-center px-1">
        <button
          class="touch-target p-2 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white text-white"
          type="button"
          :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          @click="toggleDark()"
        >
          <MoonIcon
            v-if="!isDark"
            class="w-5 h-5"
            aria-hidden="true"
            role="img"
          />
          <SunIcon v-else class="w-5 h-5" aria-hidden="true" role="img" />
        </button>
      </div>
      <div class="flex items-center px-2">
        <button
          class="touch-target p-2 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white text-white"
          type="button"
          :title="$t('Information')"
          @click="locationStore.isInformationModalVisible = true"
        >
          <InfoIcon
            class="w-5 h-5"
            :aria-label="$t('Information')"
            role="img"
          />
        </button>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useLocationStore } from "@/store/location";
import type { LayerName } from "@/store/location";
import { useWindowSize, useDark, useToggle } from "@vueuse/core";
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
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SmartphoneIcon,
  SunIcon,
  UserIcon,
} from "lucide-vue-next";
import DatePicker from "vue-datepicker-next";
import "vue-datepicker-next/index.css";
import DropdownButton from "@/components/DropdownButton.vue";
import { humanReadableDistance, getUnitSystem } from "@/util";
import moment from "moment";

const locationStore = useLocationStore();
const { t } = useI18n();
const { width } = useWindowSize();

const isDark = useDark();
const toggleDark = useToggle(isDark);

const layerSettingsOptions: { layer: LayerName; label: string }[] = [
  { layer: "last", label: "layers.last" },
  { layer: "line", label: "layers.line" },
  { layer: "points", label: "layers.points" },
  { layer: "heatmap", label: "layers.heatmap" },
  { layer: "poi", label: "layers.poi" },
  { layer: "hideStale", label: "Hide stale users (> 2 days)" },
];

const showMobileNav = computed({
  get: () => locationStore.isMobileNavOpen,
  set: (value) => (locationStore.isMobileNavOpen = value),
});
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
    text: t("24 hours"),
    onClick() {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
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

// Accuracy thresholds worth offering, strictest first, so the slider reads
// left to right as "keep less" to "keep everything". Metres, because that is
// what the recorder reports; only the label is converted.
const ACCURACY_STOPS: (number | null)[] = [10, 25, 50, 100, 200, 500, null];

const unitsSelectId = "units-system";

/**
 * Apply a units selection. The empty value is "automatic", meaning no choice
 * at all rather than a third unit system.
 *
 * @param value Selected option value
 */
const onUnitsChange = (value: string) => {
  locationStore.setUnits(
    value === "metric" || value === "imperial" ? value : null
  );
};

// "Automatic" is the absence of a choice: the unit system then comes from
// `config.units`, or from the locale when that is unset too. Naming what it
// resolves to saves the reader guessing.
const unitsOptions = computed(() => [
  {
    value: "",
    label: t("units.automatic", {
      system: t(`units.${getUnitSystem(config.units)}`),
    }),
  },
  { value: "metric", label: t("units.metric") },
  { value: "imperial", label: t("units.imperial") },
]);

const accuracyInputId = "accuracy-filter";

/**
 * The slider position for the active threshold.
 *
 * A configured value that is not one of the stops snaps to the nearest stop
 * that keeps at least as much data, so the handle always has somewhere to
 * sit. The label reads the real value rather than the stop, so the two never
 * disagree about what is actually being filtered.
 */
const accuracyIndex = computed({
  get(): number {
    const current = locationStore.minAccuracy;
    if (current === null) return ACCURACY_STOPS.length - 1;
    const index = ACCURACY_STOPS.findIndex(
      (stop) => stop !== null && stop >= current
    );
    return index === -1 ? ACCURACY_STOPS.length - 1 : index;
  },
  set(index: number) {
    locationStore.setMinAccuracy(ACCURACY_STOPS[index] ?? null);
  },
});

const accuracyLabel = computed(() => {
  const current = locationStore.minAccuracy;
  if (current === null) return t("filters.accuracyOff");
  return `\u2264 ${humanReadableDistance(current, locationStore.units)}`;
});

const userOptionClass = [
  "flex items-center px-4 py-2 cursor-pointer transition-colors",
  "hover:bg-gray-50 whitespace-nowrap text-sm text-gray-800",
].join(" ");

const userSelectionLabel = computed(() => {
  const selected = locationStore.selectedUsers;
  if (selected.length === 0) {
    return t("All users");
  }
  if (selected.length === 1) {
    return selected[0];
  }
  return t("{count} users", { count: selected.length });
});

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
      locationStore.setStartDateTime(
        moment(start).utc().format("YYYY-MM-DDTHH:mm:ss")
      );
      locationStore.setEndDateTime(newEnd.format("YYYY-MM-DDTHH:mm:ss"));
    }
  },
});

/**
 * Step the shown range backwards or forwards by its own length.
 *
 * Stepping by the whole interval gives contiguous, non-overlapping windows, so
 * repeatedly pressing the arrow walks through history a day (or week, or
 * month) at a time without revisiting what was just shown.
 *
 * @param {Number} direction -1 for backwards, 1 for forwards
 */
// Stepping forward past the present would only ever show an empty window.
const canShiftForward = computed(() =>
  moment.utc(locationStore.endDateTime).isBefore(moment.utc())
);

const shiftDateRange = (direction: number) => {
  if (direction > 0 && !canShiftForward.value) {
    return;
  }
  const start = moment.utc(locationStore.startDateTime);
  const end = moment.utc(locationStore.endDateTime);
  const shiftMs = end.diff(start) * direction;

  const newStart = start.clone().add(shiftMs, "milliseconds");
  const newEnd = end.clone().add(shiftMs, "milliseconds");

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
