import { createRouter, createWebHistory } from "vue-router";
import config from "@/config";
import Map from "@/views/Map.vue";

const router = createRouter({
  history: createWebHistory(config.router.basePath),
  routes: [
    {
      path: "/",
      name: "map",
      component: Map,
    },
  ],
});

export default router;
