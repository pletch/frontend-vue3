import { describe, expect, test } from "vitest";

import { createSampler } from "@/sampler";

/**
 * Build map data in the shape the store publishes.
 *
 * @param {Number[][]} coordinates Coordinates as [lng, lat]
 * @returns {Object} `mapGeoData`-shaped object
 */
function dataFrom(coordinates) {
  return {
    segments: [{ user: "alice", device: "phone", coordinates }],
    pointsByUser: new Map([["alice", coordinates]]),
    count: coordinates.length,
  };
}

/**
 * A gently curving path, so simplification has something to remove.
 *
 * @param {Number} n Number of points
 * @returns {Number[][]} Coordinates
 */
function path(n) {
  const coordinates = [];
  for (let i = 0; i < n; i++) {
    coordinates.push([i * 0.0002, Math.sin(i / 40) * 0.01]);
  }
  return coordinates;
}

describe("createSampler", () => {
  test("passes data through untouched when disabled", () => {
    const sampler = createSampler();
    const data = dataFrom(path(50));
    const result = sampler.sample(data, 0);

    expect(result.segments).toBe(data.segments);
    expect(result.pointsByUser).toBe(data.pointsByUser);
  });

  test("reduces the data at a usable tolerance", () => {
    const sampler = createSampler();
    const data = dataFrom(path(2000));
    const result = sampler.sample(data, 0.001);

    expect(result.segments[0].coordinates.length).toBeLessThan(2000);
    expect(result.pointsByUser.get("alice").length).toBeLessThan(2000);
  });

  test("keeps the first and last point of a segment", () => {
    const sampler = createSampler();
    const coordinates = path(500);
    const result = sampler.sample(dataFrom(coordinates), 0.001);
    const sampled = result.segments[0].coordinates;

    expect(sampled[0]).toEqual(coordinates[0]);
    expect(sampled[sampled.length - 1]).toEqual(
      coordinates[coordinates.length - 1]
    );
  });

  test("always ends the line at the newest point after appends", () => {
    const sampler = createSampler();
    const coordinates = path(300);
    const data = dataFrom(coordinates);
    sampler.sample(data, 0.001);

    for (let i = 0; i < 25; i++) {
      // The store mutates the coordinate array in place for live appends.
      coordinates.push([0.06 + i * 0.00001, 0.0001 * i]);
      data.count = coordinates.length;
      const sampled = sampler.sample(data, 0.001).segments[0].coordinates;
      expect(sampled[sampled.length - 1]).toEqual(
        coordinates[coordinates.length - 1]
      );
    }
  });

  test("does not grow without bound when appending nearby points", () => {
    const sampler = createSampler();
    const coordinates = path(200);
    const data = dataFrom(coordinates);
    const initial = sampler.sample(data, 0.01).segments[0].coordinates.length;

    // 500 points all well inside the tolerance of each other.
    for (let i = 0; i < 500; i++) {
      coordinates.push([0.04 + i * 1e-9, 0]);
      data.count = coordinates.length;
      sampler.sample(data, 0.01);
    }

    const finalLength = sampler.sample(data, 0.01).segments[0].coordinates
      .length;
    // At most one extra kept point plus the provisional endpoint.
    expect(finalLength).toBeLessThanOrEqual(initial + 2);
  });

  test("incremental appends stay close to a full pass", () => {
    const incremental = createSampler();
    const coordinates = path(400);
    const data = dataFrom(coordinates);
    incremental.sample(data, 0.0005);

    for (let i = 0; i < 200; i++) {
      coordinates.push([0.08 + i * 0.0002, Math.sin((400 + i) / 40) * 0.01]);
      data.count = coordinates.length;
      incremental.sample(data, 0.0005);
    }

    const incrementalResult = incremental.sample(data, 0.0005).segments[0]
      .coordinates;
    const fresh = createSampler().sample(dataFrom(coordinates), 0.0005)
      .segments[0].coordinates;

    // The incremental path only applies the distance rule to new points, so it
    // keeps somewhat more than a full Douglas-Peucker pass, but must stay in
    // the same league rather than degenerating towards the raw data.
    expect(incrementalResult.length).toBeGreaterThanOrEqual(fresh.length);
    expect(incrementalResult.length).toBeLessThan(fresh.length * 3);
    expect(incrementalResult.length).toBeLessThan(coordinates.length / 2);
  });

  test("re-samples from scratch when the tolerance changes", () => {
    const sampler = createSampler();
    const data = dataFrom(path(2000));

    const coarse = sampler.sample(data, 0.01).segments[0].coordinates.length;
    const fine = sampler.sample(data, 0.0001).segments[0].coordinates.length;
    expect(fine).toBeGreaterThan(coarse);
  });

  test("re-samples when the underlying data is replaced", () => {
    const sampler = createSampler();
    sampler.sample(dataFrom(path(500)), 0.001);

    const replacement = dataFrom(path(50));
    const result = sampler.sample(replacement, 0.001);
    expect(result.segments[0].coordinates.length).toBeLessThanOrEqual(50);
  });

  test("picks up a newly added segment", () => {
    const sampler = createSampler();
    const data = dataFrom(path(200));
    sampler.sample(data, 0.001);

    data.segments.push({
      user: "alice",
      device: "tablet",
      coordinates: path(200),
    });
    const result = sampler.sample(data, 0.001);
    expect(result.segments).toHaveLength(2);
  });

  test("picks up a newly added user", () => {
    const sampler = createSampler();
    const data = dataFrom(path(200));
    sampler.sample(data, 0.001);

    data.pointsByUser.set("bob", path(100));
    const result = sampler.sample(data, 0.001);
    expect(result.pointsByUser.has("bob")).toBe(true);
  });

  test("reset() forces a full pass", () => {
    const sampler = createSampler();
    const data = dataFrom(path(300));
    const first = sampler.sample(data, 0.001).segments[0].coordinates.length;

    sampler.reset();
    const second = sampler.sample(data, 0.001).segments[0].coordinates.length;
    expect(second).toBe(first);
  });
});
