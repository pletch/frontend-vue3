import { describe, expect, test, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

import { useLocationStore } from "@/store/location";

/**
 * Build a minimal location object.
 *
 * @param {Number} tst Timestamp
 * @param {Object} [extra] Additional properties
 * @returns {Object} Location
 */
function location(tst, extra = {}) {
  return {
    _type: "location",
    username: "alice",
    device: "phone",
    tst,
    lat: 1,
    lon: 2,
    acc: 10,
    ...extra,
  };
}

describe("appendLocationToHistory", () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.locationHistory = {};
  });

  test("creates the user and device entries when missing", () => {
    store.appendLocationToHistory(location(100));
    expect(store.locationHistory.alice.phone.map((l) => l.tst)).toEqual([100]);
  });

  test("appends a newer point to the end", () => {
    [100, 200, 300].forEach((tst) =>
      store.appendLocationToHistory(location(tst))
    );
    expect(store.locationHistory.alice.phone.map((l) => l.tst)).toEqual([
      100, 200, 300,
    ]);
  });

  test("inserts an out-of-order point in the right position", () => {
    [100, 300, 400].forEach((tst) =>
      store.appendLocationToHistory(location(tst))
    );
    store.appendLocationToHistory(location(200));
    expect(store.locationHistory.alice.phone.map((l) => l.tst)).toEqual([
      100, 200, 300, 400,
    ]);
  });

  test("inserts a point older than everything held at the front", () => {
    [200, 300].forEach((tst) => store.appendLocationToHistory(location(tst)));
    store.appendLocationToHistory(location(100));
    expect(store.locationHistory.alice.phone.map((l) => l.tst)).toEqual([
      100, 200, 300,
    ]);
  });

  test("replaces an existing point with the same timestamp", () => {
    [100, 200, 300].forEach((tst) =>
      store.appendLocationToHistory(location(tst))
    );
    store.appendLocationToHistory(location(200, { lat: 99 }));

    const history = store.locationHistory.alice.phone;
    expect(history.map((l) => l.tst)).toEqual([100, 200, 300]);
    expect(history.find((l) => l.tst === 200).lat).toBe(99);
  });

  test("replaces the device array so consumers see a new identity", () => {
    store.appendLocationToHistory(location(100));
    const before = store.locationHistory.alice.phone;
    store.appendLocationToHistory(location(200));
    expect(store.locationHistory.alice.phone).not.toBe(before);
  });

  test("keeps devices of the same user independent", () => {
    store.appendLocationToHistory(location(100));
    store.appendLocationToHistory(location(150, { device: "tablet" }));

    expect(store.locationHistory.alice.phone).toHaveLength(1);
    expect(store.locationHistory.alice.tablet).toHaveLength(1);
  });

  test("derived getters pick up an in-place append", () => {
    store.appendLocationToHistory(location(100));
    expect(store.filteredLocationHistoryLatLngs).toHaveLength(1);

    store.appendLocationToHistory(location(200));
    expect(store.filteredLocationHistoryLatLngs).toHaveLength(2);
  });

  test("selectedDeviceHistory follows the current selection", () => {
    store.appendLocationToHistory(location(100));
    expect(store.selectedDeviceHistory).toEqual([]);

    store.selectedUser = "alice";
    store.selectedDevice = "phone";
    expect(store.selectedDeviceHistory).toHaveLength(1);

    store.appendLocationToHistory(location(200));
    expect(store.selectedDeviceHistory).toHaveLength(2);
  });

  test("only a wholesale replacement bumps historyReloadVersion", () => {
    const initial = store.historyReloadVersion;
    store.appendLocationToHistory(location(100));
    expect(store.historyReloadVersion).toBe(initial);

    store.notifyHistoryChanged(true);
    expect(store.historyReloadVersion).toBe(initial + 1);
  });
});

describe("mapGeoData", () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.locationHistory = {};
  });

  test("is empty for an empty history", () => {
    expect(store.mapGeoData).toMatchObject({
      segments: [],
      pois: [],
      bounds: null,
      count: 0,
    });
  });

  test("builds one segment per device with [lng, lat] coordinates", () => {
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 10, lon: 20, acc: 5 },
          { tst: 2, lat: 11, lon: 21, acc: 5 },
        ],
      },
    };
    store.notifyHistoryChanged();

    const { segments } = store.mapGeoData;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ user: "alice", device: "phone" });
    expect(segments[0].coordinates).toEqual([
      [20, 10],
      [21, 11],
    ]);
  });

  test("drops a single-point segment from the line output", () => {
    store.locationHistory = {
      alice: { phone: [{ tst: 1, lat: 10, lon: 20, acc: 5 }] },
    };
    store.notifyHistoryChanged();

    expect(store.mapGeoData.segments).toHaveLength(0);
    // The point is still available for the points and heatmap layers.
    expect(store.mapGeoData.pointsByUser.get("alice")).toEqual([[20, 10]]);
    expect(store.mapGeoData.count).toBe(1);
  });

  test("groups points by user across devices", () => {
    store.locationHistory = {
      alice: {
        phone: [{ tst: 1, lat: 1, lon: 1 }],
        tablet: [{ tst: 2, lat: 2, lon: 2 }],
      },
      bob: { phone: [{ tst: 3, lat: 3, lon: 3 }] },
    };
    store.notifyHistoryChanged();

    const { pointsByUser } = store.mapGeoData;
    expect(pointsByUser.get("alice")).toHaveLength(2);
    expect(pointsByUser.get("bob")).toHaveLength(1);
  });

  test("computes bounds over every point", () => {
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 10, lon: -5 },
          { tst: 2, lat: -3, lon: 40 },
          { tst: 3, lat: 7, lon: 12 },
        ],
      },
    };
    store.notifyHistoryChanged();

    expect(store.mapGeoData.bounds).toEqual({
      minLat: -3,
      maxLat: 10,
      minLng: -5,
      maxLng: 40,
    });
  });

  test("collects points of interest with their coordinates", () => {
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 1, lon: 2 },
          { tst: 2, lat: 3, lon: 4, poi: "Home" },
        ],
      },
    };
    store.notifyHistoryChanged();

    expect(store.mapGeoData.pois).toEqual([
      { user: "alice", poi: "Home", coordinate: [4, 3] },
    ]);
  });

  test("shares coordinate arrays between segments and point layers", () => {
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 1, lon: 2 },
          { tst: 2, lat: 3, lon: 4 },
        ],
      },
    };
    store.notifyHistoryChanged();

    // The same coordinate objects back both outputs, rather than each layer
    // allocating its own copy.
    const { segments, pointsByUser } = store.mapGeoData;
    expect(segments[0].coordinates[0]).toBe(pointsByUser.get("alice")[0]);
  });

  test("picks up a live append", () => {
    store.locationHistory = {
      alice: {
        phone: [
          { tst: 1, lat: 1, lon: 2 },
          { tst: 2, lat: 3, lon: 4 },
        ],
      },
    };
    store.notifyHistoryChanged();
    expect(store.mapGeoData.count).toBe(2);

    store.appendLocationToHistory({
      username: "alice",
      device: "phone",
      tst: 3,
      lat: 5,
      lon: 6,
    });
    expect(store.mapGeoData.count).toBe(3);
    expect(store.mapGeoData.segments[0].coordinates).toHaveLength(3);
  });
});
