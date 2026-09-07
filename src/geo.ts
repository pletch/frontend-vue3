/**
 * Geometry types and helpers shared between the store, the sampler and the
 * map.
 *
 * These live apart from the modules that use them so that the store can
 * describe what it produces without the sampler having to import the store,
 * which would drag Pinia into a module that is otherwise pure.
 */

/** A GeoJSON position: longitude first, then latitude. */
export type Coordinate = [number, number];

/** A latitude/longitude pair in the order most of the app uses. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** The extent of a set of points. */
export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** One continuous run of a device's track. */
export interface Segment {
  user: User;
  device: Device;
  coordinates: Coordinate[];
}

/** A point of interest, ready to be drawn with its label. */
export interface PoiMarker {
  user: User;
  poi: string;
  coordinate: Coordinate;
}

/**
 * Everything the map needs, derived in a single pass over the history.
 *
 * `bounds` is null when there is nothing to show.
 */
export interface MapGeoData {
  segments: Segment[];
  pointsByUser: Map<User, Coordinate[]>;
  pois: PoiMarker[];
  bounds: Bounds | null;
  count: number;
}

/**
 * A longitude expressed so that it is continuous with the point before it.
 *
 * Recorded longitudes are wrapped into -180..180, so a track crossing the
 * antimeridian jumps from 179 to -179 - two degrees of travel that reads as
 * 358 in the other direction, which is how it gets drawn: a line all the way
 * back around the world. Shifting each longitude by whole turns to sit nearest
 * the previous one removes the discontinuity. GeoJSON permits longitudes
 * outside the normal range for exactly this, and the renderer draws them
 * across the seam.
 *
 * The result carries: once a track has crossed, subsequent points stay in the
 * shifted frame, so a track that crosses twice comes back to where it started.
 *
 * @param lon Longitude as recorded, -180..180
 * @param previous The previous point's unwrapped longitude, or null to start
 * @returns The longitude shifted by whole turns to sit nearest `previous`
 */
export function unwrapLongitude(lon: number, previous: number | null): number {
  if (previous === null) return lon;
  // Whole turns to the nearest representation. A jump of more than half the
  // world is read as a crossing, which is the only reading available: the
  // shorter path is the only one the data supports.
  return lon - Math.round((lon - previous) / 360) * 360;
}
