<template>
  <div ref="dropdownRef" class="relative inline-block text-left">
    <button type="button" class="btn-outline" :title="title" @click="toggle">
      {{ label }}
    </button>
    <div
      v-if="active"
      class="absolute left-0 mt-2 min-w-[220px] rounded-md shadow-lg bg-white border border-separator ring-1 ring-black ring-opacity-5 z-[100] py-1 overflow-hidden focus:outline-none"
    >
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { onClickOutside } from "@vueuse/core";

defineProps({
  label: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: "",
  },
});

const dropdownRef = ref(null);
const active = ref(false);

const toggle = () => {
  active.value = !active.value;
};

const hide = () => {
  active.value = false;
};

onClickOutside(dropdownRef, hide);
</script>
