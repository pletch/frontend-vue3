import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "@/App.vue";
import config from "@/config";
import { log } from "@/logging";
import i18n from "@/i18n";
import router from "@/router";
import * as bench from "@/bench";
import "@/styles/tailwind.css";

// MapLibre is by far the largest dependency and is loaded as its own chunk so
// it does not block the first paint. Starting the fetch here means it
// downloads alongside the shell rather than only once the map mounts, which
// would cost an extra round trip. Nothing awaits it; `Map.vue` does.
import("maplibre-gl");

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);

app.config.globalProperties.$config = config;

// The router resolves its initial navigation asynchronously. Mounting before
// that completes leaves `route.query` empty when `App.vue` reads it, so every
// parameter in a shared URL was silently discarded and replaced by defaults.
router.isReady().then(() => {
  app.mount("#app");

  // The benchmark runner is only pulled in when explicitly enabled (`?bench`
  // in the URL or `bench: true` in the config), keeping it out of the default
  // bundle.
  if (bench.isEnabled()) {
    import("@/bench/run").then((run) => run.install());
  }
});
