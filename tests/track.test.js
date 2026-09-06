import { describe, expect, test } from "vitest";

import { Track, tracksFromHistory } from "@/track";

const loc = (tst, extra = {}) => ({
  tst,
  lat: 51 + tst / 10000,
  lon: -0.1 + tst / 10000,
  acc: 10,
  alt: 30,
  vel: 5,
  ...extra,
});

describe("Track", () => {
  test("starts empty", () => {
    const track = new Track("alice", "phone");
    expect(track.length).toBe(0);
    expect(track.lastTst()).toBe(-Infinity);
    expect(track.at(0)).toBe(null);
  });

  test("stores and reads back a location", () => {
    const track = new Track("alice", "phone");
    track.push(loc(100, { motionactivities: ["walking"], poi: "Home" }));

    expect(track.length).toBe(1);
    expect(track.at(0)).toMatchObject({
      username: "alice",
      device: "phone",
      tst: 100,
      acc: 10,
      alt: 30,
      vel: 5,
      motionactivities: ["walking"],
      poi: "Home",
    });
  });

  test("keeps latitude and longitude exact", () => {
    const track = new Track();
    track.push({ tst: 1, lat: 51.4778912345, lon: -0.0106779876 });

    // Coordinates must survive a round trip without drifting; a 32-bit float
    // would lose roughly a metre here.
    expect(track.at(0).lat).toBe(51.4778912345);
    expect(track.at(0).lon).toBe(-0.0106779876);
  });

  test("keeps timestamps exact beyond 2038", () => {
    const track = new Track();
    const tst = 2 ** 31 + 86400; // Past the 32-bit signed limit.
    track.push({ tst, lat: 1, lon: 2 });
    expect(track.at(0).tst).toBe(tst);
  });

  test("distinguishes a missing field from a zero", () => {
    const track = new Track();
    track.push({ tst: 1, lat: 1, lon: 2, vel: 0 });
    track.push({ tst: 2, lat: 1, lon: 2 });

    expect(track.at(0).vel).toBe(0);
    expect(track.at(1)).not.toHaveProperty("vel");
    expect(track.at(1)).not.toHaveProperty("acc");
  });

  test("grows past its initial capacity", () => {
    const track = new Track();
    for (let i = 0; i < 5000; i++) {
      track.push(loc(i));
    }
    expect(track.length).toBe(5000);
    expect(track.at(0).tst).toBe(0);
    expect(track.at(4999).tst).toBe(4999);
    expect(track.lastTst()).toBe(4999);
  });

  test("interns repeated motion activities", () => {
    const track = new Track();
    for (let i = 0; i < 100; i++) {
      track.push(loc(i, { motionactivities: ["walking", "running"] }));
    }
    expect(track.at(50).motionactivities).toEqual(["walking", "running"]);
    // One slot per location, not one array per location.
    expect(track.activity.BYTES_PER_ELEMENT).toBe(2);
  });

  test("keeps points of interest sparse", () => {
    const track = new Track();
    for (let i = 0; i < 100; i++) {
      track.push(loc(i, i === 42 ? { poi: "Office" } : {}));
    }
    expect(track.poi.size).toBe(1);
    expect(track.at(42).poi).toBe("Office");
    expect(track.at(41)).not.toHaveProperty("poi");
  });

  test("finds the insertion point for a timestamp", () => {
    const track = Track.from("a", "d", [loc(10), loc(20), loc(30)]);
    expect(track.indexFor(5)).toBe(0);
    expect(track.indexFor(20)).toBe(1);
    expect(track.indexFor(25)).toBe(2);
    expect(track.indexFor(99)).toBe(3);
  });

  test("inserts out of order, shifting later entries", () => {
    const track = Track.from("a", "d", [loc(10), loc(30)]);
    track.insert(1, loc(20));

    expect(track.length).toBe(3);
    expect([0, 1, 2].map((i) => track.at(i).tst)).toEqual([10, 20, 30]);
  });

  test("moves points of interest when inserting before them", () => {
    const track = Track.from("a", "d", [loc(10), loc(30, { poi: "Shop" })]);
    track.insert(1, loc(20));

    expect(track.at(2).poi).toBe("Shop");
    expect(track.at(1)).not.toHaveProperty("poi");
  });

  test("insert past the end appends", () => {
    const track = Track.from("a", "d", [loc(10)]);
    track.insert(5, loc(20));
    expect(track.length).toBe(2);
    expect(track.at(1).tst).toBe(20);
  });

  test("set() overwrites in place, including clearing a POI", () => {
    const track = Track.from("a", "d", [loc(10, { poi: "Old" })]);
    track.set(0, loc(10, { vel: 42 }));

    expect(track.at(0).vel).toBe(42);
    expect(track.at(0)).not.toHaveProperty("poi");
  });

  test("from() populates in order", () => {
    const track = Track.from("bob", "watch", [loc(1), loc(2), loc(3)]);
    expect(track.length).toBe(3);
    expect(track.user).toBe("bob");
    expect(track.device).toBe("watch");
    expect([0, 1, 2].map((i) => track.at(i).tst)).toEqual([1, 2, 3]);
  });
});

describe("tracksFromHistory", () => {
  test("converts a nested history structure", () => {
    const tracks = tracksFromHistory({
      alice: { phone: [loc(1), loc(2)], tablet: [loc(3)] },
      bob: { watch: [] },
    });

    expect(tracks.alice.phone).toBeInstanceOf(Track);
    expect(tracks.alice.phone.length).toBe(2);
    expect(tracks.alice.tablet.length).toBe(1);
    expect(tracks.bob.watch.length).toBe(0);
    expect(tracks.alice.phone.user).toBe("alice");
    expect(tracks.alice.tablet.device).toBe("tablet");
  });

  test("handles an empty or missing history", () => {
    expect(tracksFromHistory({})).toEqual({});
    expect(tracksFromHistory(null)).toEqual({});
  });
});
