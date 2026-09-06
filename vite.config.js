import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import version from "vite-plugin-package-version";

// https://vitejs.dev/config/
export default defineConfig({
  base: "",
  plugins: [
    vue(),
    VueI18nPlugin({
      include: fileURLToPath(new URL("./src/locales/**", import.meta.url)),
    }),
    version(),
  ],
  server: { proxy: { "/api": { target: "https://owntracks.pletch.org", changeOrigin: true }, "/ws": { target: "wss://owntracks.pletch.org", ws: true, changeOrigin: true } } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Framework and date handling change far less often than the app
        // itself, so keeping them out of the entry chunk means a redeploy
        // does not invalidate them in the browser cache. MapLibre splits
        // itself out by virtue of being imported dynamically.
        manualChunks: {
          vendor: ["vue", "vue-router", "pinia", "vue-i18n", "@vueuse/core"],
          datetime: ["moment", "vue-datepicker-next"],
        },
      },
    },
  },
});
