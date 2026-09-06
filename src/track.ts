/**
 * Columnar storage for a device's location history.
 *
 * The history is the largest thing the app holds, and holding it as one
 * JavaScript object per location is expensive: 250,000 locations retain
 * roughly 33 MB when their strings are shared and 61 MB when they are not.
 * The same data in typed arrays is about 7 MB.
 *
 * Only the fields the app actually reads from history are kept. Popups are
 * shown for last-known locations and for the playback marker, never for a
 * history point, so the full record is only ever needed one at a time and can
 * be materialised on demand with `at()`.
 */

// Motion activities come from a small fixed vocabulary, so they are interned
// once and stored as an index rather than an array of strings per location.
const activityVocabulary: string[] = [""];
const activityIndex = new Map<string, number>([["", 0]]);

/**
 * Intern a location's motion activities as a single dictionary index.
 *
 * @param activities Motion activities
 * @returns Index into the vocabulary
 */
function internActivities(activities: string[] | undefined): number {
  if (!Array.isArray(activities) || activities.length === 0) {
    return 0;
  }
  const key = activities.join(",");
  let index = activityIndex.get(key);
  if (index === undefined) {
    index = activityVocabulary.length;
    activityVocabulary.push(key);
    activityIndex.set(key, index);
  }
  return index;
}

/**
 * Read back interned motion activities.
 *
 * @param index Vocabulary index
 * @returns Motion activities, or undefined if none
 */
function readActivities(index: number): string[] | undefined {
  const key = activityVocabulary[index];
  return key ? key.split(",") : undefined;
}

const INITIAL_CAPACITY = 64;

/** History as the recorder returns it, keyed by user then device. */
export type RawLocationHistory = Record<User, Record<Device, OTLocation[]>>;

/** History as the app holds it, keyed by user then device. */
export type TrackHistory = Record<User, Record<Device, Track>>;

/** A device's location history, stored column by column. */
export class Track {
  user: User;
  device: Device;
  length: number;
  capacity: number;

  tst: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  acc: Float32Array;
  alt: Float32Array;
  vel: Float32Array;
  activity: Uint16Array;

  /** Sparse, keyed by index into the columns. */
  poi: Map<number, string>;

  /**
   * @param [user] Username this track belongs to
   * @param [device] Device name this track belongs to
   */
  constructor(user: User = "", device: Device = "") {
    this.user = user;
    this.device = device;
    this.length = 0;
    this.capacity = 0;

    // Timestamps are held as doubles rather than 32-bit integers so that the
    // store keeps working past 2038.
    this.tst = new Float64Array(0);
    this.lat = new Float64Array(0);
    this.lon = new Float64Array(0);
    this.acc = new Float32Array(0);
    this.alt = new Float32Array(0);
    this.vel = new Float32Array(0);
    this.activity = new Uint16Array(0);

    // Points of interest are sparse, so they stay in a map keyed by index
    // rather than costing a slot per location.
    this.poi = new Map();
  }

  /**
   * Grow the columns to hold at least `needed` entries.
   *
   * @param needed Required capacity
   */
  reserve(needed: number): void {
    if (needed <= this.capacity) {
      return;
    }
    let capacity = Math.max(
      this.capacity || INITIAL_CAPACITY,
      INITIAL_CAPACITY
    );
    while (capacity < needed) {
      capacity *= 2;
    }

    const grow = <T extends Float64Array | Float32Array | Uint16Array>(
      column: T,
      Type: { new (length: number): T }
    ): T => {
      const next = new Type(capacity);
      next.set(column as never);
      return next;
    };
    this.tst = grow(this.tst, Float64Array);
    this.lat = grow(this.lat, Float64Array);
    this.lon = grow(this.lon, Float64Array);
    this.acc = grow(this.acc, Float32Array);
    this.alt = grow(this.alt, Float32Array);
    this.vel = grow(this.vel, Float32Array);
    this.activity = grow(this.activity, Uint16Array);
    this.capacity = capacity;
  }

  /**
   * Append a location. The caller is responsible for ordering.
   *
   * @param location Location to append
   * @returns Index the location was written at
   */
  push(location: OTLocation): number {
    const index = this.length;
    this.reserve(index + 1);

    this.tst[index] = location.tst ?? 0;
    this.lat[index] = location.lat ?? 0;
    this.lon[index] = location.lon ?? 0;
    // NaN marks "not reported", which is distinct from a reported zero.
    this.acc[index] = location.acc ?? NaN;
    this.alt[index] = location.alt ?? NaN;
    this.vel[index] = location.vel ?? NaN;
    this.activity[index] = internActivities(location.motionactivities);
    if (location.poi) {
      this.poi.set(index, location.poi);
    }

    this.length = index + 1;
    return index;
  }

  /**
   * Overwrite the location at an index.
   *
   * @param index Index to write
   * @param location Replacement location
   */
  set(index: number, location: OTLocation): void {
    this.tst[index] = location.tst ?? 0;
    this.lat[index] = location.lat ?? 0;
    this.lon[index] = location.lon ?? 0;
    this.acc[index] = location.acc ?? NaN;
    this.alt[index] = location.alt ?? NaN;
    this.vel[index] = location.vel ?? NaN;
    this.activity[index] = internActivities(location.motionactivities);
    if (location.poi) {
      this.poi.set(index, location.poi);
    } else {
      this.poi.delete(index);
    }
  }

  /**
   * Timestamp of the newest location held.
   *
   * @returns Timestamp, or -Infinity when empty
   */
  lastTst(): number {
    return this.length > 0 ? this.tst[this.length - 1] : -Infinity;
  }

  /**
   * Materialise a single location as a plain object.
   *
   * Used for the playback marker and its popup, which only ever need one
   * location at a time.
   *
   * @param index Index to read
   * @returns The location, or null if out of range
   */
  at(index: number): OTLocation | null {
    if (index < 0 || index >= this.length) {
      return null;
    }
    const location: OTLocation = {
      _type: "location",
      username: this.user,
      device: this.device,
      tst: this.tst[index],
      lat: this.lat[index],
      lon: this.lon[index],
    };
    if (!Number.isNaN(this.acc[index])) location.acc = this.acc[index];
    if (!Number.isNaN(this.alt[index])) location.alt = this.alt[index];
    if (!Number.isNaN(this.vel[index])) location.vel = this.vel[index];

    const activities = readActivities(this.activity[index]);
    if (activities) location.motionactivities = activities;
    const poi = this.poi.get(index);
    if (poi) location.poi = poi;

    return location;
  }

  /**
   * Find where a timestamp belongs, keeping the track sorted oldest first.
   *
   * @param tst Timestamp to place
   * @returns Insertion index
   */
  indexFor(tst: number): number {
    let low = 0;
    let high = this.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.tst[mid] < tst) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /**
   * Insert a location at an index, shifting later entries along.
   *
   * Out-of-order arrivals are rare, so the cost of shifting is accepted rather
   * than complicating the layout.
   *
   * @param index Index to insert at
   * @param location Location to insert
   */
  insert(index: number, location: OTLocation): void {
    if (index >= this.length) {
      this.push(location);
      return;
    }
    this.reserve(this.length + 1);

    const shift = (column: {
      copyWithin(target: number, start: number, end: number): unknown;
    }) => column.copyWithin(index + 1, index, this.length);
    shift(this.tst);
    shift(this.lat);
    shift(this.lon);
    shift(this.acc);
    shift(this.alt);
    shift(this.vel);
    shift(this.activity);

    // Sparse point-of-interest keys move with their locations.
    if (this.poi.size > 0) {
      const moved = new Map<number, string>();
      this.poi.forEach((value, key) => {
        moved.set(key >= index ? key + 1 : key, value);
      });
      this.poi = moved;
    }

    this.length += 1;
    this.set(index, location);
  }

  /**
   * Build a track from an array of raw locations, assumed sorted.
   *
   * @param user Username
   * @param device Device name
   * @param locations Locations, oldest first
   * @returns Populated track
   */
  static from(user: User, device: Device, locations: OTLocation[]): Track {
    const track = new Track(user, device);
    track.reserve(locations.length);
    for (let i = 0; i < locations.length; i++) {
      track.push(locations[i]);
    }
    return track;
  }
}

/**
 * Convert a raw history structure into tracks.
 *
 * @param history History keyed by user, then device
 * @returns The same shape, with `Track` values
 */
export function tracksFromHistory(
  history: RawLocationHistory | null | undefined
): TrackHistory {
  const tracks: TrackHistory = {};
  const source = history ?? {};
  Object.keys(source).forEach((user) => {
    tracks[user] = {};
    Object.keys(source[user]).forEach((device) => {
      tracks[user][device] = Track.from(user, device, source[user][device]);
    });
  });
  return tracks;
}
