import { describe, expect, test } from "vitest";

import { unwrapLongitude } from "@/geo";

describe("unwrapLongitude", () => {
  test("the first point of a track is left alone", () => {
    expect(unwrapLongitude(179, null)).toBe(179);
    expect(unwrapLongitude(-179, null)).toBe(-179);
  });

  test("an ordinary step is left alone", () => {
    expect(unwrapLongitude(0.1, 0)).toBeCloseTo(0.1, 10);
    expect(unwrapLongitude(-120, -119.5)).toBeCloseTo(-120, 10);
  });

  test("crossing the antimeridian eastward continues past 180", () => {
    // Two degrees of travel, not 358 the other way.
    expect(unwrapLongitude(-179, 179)).toBe(181);
  });

  test("crossing westward continues past -180", () => {
    expect(unwrapLongitude(179, -179)).toBe(-181);
  });

  test("the shift carries across later points", () => {
    // 179 -> -179 -> -177: still heading east, now at 183.
    const first = unwrapLongitude(-179, 179);
    expect(unwrapLongitude(-177, first)).toBe(183);
  });

  test("crossing back returns to the original frame", () => {
    // Out across the seam and back again.
    const out = unwrapLongitude(-179, 179);
    expect(unwrapLongitude(179, out)).toBe(179);
  });

  test("a track already several turns out keeps its frame", () => {
    expect(unwrapLongitude(-160, 560)).toBe(560);
    expect(unwrapLongitude(10, 730)).toBe(730);
  });

  test("a jump of less than half the world is taken at face value", () => {
    // A teleport across Europe is not a seam crossing.
    expect(unwrapLongitude(-10, 100)).toBe(-10);
  });
});
