import { describe, expect, test } from "vitest";

import { padBounds, containsBounds, cullPath, cullPoints } from "@/cull";

const box = { minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 };

describe("padBounds", () => {
  test("grows by a fraction of the size on every side", () => {
    expect(padBounds(box, 0.5)).toEqual({
      minLng: -5,
      minLat: -5,
      maxLng: 15,
      maxLat: 15,
    });
  });

  test("a zero fraction leaves the bounds alone", () => {
    expect(padBounds(box, 0)).toEqual(box);
  });
});

describe("containsBounds", () => {
  test("true when the inner bounds lie entirely inside", () => {
    expect(
      containsBounds(box, { minLng: 1, minLat: 1, maxLng: 9, maxLat: 9 })
    ).toBe(true);
  });

  test("touching edges still counts as contained", () => {
    expect(containsBounds(box, box)).toBe(true);
  });

  test("false when any side pokes out", () => {
    expect(
      containsBounds(box, { minLng: 1, minLat: 1, maxLng: 11, maxLat: 9 })
    ).toBe(false);
    expect(
      containsBounds(box, { minLng: -1, minLat: 1, maxLng: 9, maxLat: 9 })
    ).toBe(false);
  });
});

describe("cullPath", () => {
  test("a path entirely inside is returned unchanged, by reference", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const path = [
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const runs = cullPath(path, box);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toBe(path);
  });

  test("a path entirely outside yields nothing", () => {
    expect(
      cullPath(
        [
          [20, 20],
          [21, 21],
          [22, 22],
        ],
        box
      )
    ).toEqual([]);
  });

  test("the vertex either side of the visible run is kept", () => {
    // Only [5, 5] is inside, but the neighbours are needed for the line to
    // enter and leave at the right angle.
    const runs = cullPath(
      [
        [-30, -30],
        [-5, -5],
        [5, 5],
        [15, 15],
        [40, 40],
      ],
      box
    );

    expect(runs).toEqual([
      [
        [-5, -5],
        [5, 5],
        [15, 15],
      ],
    ]);
  });

  test("a track that leaves and returns is split into separate runs", () => {
    const runs = cullPath(
      [
        [1, 1],
        [2, 2],
        [50, 50],
        [51, 51],
        [52, 2],
        [3, 3],
        [4, 4],
      ],
      box
    );

    expect(runs).toEqual([
      [
        [1, 1],
        [2, 2],
        [50, 50],
      ],
      [
        [52, 2],
        [3, 3],
        [4, 4],
      ],
    ]);
  });

  test("an edge crossing the viewport with both ends outside is kept", () => {
    // Neither endpoint is inside, but the line passes straight through.
    expect(
      cullPath(
        [
          [-10, 5],
          [20, 5],
        ],
        box
      )
    ).toEqual([
      [
        [-10, 5],
        [20, 5],
      ],
    ]);
  });

  test("an edge passing outside a corner is not kept", () => {
    // The segment's own bounding box covers the viewport completely, but the
    // line itself passes beyond the far corner, so a bounding-box overlap
    // test would keep this and a real intersection test does not.
    expect(
      cullPath(
        [
          [0, 21],
          [21, 0],
        ],
        box
      )
    ).toEqual([]);
  });

  test("a single point is kept only when it is inside", () => {
    expect(cullPath([[5, 5]], box)).toEqual([[[5, 5]]]);
    expect(cullPath([[50, 50]], box)).toEqual([]);
    expect(cullPath([], box)).toEqual([]);
  });
});

describe("cullPoints", () => {
  test("keeps only the points inside", () => {
    expect(
      cullPoints(
        [
          [1, 1],
          [50, 50],
          [9, 9],
        ],
        box
      )
    ).toEqual([
      [1, 1],
      [9, 9],
    ]);
  });

  test("returns the original array when nothing is dropped", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const points = [
      [1, 1],
      [9, 9],
    ];
    expect(cullPoints(points, box)).toBe(points);
  });

  test("points on the boundary are inside", () => {
    /** @type {import("@/geo").Coordinate[]} */
    const edge = [
      [0, 0],
      [10, 10],
    ];
    expect(cullPoints(edge, box)).toBe(edge);
  });
});
