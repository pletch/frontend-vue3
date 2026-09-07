import { describe, expect, test, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

import { useLocationStore } from "@/store/location";

/**
 * Read the timestamps of a track back out, for comparison.
 *
 * @param {import("@/track").Track} track Track to read
 * @returns {(number | undefined)[]} Timestamps, oldest first
 */
function timestamps(track) {
  return [...Array(track.length)].map((_, i) => track.at(i)?.tst);
}

/**
 * Build a minimal location object.
 *
 * @param {number} tst Timestamp
 * @param {Partial<OTLocation>} [extra] Additional properties
 * @returns {OTLocation} Location
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
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.setLocationHistory({});
  });

  test("creates the user and device entries when missing", () => {
    store.appendLocationToHistory(location(100));
    expect(timestamps(store.locationHistory.alice.phone)).toEqual([100]);
  });

  test("appends a newer point to the end", () => {
    [100, 200, 300].forEach((tst) =>
      store.appendLocationToHistory(location(tst))
    );
    expect(timestamps(store.locationHistory.alice.phone)).toEqual([
      100, 200, 300,
    ]);
  });

  test("inserts an out-of-order point in the right position", () => {
    [100, 300, 400].forEach((tst) =>
      store.appendLocationToHistory(location(tst))
    );
    store.appendLocationToHistory(location(200));
    expect(timestamps(store.locationHistory.alice.phone)).toEqual([
      100, 200, 300, 400,
    ]);
  });

  test("inserts a point older than everything held at the front", () => {
    [200, 300].forEach((tst) => store.appendLocationToHistory(location(tst)));
    store.appendLocationToHistory(location(100));
    expect(timestamps(store.locationHistory.alice.phone)).toEqual([
      100, 200, 300,
    ]);
  });

  test("replaces an existing point with the same timestamp", () => {
    [100, 200, 300].forEach((tst) =>
      store.appendLocationToHistory(location(tst))
    );
    store.appendLocationToHistory(location(200, { lat: 99 }));

    const track = store.locationHistory.alice.phone;
    expect(timestamps(track)).toEqual([100, 200, 300]);
    expect(track.at(1)?.lat).toBe(99);
  });

  test("publishes a new derivation so consumers see the change", () => {
    store.appendLocationToHistory(location(100));
    const before = store.mapGeoData;

    store.appendLocationToHistory(location(200));

    // The track is mutated in place, so identity cannot signal a change; the
    // published derivation is replaced instead.
    expect(store.mapGeoData).not.toBe(before);
    expect(store.mapGeoData.count).toBe(2);
  });

  test("keeps devices of the same user independent", () => {
    store.appendLocationToHistory(location(100));
    store.appendLocationToHistory(location(150, { device: "tablet" }));

    expect(store.locationHistory.alice.phone).toHaveLength(1);
    expect(store.locationHistory.alice.tablet).toHaveLength(1);
  });

  test("derived getters pick up an in-place append", () => {
    store.appendLocationToHistory(location(100));
    expect(store.mapGeoData.count).toBe(1);

    store.appendLocationToHistory(location(200));
    expect(store.mapGeoData.count).toBe(2);
  });

  test("selectedDeviceHistory follows the current selection", () => {
    store.appendLocationToHistory(location(100));
    expect(store.selectedDeviceHistory).toMatchObject({
      track: null,
      length: 0,
    });

    store.selectedUsers = ["alice"];
    store.selectedDevice = "phone";
    expect(store.selectedDeviceHistory.length).toBe(1);

    store.appendLocationToHistory(location(200));
    expect(store.selectedDeviceHistory.length).toBe(2);
    expect(store.selectedDeviceHistory.track?.at(1)?.tst).toBe(200);
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
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.setLocationHistory({});
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
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 10, lon: 20, acc: 5 },
          { _type: "location", tst: 2, lat: 11, lon: 21, acc: 5 },
        ],
      },
    });

    const { segments } = store.mapGeoData;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ user: "alice", device: "phone" });
    expect(segments[0].coordinates).toEqual([
      [20, 10],
      [21, 11],
    ]);
  });

  test("drops a single-point segment from the line output", () => {
    store.setLocationHistory({
      alice: {
        phone: [{ _type: "location", tst: 1, lat: 10, lon: 20, acc: 5 }],
      },
    });

    expect(store.mapGeoData.segments).toHaveLength(0);
    // The point is still available for the points and heatmap layers.
    expect(store.mapGeoData.pointsByUser.get("alice")).toEqual([[20, 10]]);
    expect(store.mapGeoData.count).toBe(1);
  });

  test("groups points by user across devices", () => {
    store.setLocationHistory({
      alice: {
        phone: [{ _type: "location", tst: 1, lat: 1, lon: 1 }],
        tablet: [{ _type: "location", tst: 2, lat: 2, lon: 2 }],
      },
      bob: { phone: [{ _type: "location", tst: 3, lat: 3, lon: 3 }] },
    });

    const { pointsByUser } = store.mapGeoData;
    expect(pointsByUser.get("alice")).toHaveLength(2);
    expect(pointsByUser.get("bob")).toHaveLength(1);
  });

  test("computes bounds over every point", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 10, lon: -5 },
          { _type: "location", tst: 2, lat: -3, lon: 40 },
          { _type: "location", tst: 3, lat: 7, lon: 12 },
        ],
      },
    });

    expect(store.mapGeoData.bounds).toEqual({
      minLat: -3,
      maxLat: 10,
      minLng: -5,
      maxLng: 40,
    });
  });

  test("collects points of interest with their coordinates", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 1, lon: 2 },
          { _type: "location", tst: 2, lat: 3, lon: 4, poi: "Home" },
        ],
      },
    });

    expect(store.mapGeoData.pois).toEqual([
      { user: "alice", poi: "Home", coordinate: [4, 3] },
    ]);
  });

  test("shares coordinate arrays between segments and point layers", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 1, lon: 2 },
          { _type: "location", tst: 2, lat: 3, lon: 4 },
        ],
      },
    });

    // The same coordinate objects back both outputs, rather than each layer
    // allocating its own copy.
    const { segments, pointsByUser } = store.mapGeoData;
    expect(segments[0].coordinates[0]).toBe(pointsByUser.get("alice")?.[0]);
  });

  test("picks up a live append", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 1, lon: 2 },
          { _type: "location", tst: 2, lat: 3, lon: 4 },
        ],
      },
    });
    expect(store.mapGeoData.count).toBe(2);

    store.appendLocationToHistory({
      _type: "location",
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

describe("incremental derivation matches a full rebuild", () => {
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.setLocationHistory({});
  });

  /**
   * Snapshot the published derivation in a comparable form.
   *
   * @param {import("@/geo").MapGeoData} data `mapGeoData` value
   */
  function snapshot(data) {
    return {
      segments: data.segments.map((segment) => ({
        user: segment.user,
        device: segment.device,
        coordinates: segment.coordinates.map((c) => [...c]),
      })),
      pointsByUser: [...data.pointsByUser.entries()].map(([user, coords]) => [
        user,
        coords.map((c) => [...c]),
      ]),
      pois: data.pois.map((poi) => ({
        ...poi,
        coordinate: [...poi.coordinate],
      })),
      bounds: data.bounds,
      count: data.count,
    };
  }

  test("appending one at a time equals deriving the whole set at once", () => {
    const locations = [];
    for (let i = 0; i < 50; i++) {
      locations.push({
        _type: "location",
        username: "alice",
        device: "phone",
        tst: 1000 + i * 30,
        lat: 51 + i * 0.001,
        lon: -0.1 + i * 0.001,
        acc: 10,
        ...(i % 20 === 0 ? { poi: `POI ${i}` } : {}),
      });
    }

    locations.forEach((l) => store.appendLocationToHistory(l));
    const incremental = snapshot(store.mapGeoData);

    // Force the full-rebuild path over the identical history.
    store.notifyHistoryChanged();
    const rebuilt = snapshot(store.mapGeoData);

    expect(incremental).toEqual(rebuilt);
    expect(incremental.count).toBe(50);
  });

  test("agrees across several users and devices", () => {
    const users = ["alice", "bob"];
    const devices = ["phone", "tablet"];
    let tst = 1000;
    users.forEach((username, u) =>
      devices.forEach((device, d) => {
        for (let i = 0; i < 15; i++) {
          store.appendLocationToHistory({
            _type: "location",
            username,
            device,
            tst: (tst += 30),
            lat: 40 + u + d + i * 0.01,
            lon: 10 + u - d + i * 0.01,
            acc: 5,
          });
        }
      })
    );

    const incremental = snapshot(store.mapGeoData);
    store.notifyHistoryChanged();
    expect(incremental).toEqual(snapshot(store.mapGeoData));
  });

  test("agrees after an out-of-order point forces a rebuild", () => {
    [100, 200, 400].forEach((tst) =>
      store.appendLocationToHistory({
        _type: "location",
        username: "alice",
        device: "phone",
        tst,
        lat: 1 + tst / 1000,
        lon: 2 + tst / 1000,
      })
    );
    // Lands between existing points, so the tail of the derivation is invalid.
    store.appendLocationToHistory({
      _type: "location",
      username: "alice",
      device: "phone",
      tst: 300,
      lat: 1.3,
      lon: 2.3,
    });

    const afterInsert = snapshot(store.mapGeoData);
    store.notifyHistoryChanged();
    expect(afterInsert).toEqual(snapshot(store.mapGeoData));
    expect(afterInsert.segments[0].coordinates).toEqual([
      [2.1, 1.1],
      [2.2, 1.2],
      [2.3, 1.3],
      [2.4, 1.4],
    ]);
  });

  test("agrees after replacing a point at an existing timestamp", () => {
    [100, 200].forEach((tst) =>
      store.appendLocationToHistory({
        _type: "location",
        username: "alice",
        device: "phone",
        tst,
        lat: 1,
        lon: 2,
      })
    );
    store.appendLocationToHistory({
      _type: "location",
      username: "alice",
      device: "phone",
      tst: 200,
      lat: 9,
      lon: 9,
    });

    const afterReplace = snapshot(store.mapGeoData);
    store.notifyHistoryChanged();
    expect(afterReplace).toEqual(snapshot(store.mapGeoData));
    expect(afterReplace.count).toBe(2);
    expect(afterReplace.bounds?.maxLat).toBe(9);
  });
});

describe("setMinAccuracy", () => {
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.setLocationHistory({
      alice: {
        phone: [
          { _type: "location", tst: 1, lat: 0, lon: 0, acc: 5 },
          { _type: "location", tst: 2, lat: 0, lon: 0.001, acc: 80 },
          { _type: "location", tst: 3, lat: 0, lon: 0.002, acc: 5 },
        ],
      },
    });
  });

  test("no filter is applied by default", () => {
    expect(store.minAccuracy).toBe(null);
    expect(store.mapGeoData.count).toBe(3);
  });

  test("tightening the threshold re-derives without reloading", () => {
    store.setMinAccuracy(50);

    expect(store.minAccuracy).toBe(50);
    expect(store.mapGeoData.count).toBe(2);
    // The history itself is untouched; only the derivation changed.
    expect(store.locationHistory.alice.phone.length).toBe(3);
  });

  test("loosening it brings the points back", () => {
    store.setMinAccuracy(50);
    store.setMinAccuracy(100);

    expect(store.mapGeoData.count).toBe(3);
  });

  test("null and non-positive values mean no filter", () => {
    store.setMinAccuracy(50);
    store.setMinAccuracy(null);
    expect(store.minAccuracy).toBe(null);
    expect(store.mapGeoData.count).toBe(3);

    store.setMinAccuracy(50);
    store.setMinAccuracy(0);
    expect(store.minAccuracy).toBe(null);
    expect(store.mapGeoData.count).toBe(3);
  });

  test("a live append is filtered by the current threshold", () => {
    store.setMinAccuracy(50);
    store.appendLocationToHistory({
      _type: "location",
      username: "alice",
      device: "phone",
      tst: 4,
      lat: 0,
      lon: 0.003,
      acc: 90,
    });

    expect(store.locationHistory.alice.phone.length).toBe(4);
    expect(store.mapGeoData.count).toBe(2);
  });

  test("an unchosen threshold still follows the configuration", () => {
    // Nothing is written until the control is used, so a later change to
    // `filters.minAccuracy` is not silently overridden by a stale choice.
    expect(localStorage.getItem("owntracks-min-accuracy")).toBe(null);
  });

  test("choosing off is remembered as a choice, not as no choice", async () => {
    store.setMinAccuracy(50);
    store.setMinAccuracy(null);
    // The persisted copy is written by a watcher, so it lands next tick.
    await nextTick();

    expect(store.minAccuracy).toBe(null);
    expect(localStorage.getItem("owntracks-min-accuracy")).toBe("off");
  });

  test("a persisted threshold comes back as a number", async () => {
    store.setMinAccuracy(50);
    await nextTick();
    expect(localStorage.getItem("owntracks-min-accuracy")).toBe("50");

    // A fresh store reading the same storage.
    setActivePinia(createPinia());
    const reloaded = useLocationStore();
    expect(reloaded.minAccuracy).toBe(50);
    expect(typeof reloaded.minAccuracy).toBe("number");
  });

  test("setting the same value again does no work", () => {
    store.setMinAccuracy(50);
    const derived = store.mapGeoData;
    store.setMinAccuracy(50);

    // Same object: the derivation was not rebuilt and republished.
    expect(store.mapGeoData).toBe(derived);
  });
});

describe("antimeridian", () => {
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useLocationStore();
  });

  test("a track crossing the seam is unwrapped, not wrapped round", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          location(1, { lat: -16.5, lon: 178.5 }),
          location(2, { lat: -16.5, lon: 179.5 }),
          location(3, { lat: -16.5, lon: -179.5 }),
          location(4, { lat: -16.5, lon: -178.5 }),
        ],
      },
    });

    const [segment] = store.mapGeoData.segments;
    const longitudes = segment.coordinates.map(([lng]) => lng);

    expect(longitudes).toEqual([178.5, 179.5, 180.5, 181.5]);
    // Every step is a degree; none is the 359 that wrapping would produce.
    const steps = longitudes
      .slice(1)
      .map((lng, i) => Math.abs(lng - longitudes[i]));
    expect(Math.max(...steps)).toBeCloseTo(1, 10);
  });

  test("the bounds follow the unwrapped track", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          location(1, { lat: 0, lon: 179 }),
          location(2, { lat: 0, lon: -179 }),
        ],
      },
    });

    // Not -179..179, which would say the track spans the whole planet.
    expect(store.mapGeoData.bounds).toMatchObject({
      minLng: 179,
      maxLng: 181,
    });
  });

  test("a live point appended after a crossing stays in the same frame", () => {
    store.setLocationHistory({
      alice: {
        phone: [
          location(1, { lat: 0, lon: 179 }),
          location(2, { lat: 0, lon: -179 }),
        ],
      },
    });
    store.appendLocationToHistory(
      location(3, { lat: 0, lon: -178, username: "alice", device: "phone" })
    );

    const [segment] = store.mapGeoData.segments;
    expect(segment.coordinates.map(([lng]) => lng)).toEqual([179, 181, 182]);
  });
});

describe("multi-user selection", () => {
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
    store.setLocationHistory({});
    store.users = ["alice", "bob", "carol"];
    store.devices = {
      alice: ["phone"],
      bob: ["phone", "tablet"],
      carol: ["watch"],
    };
    store.lastLocations = [
      {
        _type: "location",
        username: "alice",
        device: "phone",
        tst: 1,
        lat: 1,
        lon: 1,
      },
      {
        _type: "location",
        username: "bob",
        device: "phone",
        tst: 2,
        lat: 2,
        lon: 2,
      },
      {
        _type: "location",
        username: "carol",
        device: "watch",
        tst: 3,
        lat: 3,
        lon: 3,
      },
    ];
  });

  test("an empty selection means every user is shown", () => {
    expect(store.selectedUsers).toEqual([]);
    expect(store.isUserSelected("alice")).toBe(true);
    expect(store.filteredLastLocations).toHaveLength(3);
  });

  test("selecting a subset narrows the last locations", () => {
    store.selectedUsers = ["alice", "carol"];

    expect(store.isUserSelected("bob")).toBe(false);
    expect(store.filteredLastLocations.map((l) => l.username)).toEqual([
      "alice",
      "carol",
    ]);
  });

  test("the stale filter excludes users whose every fix is old", () => {
    const now = 1700000000000;
    vi.setSystemTime(now);
    const fresh = now / 1000 - 60;
    const old = now / 1000 - 5 * 24 * 60 * 60;
    store.lastLocations = [
      {
        _type: "location",
        username: "alice",
        device: "phone",
        tst: fresh,
        lat: 1,
        lon: 1,
      },
      // Two devices, only one of them recent: alice stays listed.
      {
        _type: "location",
        username: "alice",
        device: "tablet",
        tst: old,
        lat: 1,
        lon: 1,
      },
      {
        _type: "location",
        username: "bob",
        device: "phone",
        tst: old,
        lat: 2,
        lon: 2,
      },
      {
        _type: "location",
        username: "carol",
        device: "watch",
        tst: fresh,
        lat: 3,
        lon: 3,
      },
    ];

    expect([...store.staleFilteredUsers]).toEqual([]);

    store.setMapLayerVisibility({ layer: "hideStale", visibility: true });
    expect([...store.staleFilteredUsers]).toEqual(["bob"]);

    // An explicit selection overrides the filter, so nothing is excluded.
    store.selectedUsers = ["alice", "bob"];
    expect([...store.staleFilteredUsers]).toEqual([]);
  });

  test("staleness is measured from the end of the displayed window", () => {
    const now = new Date("2026-09-06T12:00:00");
    vi.setSystemTime(now);
    // Both fixes are months old in wall-clock terms.
    const inWindow = new Date("2026-06-10T12:00:00").getTime() / 1000;
    const beforeWindow = new Date("2026-06-05T12:00:00").getTime() / 1000;
    store.lastLocations = [
      {
        _type: "location",
        username: "alice",
        device: "phone",
        tst: inWindow,
        lat: 1,
        lon: 1,
      },
      {
        _type: "location",
        username: "bob",
        device: "phone",
        tst: beforeWindow,
        lat: 2,
        lon: 2,
      },
    ];
    store.setMapLayerVisibility({ layer: "hideStale", visibility: true });

    // Against the wall clock everything would be stale.
    store.endDateTime = "2026-06-11T00:00:00";
    expect([...store.staleFilteredUsers]).toEqual(["bob"]);

    // Moving the window back leaves alice's fix behind it too.
    store.endDateTime = "2026-06-20T00:00:00";
    expect([...store.staleFilteredUsers].sort()).toEqual(["alice", "bob"]);
  });

  test("an end date in the future does not loosen the filter", () => {
    const now = new Date("2026-09-06T12:00:00");
    vi.setSystemTime(now);
    store.lastLocations = [
      {
        _type: "location",
        username: "alice",
        device: "phone",
        tst: new Date("2026-09-01T12:00:00").getTime() / 1000,
        lat: 1,
        lon: 1,
      },
    ];
    store.setMapLayerVisibility({ layer: "hideStale", visibility: true });
    store.endDateTime = "2026-12-01T00:00:00";

    expect([...store.staleFilteredUsers]).toEqual(["alice"]);
  });

  test("selectedUser is only set when exactly one user is selected", () => {
    expect(store.selectedUser).toBe(null);

    store.selectedUsers = ["bob"];
    expect(store.selectedUser).toBe("bob");

    store.selectedUsers = ["bob", "carol"];
    expect(store.selectedUser).toBe(null);
  });

  test("toggling adds and removes without disturbing the rest", async () => {
    await store.setSelectedUsers(["alice", "bob"]);

    await store.toggleSelectedUser("carol", true);
    expect([...store.selectedUsers].sort()).toEqual(["alice", "bob", "carol"]);

    await store.toggleSelectedUser("alice", false);
    expect([...store.selectedUsers].sort()).toEqual(["bob", "carol"]);
  });

  test("toggling a user off twice is harmless", async () => {
    await store.setSelectedUsers(["alice"]);
    await store.toggleSelectedUser("alice", false);
    await store.toggleSelectedUser("alice", false);
    expect(store.selectedUsers).toEqual([]);
  });

  test("duplicates are collapsed", async () => {
    await store.setSelectedUsers(["alice", "alice", "bob"]);
    expect(store.selectedUsers).toEqual(["alice", "bob"]);
  });

  test("changing the user selection clears the device", async () => {
    await store.setSelectedUsers(["bob"]);
    store.selectedDevice = "tablet";

    await store.setSelectedUsers(["bob", "carol"]);
    expect(store.selectedDevice).toBe(null);
  });

  test("keeps the device when the same single user is reselected", async () => {
    await store.setSelectedUsers(["bob"]);
    store.selectedDevice = "tablet";

    await store.setSelectedUsers(["bob"]);
    expect(store.selectedDevice).toBe("tablet");
  });

  test("setSelectedUser(null) shows everyone", async () => {
    await store.setSelectedUsers(["alice"]);
    await store.setSelectedUser(null);
    expect(store.selectedUsers).toEqual([]);
  });

  test("reads a multi-user selection from the URL", () => {
    store.populateStateFromQuery({ users: "alice,carol" });
    expect(store.selectedUsers).toEqual(["alice", "carol"]);
  });

  test("still reads the older single-user URL parameter", () => {
    store.populateStateFromQuery({ user: "bob" });
    expect(store.selectedUsers).toEqual(["bob"]);
  });

  test("gives each user a distinct, order-independent colour", () => {
    const colors = store.users.map((user) => store.userColor(user));
    expect(new Set(colors).size).toBe(colors.length);

    // The colour must not depend on the order users arrive in.
    const before = store.userColor("carol");
    store.users = ["carol", "bob", "alice"];
    expect(store.userColor("carol")).toBe(before);
  });
});

describe("populateStateFromQuery", () => {
  /** @type {ReturnType<typeof useLocationStore>} */
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useLocationStore();
  });

  test("applies a date range from the URL", () => {
    store.populateStateFromQuery({
      start: "2020-01-01T00:00:00",
      end: "2020-01-08T00:00:00",
    });

    expect(store.startDateTime).toBe("2020-01-01T00:00:00");
    expect(store.endDateTime).toBe("2020-01-08T00:00:00");
  });

  test("pauses real-time updates for a range that has already ended", () => {
    expect(store.realTimeUpdatesEnabled).toBe(true);

    store.populateStateFromQuery({
      start: "2020-01-01T00:00:00",
      end: "2020-01-08T00:00:00",
    });

    // Otherwise the ticker would drag the end date to the present, quietly
    // widening a range that was shared as a fixed window.
    expect(store.realTimeUpdatesEnabled).toBe(false);
  });

  test("leaves real-time updates on for a range ending in the future", () => {
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 19);
    store.populateStateFromQuery({ start: "2020-01-01T00:00:00", end: future });

    expect(store.realTimeUpdatesEnabled).toBe(true);
  });

  test("parses both map coordinates from the URL", () => {
    store.populateStateFromQuery({ lat: "51.4778", lng: "-0.0106" });

    // Each branch used to assign its own value through unparsed and parse
    // only the other one, leaving a string in the map state.
    expect(store.map.center.lat).toBe(51.4778);
    expect(store.map.center.lng).toBe(-0.0106);
    expect(typeof store.map.center.lat).toBe("number");
    expect(typeof store.map.center.lng).toBe("number");
  });

  test("applies a latitude given without a longitude", () => {
    const before = store.map.center.lng;
    store.populateStateFromQuery({ lat: "12.5" });

    expect(store.map.center.lat).toBe(12.5);
    expect(store.map.center.lng).toBe(before);
  });

  test("ignores non-numeric coordinates", () => {
    store.populateStateFromQuery({ lat: "51.4778", lng: "-0.0106" });
    store.populateStateFromQuery({ lat: "nonsense", lng: "nonsense" });

    expect(store.map.center.lat).toBe(51.4778);
    expect(store.map.center.lng).toBe(-0.0106);
  });

  test("parses the zoom level", () => {
    store.populateStateFromQuery({ zoom: "14" });
    expect(store.map.zoom).toBe(14);
  });

  test("ignores an invalid date range", () => {
    const before = store.startDateTime;
    store.populateStateFromQuery({ start: "not-a-date" });
    expect(store.startDateTime).toBe(before);
  });
});
