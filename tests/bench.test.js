import { describe, expect, test, beforeEach } from "vitest";

import * as bench from "@/bench";
import {
  createRandom,
  generateDeviceHistory,
  generateLocationHistory,
  lastLocationsFromHistory,
} from "@/bench/dataset";
import { getLocationHistoryCount } from "@/util";

describe("bench harness", () => {
  beforeEach(() => {
    bench.reset();
    bench.setEnabled(false);
  });

  test("records nothing while disabled", () => {
    bench.record("disabled", 5, 1);
    bench.mark("disabled-mark");
    expect(bench.measure("disabled-mark")).toBe(0);
    expect(bench.results()).toEqual([]);
  });

  test("aggregates repeated samples into one series", () => {
    bench.setEnabled(true);
    bench.record("series", 10, 100);
    bench.record("series", 20, 100);

    const [row] = bench.results();
    expect(row.name).toBe("series");
    expect(row.calls).toBe(2);
    expect(row.total).toBe(30);
    expect(row.mean).toBe(15);
    expect(row.min).toBe(10);
    expect(row.max).toBe(20);
    expect(row.items).toBe(200);
    expect(row.usPerItem).toBe(150);
  });

  test("sorts results by total time descending", () => {
    bench.setEnabled(true);
    bench.record("fast", 1);
    bench.record("slow", 100);
    expect(bench.results().map((row) => row.name)).toEqual(["slow", "fast"]);
  });

  test("time() returns the wrapped value whether enabled or not", () => {
    expect(bench.time("off", () => 42)).toBe(42);
    bench.setEnabled(true);
    expect(bench.time("on", () => 42)).toBe(42);
    expect(bench.results()).toHaveLength(1);
  });

  test("measure() ignores an unopened mark", () => {
    bench.setEnabled(true);
    expect(bench.measure("never-marked")).toBe(0);
    expect(bench.results()).toEqual([]);
  });

  test("approximateSize() handles cycles", () => {
    const object = { name: "a" };
    object.self = object;
    expect(bench.approximateSize(object)).toBeGreaterThan(0);
  });
});

describe("bench dataset", () => {
  test("createRandom is deterministic for a given seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const c = createRandom(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    first.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });

  test("generateDeviceHistory produces the requested shape", () => {
    const locations = generateDeviceHistory({
      user: "alice",
      device: "phone",
      count: 100,
      seed: 1,
      endTst: 1000000,
      intervalSeconds: 30,
    });

    expect(locations).toHaveLength(100);
    locations.forEach((location) => {
      expect(location._type).toBe("location");
      expect(location.username).toBe("alice");
      expect(location.device).toBe("phone");
      expect(location.lat).toBeGreaterThanOrEqual(-90);
      expect(location.lat).toBeLessThanOrEqual(90);
      expect(location.lon).toBeGreaterThanOrEqual(-180);
      expect(location.lon).toBeLessThanOrEqual(180);
      expect(Number.isFinite(location.alt)).toBe(true);
      expect(location.acc).toBeGreaterThan(0);
    });
  });

  test("generateDeviceHistory is sorted oldest first", () => {
    const locations = generateDeviceHistory({
      user: "alice",
      device: "phone",
      count: 50,
      seed: 7,
    });
    for (let i = 1; i < locations.length; i++) {
      expect(locations[i].tst).toBeGreaterThan(locations[i - 1].tst);
    }
  });

  test("generateDeviceHistory is reproducible for a given seed", () => {
    const options = { user: "a", device: "d", count: 20, seed: 5, endTst: 0 };
    expect(generateDeviceHistory(options)).toEqual(
      generateDeviceHistory(options)
    );
  });

  test("generateLocationHistory splits points across users and devices", () => {
    const history = generateLocationHistory({
      points: 1000,
      users: 2,
      devicesPerUser: 2,
      seed: 3,
    });

    expect(Object.keys(history)).toEqual(["user1", "user2"]);
    expect(Object.keys(history.user1)).toEqual(["device1", "device2"]);
    expect(getLocationHistoryCount(history)).toBe(1000);
  });

  test("generateLocationHistory gives each device distinct data", () => {
    const history = generateLocationHistory({
      points: 200,
      users: 2,
      devicesPerUser: 1,
    });
    expect(history.user1.device1[0].lat).not.toBe(history.user2.device1[0].lat);
  });

  test("lastLocationsFromHistory returns the newest point per device", () => {
    const history = generateLocationHistory({
      points: 100,
      users: 2,
      devicesPerUser: 1,
    });
    const lastLocations = lastLocationsFromHistory(history);

    expect(lastLocations).toHaveLength(2);
    lastLocations.forEach((location) => {
      const deviceHistory = history[location.username][location.device];
      expect(location.tst).toBe(deviceHistory[deviceHistory.length - 1].tst);
    });
  });
});
