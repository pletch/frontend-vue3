<template>
  <LPopup :options="options">
    <div class="inline-block relative -top-1 text-primary font-bold text-lg">
      {{ deviceName }}
    </div>
    <div class="flex mt-2">
      <img
        v-if="face"
        :src="faceImageDataURI"
        :alt="$t('Image of {deviceName}', { deviceName })"
        :title="$t('Image of {deviceName}', { deviceName })"
        class="self-start mr-5 w-16 h-16 rounded-md shadow-sm object-cover border border-gray-100"
      />
      <ul class="list-none p-0 m-0 space-y-3">
        <li :title="$t('Timestamp')" class="flex items-start space-x-3 text-sm text-gray-700">
          <ClockIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>
            {{ new Date(timestamp * 1000).toLocaleString(config.locale) }}
            <span v-if="isoLocal && timeZone" class="block text-[0.7rem] font-mono text-gray-500 mt-0.5">
              {{ isoLocal }}[{{ timeZone }}]
            </span>
          </span>
        </li>
        <li v-if="lastSeen" :title="$t('Last seen')" class="flex items-start space-x-3 text-sm text-gray-700">
          <SendIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>{{ lastSeen }}</span>
        </li>
        <li :title="$t('Location')" class="flex items-start space-x-3 text-sm text-gray-700">
          <MapPinIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>
            {{ lat }}
            <br />
            {{ lon }}
            <br />
            {{ humanReadableAltitude(alt, locationStore.units) }}
          </span>
        </li>
        <li v-if="address" :title="$t('Address')" class="flex items-start space-x-3 text-sm text-gray-700">
          <HomeIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>{{ address }}</span>
        </li>
        <li v-if="typeof battery === 'number'" :title="$t('Battery')" class="flex items-start space-x-3 text-sm text-gray-700">
          <BatteryChargingIcon v-if="batteryStatus === 2" class="w-4 h-4 flex-shrink-0 text-green-500 mt-0.5" aria-hidden="true" role="img" />
          <BatteryIcon v-else class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>{{ battery }} %</span>
        </li>
        <li v-if="typeof speed === 'number'" :title="$t('Speed')" class="flex items-start space-x-3 text-sm text-gray-700">
          <ZapIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>{{ humanReadableSpeed(speed, locationStore.units) }}</span>
        </li>
        <li v-if="activity" :title="$t('Activity')" class="flex items-start space-x-3 text-sm text-gray-700">
          <ActivityIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span class="capitalize">{{ activity }}</span>
        </li>
        <li v-if="wifi.ssid" :title="$t('WiFi')" class="flex items-start space-x-3 text-sm text-gray-700">
          <WifiIcon class="w-4 h-4 flex-shrink-0 text-primary mt-0.5" aria-hidden="true" role="img" />
          <span>
            {{ wifi.ssid }}
            <span v-if="wifi.bssid" class="text-xs text-gray-500">({{ wifi.bssid }})</span>
          </span>
        </li>
      </ul>
    </div>
    <div
      v-if="regions.length"
      class="border-t border-separator mt-4 pt-4 text-xs text-gray-500 italic"
    >
      {{ $t("Regions:") }}
      {{ regions.join(", ") }}
    </div>
  </LPopup>
</template>

<script setup>
import { computed } from "vue";
import {
  BatteryIcon,
  BatteryChargingIcon,
  ClockIcon,
  HomeIcon,
  MapPinIcon,
  SendIcon,
  WifiIcon,
  ZapIcon,
  ActivityIcon,
} from "lucide-vue-next";
import { LPopup } from "@vue-leaflet/vue-leaflet";
import { useLocationStore } from "@/store/location";
import config from "@/config";
import { humanReadableAltitude, humanReadableSpeed } from "@/util";

const locationStore = useLocationStore();

const props = defineProps({
  user: {
    type: String,
    default: "",
  },
  device: {
    type: String,
    default: "",
  },
  name: {
    type: String,
    default: "",
  },
  face: {
    type: String,
    default: null,
  },
  timestamp: {
    type: Number,
    default: 0,
  },
  createdAt: {
    // When the message was sent (vs. timestamp = when the GPS fix was taken).
    // Android sends epoch seconds; iOS omits it. Accept a string too.
    type: [Number, String],
    default: null,
  },
  isorcv: {
    // When the recorder received the message (ISO 8601). Device-independent
    // freshness signal — present for every device, unlike created_at.
    type: String,
    default: null,
  },
  isoLocal: {
    type: String,
    default: "",
  },
  timeZone: {
    type: String,
    default: "",
  },
  lat: {
    type: Number,
    default: 0,
  },
  lon: {
    type: Number,
    default: 0,
  },
  alt: {
    type: Number,
    default: 0,
  },
  address: {
    type: String,
    default: null,
  },
  battery: {
    type: Number,
    default: null,
  },
  batteryStatus: {
    type: Number,
    default: null,
  },
  speed: {
    type: Number,
    default: null,
  },
  activity: {
    type: String,
    default: null,
  },
  regions: {
    type: Array,
    default: () => [],
  },
  wifi: {
    type: Object,
    default: () => ({}),
  },
  options: {
    type: Object,
    default: () => ({}),
  },
});

/**
 * Return the face image as a data URI string which can be used for an
 * image's src attribute.
 */
const faceImageDataURI = computed(() => `data:image/png;base64,${props.face}`);

/**
 * Return the device name for displaying with <user identifier>/<device
 * identifier> as fallback.
 */
const deviceName = computed(() =>
  props.name ? props.name : `${props.user}/${props.device}`
);

/**
 * When the device was last heard from, formatted for the current locale.
 * Prefers the recorder receive time (isorcv) so it works for every device;
 * falls back to created_at (Android-only). Differs from the timestamp (GPS
 * fix time) when a device re-sends a stale fix, e.g. a stationary ping.
 * Returns null when neither is available.
 */
const lastSeen = computed(() => {
  let ms = NaN;
  if (props.isorcv) {
    ms = Date.parse(props.isorcv);
  } else if (props.createdAt !== null && props.createdAt !== "") {
    ms =
      typeof props.createdAt === "number" ||
      !Number.isNaN(Number(props.createdAt))
        ? Number(props.createdAt) * 1000
        : Date.parse(props.createdAt);
  }
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleString(config.locale);
});
</script>

<style lang="scss" scoped></style>
