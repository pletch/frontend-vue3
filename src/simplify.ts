/**
 * Client-side sampling for large location data sets.
 *
 * At low zoom levels most points land on the same pixel, so drawing all of
 * them costs GPU time and battery without changing what the user sees. These
 * helpers reduce the data to what is actually distinguishable at a given
 * scale.
 *
 * Coordinates are `[lng, lat]` pairs throughout, matching GeoJSON order.
 */

/** A GeoJSON position: longitude first, then latitude. */
export type Coordinate = [number, number];

// Web Mercator tile size, used to convert a pixel tolerance into degrees.
const TILE_SIZE = 512;

/**
 * Convert a tolerance in screen pixels to one in degrees at a given zoom.
 *
 * @param zoom Map zoom level
 * @param [pixels] Tolerance in pixels
 * @returns Tolerance in degrees of longitude at the equator
 */
export function toleranceForZoom(zoom: number, pixels = 1): number {
  return (360 / (TILE_SIZE * Math.pow(2, zoom))) * pixels;
}

/**
 * Squared perpendicular distance from a point to a segment.
 *
 * Longitude is scaled by the cosine of the latitude so that a degree of
 * longitude and a degree of latitude cover comparable ground, which keeps the
 * tolerance meaningful away from the equator.
 *
 * @param point Point as [lng, lat]
 * @param start Segment start as [lng, lat]
 * @param end Segment end as [lng, lat]
 * @param lngScale Longitude scaling factor
 * @returns Squared distance in scaled degrees
 */
function squaredSegmentDistance(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
  lngScale: number
): number {
  let x = start[0] * lngScale;
  let y = start[1];
  let dx = end[0] * lngScale - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t =
      ((point[0] * lngScale - x) * dx + (point[1] - y) * dy) /
      (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0] * lngScale;
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] * lngScale - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

/**
 * Drop points closer together than the tolerance.
 *
 * Run before the Douglas-Peucker pass, which is much more expensive per point.
 *
 * @param coordinates Coordinates as [lng, lat]
 * @param tolerance Tolerance in degrees
 * @param lngScale Longitude scaling factor
 * @returns Reduced coordinates, endpoints preserved
 */
function radialDistanceFilter(
  coordinates: Coordinate[],
  tolerance: number,
  lngScale: number
): Coordinate[] {
  const squaredTolerance = tolerance * tolerance;
  const result: Coordinate[] = [coordinates[0]];
  let previous = coordinates[0];

  for (let i = 1; i < coordinates.length; i++) {
    const point = coordinates[i];
    const dx = (point[0] - previous[0]) * lngScale;
    const dy = point[1] - previous[1];
    if (dx * dx + dy * dy > squaredTolerance) {
      result.push(point);
      previous = point;
    }
  }

  // Always keep the final point so the line still ends where the data does.
  if (previous !== coordinates[coordinates.length - 1]) {
    result.push(coordinates[coordinates.length - 1]);
  }
  return result;
}

/**
 * Douglas-Peucker simplification, iterative to avoid deep recursion.
 *
 * A recursive implementation overflows the stack on the long paths this is
 * meant for.
 *
 * @param coordinates Coordinates as [lng, lat]
 * @param tolerance Tolerance in degrees
 * @param lngScale Longitude scaling factor
 * @returns Simplified coordinates
 */
function douglasPeucker(
  coordinates: Coordinate[],
  tolerance: number,
  lngScale: number
): Coordinate[] {
  const last = coordinates.length - 1;
  const squaredTolerance = tolerance * tolerance;
  const keep = new Uint8Array(coordinates.length);
  keep[0] = 1;
  keep[last] = 1;

  const stack: number[] = [0, last];
  while (stack.length > 0) {
    const end = stack.pop() as number;
    const start = stack.pop() as number;

    let furthest = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = squaredSegmentDistance(
        coordinates[i],
        coordinates[start],
        coordinates[end],
        lngScale
      );
      if (distance > furthest) {
        furthest = distance;
        index = i;
      }
    }

    if (index !== -1 && furthest > squaredTolerance) {
      keep[index] = 1;
      stack.push(start, index, index, end);
    }
  }

  const result: Coordinate[] = [];
  for (let i = 0; i < coordinates.length; i++) {
    if (keep[i]) {
      result.push(coordinates[i]);
    }
  }
  return result;
}

/**
 * Simplify a path to the detail visible at the given tolerance.
 *
 * @param coordinates Coordinates as [lng, lat]
 * @param tolerance Tolerance in degrees, 0 or less to disable
 * @returns Simplified coordinates
 */
export function simplifyPath(
  coordinates: Coordinate[],
  tolerance: number
): Coordinate[] {
  if (tolerance <= 0 || coordinates.length <= 2) {
    return coordinates;
  }

  // Scale longitude by the cosine of the mid-latitude of the path.
  const midLat =
    (coordinates[0][1] + coordinates[coordinates.length - 1][1]) / 2;
  const lngScale = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01);

  const reduced = radialDistanceFilter(coordinates, tolerance, lngScale);
  if (reduced.length <= 2) {
    return reduced;
  }
  return douglasPeucker(reduced, tolerance, lngScale);
}

/**
 * Reduce a point cloud to at most one point per grid cell.
 *
 * Used for the history point and heatmap layers, where overlapping points at
 * low zoom are indistinguishable.
 *
 * @param coordinates Coordinates as [lng, lat]
 * @param cellSize Grid cell size in degrees, 0 or less to disable
 * @returns One coordinate per occupied cell
 */
export function decimatePoints(
  coordinates: Coordinate[],
  cellSize: number
): Coordinate[] {
  if (cellSize <= 0 || coordinates.length === 0) {
    return coordinates;
  }

  const seen = new Set<string>();
  const result: Coordinate[] = [];
  for (let i = 0; i < coordinates.length; i++) {
    const point = coordinates[i];
    const key = `${Math.floor(point[0] / cellSize)}:${Math.floor(
      point[1] / cellSize
    )}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(point);
    }
  }
  return result;
}
