/**
 * Restricting drawn geometry to the viewport.
 *
 * Sampling reduces detail when zoomed out; this reduces extent when zoomed in.
 * Above the sampling zoom threshold the sampler passes the history through
 * untouched, so without culling every point of every track is handed to the
 * renderer on every redraw no matter how far in the map is zoomed.
 *
 * Coordinates are `[lng, lat]` pairs, matching GeoJSON order.
 */

import type { Bounds, Coordinate } from "@/geo";

/**
 * Grow bounds by a fraction of their own size on every side.
 *
 * The drawn data is culled to a padded viewport so that a small pan reuses the
 * previous result instead of rebuilding every source.
 *
 * @param bounds Bounds to grow
 * @param fraction Fraction of the width and height to add on each side
 * @returns Grown bounds
 */
export function padBounds(bounds: Bounds, fraction: number): Bounds {
  const padLng = (bounds.maxLng - bounds.minLng) * fraction;
  const padLat = (bounds.maxLat - bounds.minLat) * fraction;
  return {
    minLng: bounds.minLng - padLng,
    minLat: bounds.minLat - padLat,
    maxLng: bounds.maxLng + padLng,
    maxLat: bounds.maxLat + padLat,
  };
}

/**
 * Whether one set of bounds completely contains another.
 *
 * @param outer Containing bounds
 * @param inner Contained bounds
 * @returns True if `inner` lies entirely within `outer`
 */
export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng &&
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat
  );
}

/**
 * Whether a coordinate lies within bounds.
 *
 * @param point Coordinate to test
 * @param bounds Bounds to test against
 * @returns True if the point is inside
 */
function inside(point: Coordinate, bounds: Bounds): boolean {
  return (
    point[0] >= bounds.minLng &&
    point[0] <= bounds.maxLng &&
    point[1] >= bounds.minLat &&
    point[1] <= bounds.maxLat
  );
}

/**
 * Whether the segment between two coordinates touches the bounds.
 *
 * Liang-Barsky parametric clipping, which also catches the case both endpoints
 * miss: a long jump straight across the viewport still has to be drawn. Written
 * without temporary arrays because it runs once per point of the history.
 *
 * @param a Start of the segment
 * @param b End of the segment
 * @param bounds Bounds to test against
 * @returns True if any part of the segment lies within the bounds
 */
function edgeTouches(a: Coordinate, b: Coordinate, bounds: Bounds): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;

  for (let edge = 0; edge < 4; edge++) {
    let p: number;
    let q: number;
    if (edge === 0) {
      p = -dx;
      q = a[0] - bounds.minLng;
    } else if (edge === 1) {
      p = dx;
      q = bounds.maxLng - a[0];
    } else if (edge === 2) {
      p = -dy;
      q = a[1] - bounds.minLat;
    } else {
      p = dy;
      q = bounds.maxLat - a[1];
    }

    if (p === 0) {
      // Parallel to this edge: outside it means outside altogether.
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }

  return true;
}

/**
 * Split a path into the runs of it that are worth drawing.
 *
 * A vertex is kept when an edge on either side of it touches the bounds, so a
 * track entering the viewport still starts from its true previous position
 * rather than from the first visible vertex, and leaves at the correct angle.
 * Consecutive kept vertices become one run; a gap starts a new one.
 *
 * The original array is returned unchanged, as a single run, when everything
 * is kept - the common case while the whole track is on screen, and the one
 * where copying would be pure waste.
 *
 * @param coordinates Path to cull
 * @param bounds Bounds to cull to
 * @returns Runs of coordinates, each with at least two points
 */
export function cullPath(
  coordinates: Coordinate[],
  bounds: Bounds
): Coordinate[][] {
  const n = coordinates.length;
  if (n < 2) {
    return n === 1 && inside(coordinates[0], bounds) ? [coordinates] : [];
  }

  const runs: Coordinate[][] = [];
  let run: Coordinate[] | null = null;
  let previousKept = false;

  for (let i = 0; i < n - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const keep =
      inside(a, bounds) || inside(b, bounds) || edgeTouches(a, b, bounds);

    if (!keep) {
      previousKept = false;
      run = null;
      continue;
    }

    if (!previousKept) {
      run = [a];
      runs.push(run);
    }
    // `run` is non-null whenever `previousKept` is, and is assigned above
    // otherwise.
    (run as Coordinate[]).push(b);
    previousKept = true;
  }

  return runs.length === 1 && runs[0].length === n ? [coordinates] : runs;
}

/**
 * Drop the coordinates of a point cloud that lie outside the bounds.
 *
 * The original array is returned when nothing is dropped.
 *
 * @param coordinates Coordinates to cull
 * @param bounds Bounds to cull to
 * @returns The coordinates that lie within the bounds
 */
export function cullPoints(
  coordinates: Coordinate[],
  bounds: Bounds
): Coordinate[] {
  const kept: Coordinate[] = [];
  for (let i = 0; i < coordinates.length; i++) {
    if (inside(coordinates[i], bounds)) kept.push(coordinates[i]);
  }
  return kept.length === coordinates.length ? coordinates : kept;
}
