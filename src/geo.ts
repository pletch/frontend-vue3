/**
 * Geometry types shared between the store, the sampler and the map.
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
