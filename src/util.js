import moment from "moment";

import config from "@/config";
import { DATE_TIME_FORMAT, EARTH_RADIUS_IN_KM } from "@/constants";
import i18n from "@/i18n";

// 1 km/h in mph
const KMH_TO_MPH = 0.621371;
// 1 meter in feet
const METERS_TO_FEET = 3.28084;
// 1 mile in meters
const METERS_PER_MILE = 1609.344;

/**
 * Resolve the active unit system from the configuration.
 *
 * Explicit `config.units` wins; otherwise fall back to a locale-based guess
 * (en-US is the only locale that defaults to imperial).
 *
 * @returns {"metric"|"imperial"} Active unit system
 */
function getUnitSystem(preference) {
  const p =
    preference !== undefined
      ? preference
      : (window.owntracks && window.owntracks.config && window.owntracks.config.units) ||
        config.units;
  if (p === "imperial" || p === "metric") {
    return p;
  }
  return i18n.global.locale.value === "en-US" ? "imperial" : "metric";
}

/**
 * Get a complete URL for any API resource, taking the
 * base URL configuration into account.
 *
 * @param {String} path Path to the API resource
 * @returns {URL} Final API URL
 */
export function getApiUrl(path) {
  const baseUrl =
    (window.owntracks &&
      window.owntracks.config &&
      window.owntracks.config.api &&
      window.owntracks.config.api.baseUrl) ||
    config.api.baseUrl;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${normalizedBaseUrl}${normalizedPath}`);
}

/**
 * Check if the given string is an ISO 8601 YYYY-MM-DDTHH:MM:SS datetime.
 *
 * @param {String} s Input value to be tested
 * @returns {Boolean} Whether the input matches the expected format
 */
export function isIsoDateTime(s) {
  return moment(s, DATE_TIME_FORMAT, true).isValid();
}

/**
 * Convert degrees to radians.
 *
 * @param {Number} degrees Angle in degrees
 * @returns {Number} Angle in radians
 */
export function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate the distance between two coordinates. Uses the haversine formula,
 * which is not 100% accurate - but that's not the goal here.
 *
 * https://en.wikipedia.org/wiki/Haversine_formula
 *
 * @param {Coordinate} c1 First coordinate
 * @param {Coordinate} c2 Second coordinate
 * @returns {Number} Distance in meters
 */
export function distanceBetweenCoordinates(c1, c2) {
  const r = EARTH_RADIUS_IN_KM * 1000;
  const phi1 = degreesToRadians(c1.lat);
  const phi2 = degreesToRadians(c2.lat);
  const lambda1 = degreesToRadians(c1.lng);
  const lambda2 = degreesToRadians(c2.lng);
  const d =
    2 *
    r *
    Math.asin(
      Math.sqrt(
        Math.sin((phi2 - phi1) / 2) ** 2 +
          Math.cos(phi1) *
            Math.cos(phi2) *
            Math.sin((lambda2 - lambda1) / 2) ** 2
      )
    );
  return d;
}

/**
 * Format a distance in meters into a human-readable string with unit.
 *
 * Honors `config.units` (or its locale-based fallback): metric returns
 * m / km, imperial returns ft / mi.
 *
 * @param {Number} distance Distance in meters
 * @param {String} [unitPreference] Optional unit system override
 * @returns {String} Formatted string including translated unit
 */
export function humanReadableDistance(distance, unitPreference) {
  let value;
  let unitKey;
  if (getUnitSystem(unitPreference) === "imperial") {
    if (Math.abs(distance) >= METERS_PER_MILE) {
      value = distance / METERS_PER_MILE;
      unitKey = "mi";
    } else {
      value = distance * METERS_TO_FEET;
      unitKey = "ft";
    }
  } else {
    if (Math.abs(distance) >= 1000) {
      value = distance / 1000;
      unitKey = "km";
    } else {
      value = distance;
      unitKey = "m";
    }
  }
  // ft are typically shown without decimals; everything else gets one.
  const maximumFractionDigits = unitKey === "ft" ? 0 : 1;
  return `${value.toLocaleString(i18n.global.locale.value, {
    maximumFractionDigits,
  })} ${i18n.global.t(unitKey)}`;
}

/**
 * Format a speed (in km/h, as delivered by the OwnTracks recorder) into a
 * human-readable string with unit. Returns km/h for metric and mph for
 * imperial.
 *
 * @param {Number} kmh Speed in km/h
 * @param {String} [unitPreference] Optional unit system override
 * @returns {String} Formatted string including translated unit
 */
export function humanReadableSpeed(kmh, unitPreference) {
  const imperial = getUnitSystem(unitPreference) === "imperial";
  const value = imperial ? kmh * KMH_TO_MPH : kmh;
  const unitKey = imperial ? "mph" : "km/h";
  return `${value.toLocaleString(i18n.global.locale.value, {
    maximumFractionDigits: 1,
  })} ${i18n.global.t(unitKey)}`;
}

/**
 * Format an altitude in meters into a human-readable string with unit.
 *
 * Unlike `humanReadableDistance` this stays in the base unit (m / ft) instead
 * of switching to km / mi for large values, which matches typical altitude
 * display conventions.
 *
 * @param {Number} altitude Altitude in meters
 * @param {String} [unitPreference] Optional unit system override
 * @returns {String} Formatted string including translated unit
 */
export function humanReadableAltitude(altitude, unitPreference) {
  const imperial = getUnitSystem(unitPreference) === "imperial";
  const value = imperial ? altitude * METERS_TO_FEET : altitude;
  const unitKey = imperial ? "ft" : "m";
  return `${value.toLocaleString(i18n.global.locale.value, {
    maximumFractionDigits: 0,
  })} ${i18n.global.t(unitKey)}`;
}

/**
 * Get the total number of locations from a nested location history.
 *
 * @param {LocationHistory} locationHistory Location history
 * @returns {Number} Total number of locations
 */
export function getLocationHistoryCount(locationHistory) {
  return Object.keys(locationHistory)
    .map((user) =>
      Object.keys(locationHistory[user])
        .map((device) => locationHistory[user][device].length)
        .reduce((a, b) => a + b, 0)
    )
    .reduce((a, b) => a + b, 0);
}

/**
 * Assign a consistent distinct color for a given user.
 * 
 * @param {String} user Username
 * @returns {String} Hex color code
 */
const USER_COLORS = [
  "#3f51b5", // Blue (primary)
  "#f44336", // Red
  "#4caf50", // Green
  "#9c27b0", // Purple
  "#00bcd4", // Light Blue
  "#e91e63", // Pink
  "#ff9800", // Orange
  "#607d8b", // Blue Grey
];

const assignedColors = {};
let colorIndex = 0;

export function getUserColor(user) {
  if (!user) return USER_COLORS[0];
  if (!assignedColors[user]) {
    assignedColors[user] = USER_COLORS[colorIndex % USER_COLORS.length];
    colorIndex++;
  }
  return assignedColors[user];
}
