/**
 * Incremental sampling of the location history for display.
 *
 * Sampling the whole data set on every change would undo the incremental
 * update path in the store: a single incoming location would once again cost
 * work proportional to the entire history. This sampler keeps its previous
 * output and extends it with only the points that have arrived since, falling
 * back to a full pass when the tolerance changes or the underlying data is
 * replaced.
 *
 * Coordinates are `[lng, lat]` pairs, matching GeoJSON order.
 */

import { simplifyPath, decimatePoints } from "@/simplify";
import type { Coordinate } from "@/simplify";

/** One line segment of a device's track. */
export interface Segment {
  user: User;
  device: Device;
  coordinates: Coordinate[];
}

/** The subset of the store's derived data that sampling operates on. */
export interface SampleInput {
  segments: Segment[];
  pointsByUser: Map<User, Coordinate[]>;
}

/** A segment plus the bookkeeping needed to extend it incrementally. */
interface SegmentEntry extends Segment {
  source: Coordinate[];
  consumed: number;
  provisional: boolean;
  addedSinceCompaction: number;
}

/** A point cloud plus the cells already occupied. */
interface PointsEntry {
  source: Coordinate[];
  consumed: number;
  cells: Set<string>;
  coordinates: Coordinate[];
}

interface Cache {
  tolerance: number;
  sourceSegments: Segment[];
  sourcePoints: Map<User, Coordinate[]>;
  segments: SegmentEntry[];
  users: Map<User, PointsEntry>;
}

/** A sampler holding its own cache across calls. */
export interface Sampler {
  sample(data: SampleInput, tolerance: number): SampleInput;
  reset(): void;
}

// How many incrementally kept points to allow before re-simplifying a
// segment's retained points.
const COMPACTION_THRESHOLD = 32;

/**
 * Longitude scaling factor at a latitude, so that a degree of longitude and a
 * degree of latitude cover comparable ground.
 *
 * @param lat Latitude in degrees
 * @returns Scaling factor
 */
function lngScaleAt(lat: number): number {
  return Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
}

/**
 * Whether two coordinates are further apart than the tolerance.
 *
 * @param a First coordinate
 * @param b Second coordinate
 * @param tolerance Tolerance in degrees
 * @returns True if the points are distinguishable
 */
function beyondTolerance(
  a: Coordinate,
  b: Coordinate,
  tolerance: number
): boolean {
  const scale = lngScaleAt(b[1]);
  const dx = (b[0] - a[0]) * scale;
  const dy = b[1] - a[1];
  return dx * dx + dy * dy > tolerance * tolerance;
}

/**
 * Create a sampler holding its own cache.
 *
 * @returns Sampler with `sample()` and `reset()`
 */
export function createSampler(): Sampler {
  let cache: Cache | null = null;

  /**
   * Sample a segment from scratch.
   *
   * @param segment Source segment
   * @param tolerance Tolerance in degrees
   * @returns Cache entry for the segment
   */
  function sampleSegment(segment: Segment, tolerance: number): SegmentEntry {
    const coordinates = simplifyPath(segment.coordinates, tolerance).slice();
    return {
      user: segment.user,
      device: segment.device,
      source: segment.coordinates,
      consumed: segment.coordinates.length,
      // Douglas-Peucker always keeps the final point, so nothing is
      // provisional after a full pass.
      provisional: false,
      addedSinceCompaction: 0,
      coordinates,
    };
  }

  /**
   * Extend a sampled segment with the points added since it was last sampled.
   *
   * New points are kept when they are further than the tolerance from the last
   * kept point. The true final point is always shown so the line ends where
   * the data does; it is marked provisional and removed again before the next
   * batch is considered.
   *
   * @param entry Cache entry to extend
   * @param tolerance Tolerance in degrees
   */
  function extendSegment(entry: SegmentEntry, tolerance: number): void {
    const source = entry.source;
    if (entry.consumed >= source.length) {
      return;
    }

    if (entry.provisional) {
      entry.coordinates.pop();
      entry.provisional = false;
    }

    for (let i = entry.consumed; i < source.length; i++) {
      const point = source[i];
      const last = entry.coordinates[entry.coordinates.length - 1];
      if (!last || beyondTolerance(last, point, tolerance)) {
        entry.coordinates.push(point);
        entry.addedSinceCompaction += 1;
      }
    }
    entry.consumed = source.length;

    // The distance rule alone keeps noticeably more points than a full
    // Douglas-Peucker pass. Periodically re-simplify the points already kept,
    // which bounds that drift. This is cheap: it runs over the reduced set,
    // not the source data.
    if (entry.addedSinceCompaction >= COMPACTION_THRESHOLD) {
      entry.coordinates = simplifyPath(entry.coordinates, tolerance).slice();
      entry.addedSinceCompaction = 0;
    }

    const finalPoint = source[source.length - 1];
    if (entry.coordinates[entry.coordinates.length - 1] !== finalPoint) {
      entry.coordinates.push(finalPoint);
      entry.provisional = true;
    }
  }

  /**
   * Sample a point cloud from scratch, remembering the occupied cells so that
   * later points can be tested without revisiting the whole cloud.
   *
   * @param coordinates Source coordinates
   * @param cellSize Grid cell size in degrees
   * @returns Cache entry for the point cloud
   */
  function samplePoints(
    coordinates: Coordinate[],
    cellSize: number
  ): PointsEntry {
    const kept = decimatePoints(coordinates, cellSize).slice();
    const cells = new Set<string>();
    kept.forEach((point) =>
      cells.add(
        `${Math.floor(point[0] / cellSize)}:${Math.floor(point[1] / cellSize)}`
      )
    );
    return {
      source: coordinates,
      consumed: coordinates.length,
      cells,
      coordinates: kept,
    };
  }

  /**
   * Extend a sampled point cloud with points added since it was last sampled.
   *
   * @param entry Cache entry to extend
   * @param cellSize Grid cell size in degrees
   */
  function extendPoints(entry: PointsEntry, cellSize: number): void {
    for (let i = entry.consumed; i < entry.source.length; i++) {
      const point = entry.source[i];
      const key = `${Math.floor(point[0] / cellSize)}:${Math.floor(
        point[1] / cellSize
      )}`;
      if (!entry.cells.has(key)) {
        entry.cells.add(key);
        entry.coordinates.push(point);
      }
    }
    entry.consumed = entry.source.length;
  }

  return {
    /**
     * Sample the given map data at the given tolerance.
     *
     * @param data `mapGeoData` value
     * @param tolerance Tolerance in degrees, 0 or less to pass through
     * @returns `segments` and `pointsByUser`, sampled
     */
    sample(data: SampleInput, tolerance: number): SampleInput {
      if (tolerance <= 0) {
        cache = null;
        return { segments: data.segments, pointsByUser: data.pointsByUser };
      }

      const cellSize = tolerance * 2;
      const existing = cache;

      // Written as a direct check rather than via a boolean so that the
      // narrowing survives into the branch below.
      if (
        existing === null ||
        existing.tolerance !== tolerance ||
        existing.sourceSegments !== data.segments ||
        existing.sourcePoints !== data.pointsByUser
      ) {
        const fresh: Cache = {
          tolerance,
          sourceSegments: data.segments,
          sourcePoints: data.pointsByUser,
          segments: data.segments.map((segment) =>
            sampleSegment(segment, tolerance)
          ),
          users: new Map(),
        };
        data.pointsByUser.forEach((coordinates, user) => {
          fresh.users.set(user, samplePoints(coordinates, cellSize));
        });
        cache = fresh;
        return output(fresh);
      }

      // Same data and tolerance: extend with whatever arrived since.
      for (let i = 0; i < data.segments.length; i++) {
        if (i < existing.segments.length) {
          extendSegment(existing.segments[i], tolerance);
        } else {
          existing.segments.push(sampleSegment(data.segments[i], tolerance));
        }
      }
      data.pointsByUser.forEach((coordinates, user) => {
        const entry = existing.users.get(user);
        if (entry && entry.source === coordinates) {
          extendPoints(entry, cellSize);
        } else {
          existing.users.set(user, samplePoints(coordinates, cellSize));
        }
      });

      return output(existing);
    },

    /** Discard the cache, forcing a full pass on the next call. */
    reset(): void {
      cache = null;
    },
  };

  /**
   * Shape the cache into the form the map consumes.
   *
   * @param current Cache
   * @returns `segments` and `pointsByUser`
   */
  function output(current: Cache): SampleInput {
    const pointsByUser = new Map<User, Coordinate[]>();
    current.users.forEach((entry, user) =>
      pointsByUser.set(user, entry.coordinates)
    );
    return {
      segments: current.segments.map((entry) => ({
        user: entry.user,
        device: entry.device,
        coordinates: entry.coordinates,
      })),
      pointsByUser,
    };
  }
}
