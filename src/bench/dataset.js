/**
 * Deterministic synthetic location data for benchmarking.
 *
 * Generating in the browser from a seeded PRNG keeps large fixtures out of the
 * repository and guarantees every run measures the exact same dataset.
 */

// Rough bounds of a plausible metropolitan area, used as the walk origin.
const ORIGIN_LAT = 51.5074;
const ORIGIN_LON = -0.1278;

// One degree of latitude in meters, close enough for synthetic data.
const METERS_PER_DEGREE = 111320;

/**
 * Create a seeded pseudo-random number generator (mulberry32).
 *
 * @param {Number} seed Integer seed
 * @returns {Function} Function returning floats in [0, 1)
 */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACTIVITIES = [
  ["walking"],
  ["running"],
  ["cycling"],
  ["automotive"],
  ["stationary"],
];

/**
 * Generate a single device's location history as a random walk.
 *
 * The walk mixes slow and fast segments, injects occasional teleports (to
 * exercise `map.maxPointDistance` grouping), degrades accuracy periodically
 * (to exercise `filters.minAccuracy`) and varies altitude, so that downstream
 * filtering, grouping and elevation code all see representative input.
 *
 * @param {Object} options Generation options
 * @param {string} options.user Username
 * @param {string} options.device Device name
 * @param {number} options.count Number of points to generate
 * @param {number} options.seed PRNG seed
 * @param {number} [options.endTst] Unix timestamp of the newest point
 * @param {number} [options.intervalSeconds] Seconds between points
 * @returns {OTLocation[]} Array of location objects, oldest first
 */
export function generateDeviceHistory({
  user,
  device,
  count,
  seed,
  endTst = Math.floor(Date.now() / 1000),
  intervalSeconds = 30,
}) {
  const random = createRandom(seed);
  const locations = new Array(count);

  let lat = ORIGIN_LAT + (random() - 0.5) * 0.1;
  let lon = ORIGIN_LON + (random() - 0.5) * 0.1;
  let alt = 20 + random() * 100;
  let heading = random() * 2 * Math.PI;
  let speed = 4;
  const startTst = endTst - count * intervalSeconds;
  const tid = user.slice(0, 2).toUpperCase();
  const topic = `owntracks/${user}/${device}`;

  for (let i = 0; i < count; i++) {
    // Occasionally change pace, and rarely teleport to simulate a gap in
    // reporting (phone offline, flight, etc).
    if (i % 500 === 0) {
      speed = [1.4, 4, 14, 25][Math.floor(random() * 4)];
    }
    if (i > 0 && i % 5000 === 0) {
      lat += (random() - 0.5) * 2;
      lon += (random() - 0.5) * 2;
    }

    heading += (random() - 0.5) * 0.6;
    const metersMoved = speed * intervalSeconds;
    const latMeters = Math.cos(heading) * metersMoved;
    const lonMeters = Math.sin(heading) * metersMoved;

    lat += latMeters / METERS_PER_DEGREE;
    lon +=
      lonMeters / (METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180) || 1);
    alt = Math.max(0, alt + (random() - 0.48) * 6);

    // Every 50th point gets poor accuracy so accuracy filtering has work to do.
    const acc = i % 50 === 0 ? 200 + random() * 800 : 5 + random() * 25;

    /** @type {OTLocation} */
    const location = {
      _type: "location",
      username: user,
      device,
      topic,
      tid,
      tst: startTst + i * intervalSeconds,
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      alt: Math.round(alt),
      acc: Math.round(acc),
      vel: Math.round(speed * 3.6),
      cog: Math.round(((heading * 180) / Math.PI + 360) % 360),
      batt: 100 - Math.floor((i / count) * 60),
      bs: i % 1000 < 100 ? 2 : 1,
      motionactivities: ACTIVITIES[Math.floor(random() * ACTIVITIES.length)],
      created_at: startTst + i * intervalSeconds,
    };

    // A sparse scattering of POIs and addresses, as a real recorder returns.
    if (i % 2000 === 0) {
      location.poi = `POI ${i / 2000}`;
    }
    if (i % 100 === 0) {
      location.addr = `${Math.floor(random() * 200)} Example Street`;
    }

    locations[i] = location;
  }

  return locations;
}

/**
 * Generate a full location history structure for several users and devices.
 *
 * @param {Object} [options] Generation options
 * @param {number} [options.points] Total number of points across all devices
 * @param {number} [options.users] Number of users
 * @param {number} [options.devicesPerUser] Devices per user
 * @param {number} [options.seed] PRNG seed
 * @returns {import("@/track").RawLocationHistory} Keyed by user, then device
 */
export function generateLocationHistory({
  points = 100000,
  users = 1,
  devicesPerUser = 1,
  seed = 1,
} = {}) {
  /** @type {import("@/track").RawLocationHistory} */
  const history = {};
  const deviceCount = users * devicesPerUser;
  const pointsPerDevice = Math.max(1, Math.floor(points / deviceCount));
  let index = 0;

  for (let u = 0; u < users; u++) {
    const user = `user${u + 1}`;
    history[user] = {};
    for (let d = 0; d < devicesPerUser; d++) {
      const device = `device${d + 1}`;
      history[user][device] = generateDeviceHistory({
        user,
        device,
        count: pointsPerDevice,
        seed: seed + index * 7919,
      });
      index++;
    }
  }

  return history;
}

/**
 * Derive a plausible `/api/0/last` response from a generated history.
 *
 * @param {import("@/track").RawLocationHistory} history Keyed by user, then
 *   device
 * @returns {OTLocation[]} The most recent location per device
 */
export function lastLocationsFromHistory(history) {
  /** @type {OTLocation[]} */
  const lastLocations = [];
  Object.keys(history).forEach((user) => {
    Object.keys(history[user]).forEach((device) => {
      const deviceHistory = history[user][device];
      if (deviceHistory.length) {
        lastLocations.push({ ...deviceHistory[deviceHistory.length - 1] });
      }
    });
  });
  return lastLocations;
}
