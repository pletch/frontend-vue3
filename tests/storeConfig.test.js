import { describe, expect, test, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

/**
 * Load the store with a specific user configuration in place.
 *
 * `@/config` merges `window.owntracks.config` at module evaluation time, so
 * the modules have to be reset and re-imported for each configuration.
 *
 * @param {Object} config User configuration to apply
 * @returns {Promise<Object>} A fresh location store
 */
async function storeWithConfig(config) {
  vi.resetModules();
  window.owntracks = { config };
  const { useLocationStore } = await import("@/store/location");
  setActivePinia(createPinia());
  const store = useLocationStore();
  store.locationHistory = {};
  return store;
}

describe("mapGeoData configuration handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("drops points worse than filters.minAccuracy", async () => {
    const store = await storeWithConfig({ filters: { minAccuracy: 50 } });
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 1, lon: 1, acc: 10 },
          { tst: 2, lat: 2, lon: 2, acc: 500 },
          { tst: 3, lat: 3, lon: 3, acc: 20 },
        ],
      },
    };
    store.notifyHistoryChanged();

    expect(store.mapGeoData.count).toBe(2);
    expect(store.mapGeoData.segments[0].coordinates).toEqual([
      [1, 1],
      [3, 3],
    ]);
    // The dropped point must not affect the bounds either.
    expect(store.mapGeoData.bounds).toEqual({
      minLat: 1,
      maxLat: 3,
      minLng: 1,
      maxLng: 3,
    });
  });

  test("keeps every point when minAccuracy is null", async () => {
    const store = await storeWithConfig({ filters: { minAccuracy: null } });
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 1, lon: 1, acc: 10 },
          { tst: 2, lat: 2, lon: 2, acc: 9999 },
        ],
      },
    };
    store.notifyHistoryChanged();

    expect(store.mapGeoData.count).toBe(2);
  });

  // `maxPointDistance` is in metres, matching `distanceBetweenCoordinates`.
  test("splits the line on a jump beyond map.maxPointDistance", async () => {
    const store = await storeWithConfig({ map: { maxPointDistance: 1000 } });
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 0, lon: 0 },
          { tst: 2, lat: 0.001, lon: 0 },
          // Roughly 1100 km away, far beyond the 1000 m threshold.
          { tst: 3, lat: 10, lon: 0 },
          { tst: 4, lat: 10.001, lon: 0 },
        ],
      },
    };
    store.notifyHistoryChanged();

    const { segments } = store.mapGeoData;
    expect(segments).toHaveLength(2);
    expect(segments[0].coordinates).toHaveLength(2);
    expect(segments[1].coordinates).toHaveLength(2);
    // Every point still reaches the points layer, split or not.
    expect(store.mapGeoData.pointsByUser.get("alice")).toHaveLength(4);
  });

  test("does not split when maxPointDistance is null", async () => {
    const store = await storeWithConfig({ map: { maxPointDistance: null } });
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 0, lon: 0 },
          { tst: 2, lat: 10, lon: 0 },
        ],
      },
    };
    store.notifyHistoryChanged();

    expect(store.mapGeoData.segments).toHaveLength(1);
    expect(store.mapGeoData.segments[0].coordinates).toHaveLength(2);
  });
});
