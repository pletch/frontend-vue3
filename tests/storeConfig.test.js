import { describe, expect, test, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

/**
 * Load the store with a specific user configuration in place.
 *
 * `@/config` merges `window.owntracks.config` at module evaluation time, so
 * the modules have to be reset and re-imported for each configuration.
 *
 * @param {DeepPartial<Config>} config User configuration to apply
 * @returns A fresh location store
 */
async function storeWithConfig(config) {
  vi.resetModules();
  window.owntracks = { config };
  const { useLocationStore } = await import("@/store/location");
  setActivePinia(createPinia());
  const store = useLocationStore();
  store.setLocationHistory({});
  return store;
}

describe("configuration versus stored choices", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("units follow the config when nothing has been chosen", async () => {
    const store = await storeWithConfig({ units: "imperial" });

    expect(store.units).toBe("imperial");
    // Nothing written, so a later change to the configuration still applies.
    expect(localStorage.getItem("owntracks-units-choice")).toBe(null);

    const changed = await storeWithConfig({ units: "metric" });
    expect(changed.units).toBe("metric");
  });

  test("a chosen unit system wins over the configuration", async () => {
    const store = await storeWithConfig({ units: "metric" });
    store.setUnits("imperial");
    await nextTick();

    const reloaded = await storeWithConfig({ units: "metric" });
    expect(reloaded.units).toBe("imperial");
  });

  test("choosing automatic clears the choice", async () => {
    const store = await storeWithConfig({ units: "imperial" });
    store.setUnits("metric");
    await nextTick();
    expect(store.unitsChoice).toBe("metric");

    store.setUnits(null);
    await nextTick();

    expect(store.unitsChoice).toBe(null);
    expect(store.units).toBe("imperial");
    expect(localStorage.getItem("owntracks-units-choice")).toBe(null);
  });

  test("a value left by an older version is not a choice", async () => {
    // The old key was written from the configuration, never from the
    // interface, so it must not survive as a preference.
    localStorage.setItem("owntracks-units", "imperial");
    const store = await storeWithConfig({ units: "metric" });

    expect(store.units).toBe("metric");
    // And it is cleared rather than left to linger.
    expect(localStorage.getItem("owntracks-units")).toBe(null);
  });

  test("layers follow the config when nothing is toggled", async () => {
    const store = await storeWithConfig({ map: { layers: { points: true } } });

    expect(store.layers.points).toBe(true);
    expect(localStorage.getItem("owntracks-layers")).toBe(null);

    const changed = await storeWithConfig({
      map: { layers: { points: false } },
    });
    expect(changed.layers.points).toBe(false);
  });

  test("a toggled layer wins over the configuration", async () => {
    const store = await storeWithConfig({ map: { layers: { points: false } } });
    store.setMapLayerVisibility({ layer: "points", visibility: true });
    await nextTick();

    const reloaded = await storeWithConfig({
      map: { layers: { points: false } },
    });
    expect(reloaded.layers.points).toBe(true);
  });

  test("an older full snapshot keeps only real choices", async () => {
    // `line` was turned off by hand; the rest matches what was configured.
    localStorage.setItem(
      "owntracks-layers",
      JSON.stringify({
        last: true,
        line: false,
        points: false,
        heatmap: false,
        poi: true,
        hideStale: false,
      })
    );

    const store = await storeWithConfig({
      map: {
        layers: {
          last: true,
          line: true,
          points: false,
          heatmap: false,
          poi: true,
        },
      },
    });
    await nextTick();

    expect(store.layers.line).toBe(false);
    expect(
      JSON.parse(localStorage.getItem("owntracks-layers") ?? "null")
    ).toEqual({
      line: false,
    });

    // And the untouched ones follow the configuration again.
    const changed = await storeWithConfig({
      map: {
        layers: {
          last: true,
          line: true,
          points: true,
          heatmap: false,
          poi: true,
        },
      },
    });
    expect(changed.layers.points).toBe(true);
    expect(changed.layers.line).toBe(false);
  });

  test("a layer added later appears for an existing install", async () => {
    localStorage.setItem("owntracks-layers", JSON.stringify({ line: false }));
    const store = await storeWithConfig({
      map: {
        layers: {
          last: true,
          line: true,
          points: false,
          heatmap: true,
          poi: true,
        },
      },
    });

    expect(store.layers.heatmap).toBe(true);
    expect(store.layers.line).toBe(false);
  });
});

describe("mapGeoData configuration handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("drops points worse than filters.minAccuracy", async () => {
    const store = await storeWithConfig({ filters: { minAccuracy: 50 } });
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 1, lon: 1, acc: 10 },
          { _type: "location", tst: 2, lat: 2, lon: 2, acc: 500 },
          { _type: "location", tst: 3, lat: 3, lon: 3, acc: 20 },
        ],
      },
    });

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
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 1, lon: 1, acc: 10 },
          { _type: "location", tst: 2, lat: 2, lon: 2, acc: 9999 },
        ],
      },
    });

    expect(store.mapGeoData.count).toBe(2);
  });

  // `maxPointDistance` is in metres, matching `distanceBetweenCoordinates`.
  test("splits the line on a jump beyond map.maxPointDistance", async () => {
    const store = await storeWithConfig({ map: { maxPointDistance: 1000 } });
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 0, lon: 0 },
          { _type: "location", tst: 2, lat: 0.001, lon: 0 },
          // Roughly 1100 km away, far beyond the 1000 m threshold.
          { _type: "location", tst: 3, lat: 10, lon: 0 },
          { _type: "location", tst: 4, lat: 10.001, lon: 0 },
        ],
      },
    });

    const { segments } = store.mapGeoData;
    expect(segments).toHaveLength(2);
    expect(segments[0].coordinates).toHaveLength(2);
    expect(segments[1].coordinates).toHaveLength(2);
    // Every point still reaches the points layer, split or not.
    expect(store.mapGeoData.pointsByUser.get("alice")).toHaveLength(4);
  });

  test("does not split when maxPointDistance is null", async () => {
    const store = await storeWithConfig({ map: { maxPointDistance: null } });
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 0, lon: 0 },
          { _type: "location", tst: 2, lat: 10, lon: 0 },
        ],
      },
    });

    expect(store.mapGeoData.segments).toHaveLength(1);
    expect(store.mapGeoData.segments[0].coordinates).toHaveLength(2);
  });
});

describe("incremental derivation under a filtering configuration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /**
   * Compare segments and counts, which is what the split and filter logic
   * affects.
   *
   * @param {import("@/geo").MapGeoData} data `mapGeoData` value
   */
  function snapshot(data) {
    return {
      segments: data.segments.map((s) => s.coordinates.map((c) => [...c])),
      points: [...data.pointsByUser.entries()].map(([u, c]) => [u, c.length]),
      bounds: data.bounds,
      count: data.count,
    };
  }

  test("splitting incrementally matches splitting in a rebuild", async () => {
    const store = await storeWithConfig({ map: { maxPointDistance: 1000 } });

    // Three clusters separated by jumps far beyond the threshold.
    /** @type {{ lat: number, lon: number }[]} */
    const points = [];
    [0, 10, 20].forEach((base) => {
      for (let i = 0; i < 5; i++) {
        points.push({ lat: base + i * 0.001, lon: 0 });
      }
    });
    points.forEach((p, i) =>
      store.appendLocationToHistory({
        _type: "location",
        username: "alice",
        device: "phone",
        tst: 1000 + i * 30,
        ...p,
      })
    );

    const incremental = snapshot(store.mapGeoData);
    store.notifyHistoryChanged();

    expect(incremental).toEqual(snapshot(store.mapGeoData));
    expect(incremental.segments).toHaveLength(3);
    incremental.segments.forEach((s) => expect(s).toHaveLength(5));
  });

  test("accuracy filtering incrementally matches a rebuild", async () => {
    const store = await storeWithConfig({ filters: { minAccuracy: 50 } });

    for (let i = 0; i < 30; i++) {
      store.appendLocationToHistory({
        _type: "location",
        username: "alice",
        device: "phone",
        tst: 1000 + i * 30,
        lat: 51 + i * 0.001,
        lon: -0.1,
        // Every third point is too inaccurate to keep.
        acc: i % 3 === 0 ? 400 : 10,
      });
    }

    const incremental = snapshot(store.mapGeoData);
    store.notifyHistoryChanged();

    expect(incremental).toEqual(snapshot(store.mapGeoData));
    expect(incremental.count).toBe(20);
  });
});
