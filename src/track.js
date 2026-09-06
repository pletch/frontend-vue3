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
const activityVocabulary = [""];
const activityIndex = new Map([["", 0]]);

/**
 * Intern a location's motion activities as a single dictionary index.
 *
 * @param {String[]} activities Motion activities
 * @returns {Number} Index into the vocabulary
 */
function internActivities(activities) {
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
 * @param {Number} index Vocabulary index
 * @returns {String[]|undefined} Motion activities, or undefined if none
 */
function readActivities(index) {
  const key = activityVocabulary[index];
  return key ? key.split(",") : undefined;
}

const INITIAL_CAPACITY = 64;

/** A device's location history, stored column by column. */
export class Track {
  /**
   * @param {User} [user] Username this track belongs to
   * @param {Device} [device] Device name this track belongs to
   */
  constructor(user = "", device = "") {
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
   * @param {Number} needed Required capacity
   */
  reserve(needed) {
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

    const grow = (column, Type) => {
      const next = new Type(capacity);
      next.set(column);
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
   * @param {OTLocation} location Location to append
   * @returns {Number} Index the location was written at
   */
  push(location) {
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
   * @param {Number} index Index to write
   * @param {OTLocation} location Replacement location
   */
  set(index, location) {
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
   * @returns {Number} Timestamp, or -Infinity when empty
   */
  lastTst() {
    return this.length > 0 ? this.tst[this.length - 1] : -Infinity;
  }

  /**
   * Materialise a single location as a plain object.
   *
   * Used for the playback marker and its popup, which only ever need one
   * location at a time.
   *
   * @param {Number} index Index to read
   * @returns {OTLocation|null} The location, or null if out of range
   */
  at(index) {
    if (index < 0 || index >= this.length) {
      return null;
    }
    const location = {
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
   * @param {Number} tst Timestamp to place
   * @returns {Number} Insertion index
   */
  indexFor(tst) {
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
   * @param {Number} index Index to insert at
   * @param {OTLocation} location Location to insert
   */
  insert(index, location) {
    if (index >= this.length) {
      this.push(location);
      return;
    }
    this.reserve(this.length + 1);

    const shift = (column) => column.copyWithin(index + 1, index, this.length);
    shift(this.tst);
    shift(this.lat);
    shift(this.lon);
    shift(this.acc);
    shift(this.alt);
    shift(this.vel);
    shift(this.activity);

    // Sparse point-of-interest keys move with their locations.
    if (this.poi.size > 0) {
      const moved = new Map();
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
   * @param {User} user Username
   * @param {Device} device Device name
   * @param {OTLocation[]} locations Locations, oldest first
   * @returns {Track} Populated track
   */
  static from(user, device, locations) {
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
 * @param {Object} history History keyed by user, then device
 * @returns {Object} The same shape, with `Track` values
 */
export function tracksFromHistory(history) {
  const tracks = {};
  Object.keys(history || {}).forEach((user) => {
    tracks[user] = {};
    Object.keys(history[user]).forEach((device) => {
      tracks[user][device] = Track.from(user, device, history[user][device]);
    });
  });
  return tracks;
}
