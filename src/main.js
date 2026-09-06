import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "@/App.vue";
import config from "@/config";
import { log } from "@/logging";
import i18n from "@/i18n";
import router from "@/router";
import * as bench from "@/bench";
import "@/styles/tailwind.css";

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
