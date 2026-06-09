import { createI18n } from "vue-i18n";
import messages from "@intlify/unplugin-vue-i18n/messages";

import config from "@/config";

export default createI18n({
  legacy: false,
  globalInjection: true,
  locale: config.locale,
  fallbackLocale: "en-US",
  messages,
});
