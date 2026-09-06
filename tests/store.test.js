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
