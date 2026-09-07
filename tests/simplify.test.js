import { describe, expect, test } from "vitest";

import { simplifyPath, decimatePoints, toleranceForZoom } from "@/simplify";

describe("toleranceForZoom", () => {
  test("halves with each zoom level", () => {
    expect(toleranceForZoom(10) / toleranceForZoom(11)).toBeCloseTo(2, 10);
  });

  test("scales linearly with the pixel budget", () => {
    expect(toleranceForZoom(12, 4)).toBeCloseTo(
      toleranceForZoom(12, 1) * 4,
      12
    );
  });

  test("is a whole world width at zoom 0 across one tile", () => {
    expect(toleranceForZoom(0, 512)).toBeCloseTo(360, 10);
  });
});

describe("simplifyPath", () => {
  test("returns short paths untouched", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [
      [0, 0],
      [1, 1],
    ];
    expect(simplifyPath(path, 0.5)).toBe(path);
  });

  test("returns the input when the tolerance is zero", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [
      [0, 0],
      [0.001, 0],
      [1, 0],
    ];
    expect(simplifyPath(path, 0)).toBe(path);
  });

  test("always keeps the first and last point", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [];
    for (let i = 0; i < 100; i++) {
      path.push([i * 0.0001, 0]);
    }
    const simplified = simplifyPath(path, 1);

    expect(simplified[0]).toEqual(path[0]);
    expect(simplified[simplified.length - 1]).toEqual(path[path.length - 1]);
  });

  test("collapses a straight line to its endpoints", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [];
    for (let i = 0; i <= 50; i++) {
      path.push([i * 0.01, 0]);
    }
    expect(simplifyPath(path, 0.001)).toEqual([
      [0, 0],
      [0.5, 0],
    ]);
  });

  test("keeps a corner that exceeds the tolerance", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [
      [0, 0],
      [0.5, 0.5],
      [1, 0],
    ];
    const simplified = simplifyPath(path, 0.01);
    expect(simplified).toHaveLength(3);
    expect(simplified[1]).toEqual([0.5, 0.5]);
  });

  test("drops a deviation smaller than the tolerance", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [
      [0, 0],
      [0.5, 0.000001],
      [1, 0],
    ];
    expect(simplifyPath(path, 0.01)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  test("reduces more as the tolerance grows", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [];
    for (let i = 0; i < 500; i++) {
      path.push([i * 0.001, Math.sin(i / 5) * 0.01]);
    }
    const fine = simplifyPath(path, 0.0001);
    const coarse = simplifyPath(path, 0.01);

    expect(fine.length).toBeLessThan(path.length);
    expect(coarse.length).toBeLessThan(fine.length);
  });

  test("never returns more points than it was given", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [];
    for (let i = 0; i < 1000; i++) {
      path.push([Math.random(), Math.random()]);
    }
    expect(simplifyPath(path, 0.05).length).toBeLessThanOrEqual(path.length);
  });

  test("preserves input order", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [];
    for (let i = 0; i < 200; i++) {
      path.push([i * 0.01, Math.sin(i / 10)]);
    }
    const simplified = simplifyPath(path, 0.05);
    for (let i = 1; i < simplified.length; i++) {
      expect(simplified[i][0]).toBeGreaterThan(simplified[i - 1][0]);
    }
  });

  test("handles a long path without overflowing the stack", () => {
    // A recursive implementation dies here; this is the case sampling exists
    // for in the first place.
    /** @type {import("@/geo").Coordinate[]} */
    const path = [];
    for (let i = 0; i < 200000; i++) {
      path.push([i * 0.00001, Math.sin(i / 1000) * 0.5]);
    }
    expect(() => simplifyPath(path, 0.0001)).not.toThrow();
    expect(simplifyPath(path, 0.0001).length).toBeLessThan(path.length);
  });
});

describe("decimatePoints", () => {
  test("returns the input when disabled", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const points = [
      [0, 0],
      [0, 0],
    ];
    expect(decimatePoints(points, 0)).toBe(points);
  });

  test("keeps one point per occupied cell", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const points = [
      [0.1, 0.1],
      [0.2, 0.2],
      [1.1, 1.1],
    ];
    // A cell size of 1 puts the first two in the same cell.
    expect(decimatePoints(points, 1)).toEqual([
      [0.1, 0.1],
      [1.1, 1.1],
    ]);
  });

  test("keeps the first point seen in a cell", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const points = [
      [0.1, 0.1],
      [0.9, 0.9],
    ];
    expect(decimatePoints(points, 1)).toEqual([[0.1, 0.1]]);
  });

  test("keeps everything when cells are smaller than the spacing", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const points = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(decimatePoints(points, 0.5)).toHaveLength(3);
  });

  test("handles negative coordinates", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const points = [
      [-1.1, -1.1],
      [-1.2, -1.2],
      [-5, -5],
    ];
    expect(decimatePoints(points, 1)).toHaveLength(2);
  });

  test("returns an empty array unchanged", () => {
    expect(decimatePoints([], 1)).toEqual([]);
  });
});
