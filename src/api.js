import config from "@/config";
import { log, LOG_WARNING, LOG_ERROR } from "@/logging";
import { getApiUrl, getLocationHistoryCount } from "@/util";

/**
 * Fetch an API resource.
 *
 * @param {String} path API resource path
 * @param {Object} [params] Query parameters
 * @param {Object} [fetchOptions]
 *   fetch() options (merged with config.api.fetchOptions)
 * @returns {Promise<Response>} Response returned by the fetch call
 */
function fetchApi(path, params = {}, fetchOptions = {}) {
  const url = getApiUrl(path);
  Object.keys(params).forEach((key) => url.searchParams.set(key, params[key]));
  log("HTTP", `GET ${url.href}`);
  return fetch(url.href, {
    ...fetchOptions,
    ...config.api.fetchOptions,
  }).catch((error) => {
    if (error.name === "AbortError") {
      log("HTTP", `GET ${url.href} - Request was aborted`, LOG_WARNING);
    } else {
      log("HTTP", error, LOG_ERROR);
    }
  });
}

/**
 * Get the recorder's version.
 *
 * @returns {Promise<String>} Version
 */
export async function getVersion() {
  const response = await fetchApi("/api/0/version");
  const json = await response.json();
  const version = json.version;
  log("API", () => `[getVersion] ${version}`);
  return version;
}

/**
 * Get all users.
 *
 * @returns {Promise<User[]>} Array of usernames
 */
export async function getUsers() {
  const response = await fetchApi("/api/0/list");
  const json = await response.json();
  const users = json.results;
  log("API", () => `[getUsers] Fetched ${users.length} users`);
  return users;
}

/**
 * Get all devices for the provided users.
 *
 * @param {User[]} users Array of usernames
 * @returns {Promise<{User: Device[]}>}
 *   Object mapping each username to an array of device names
 */
export async function getDevices(users) {
  const devices = {};
  await Promise.all(
    users.map(async (user) => {
      const response = await fetchApi(`/api/0/list`, { user });
      const json = await response.json();
      const userDevices = json.results;
      devices[user] = userDevices;
    })
  );
  log("API", () => {
    const devicesCount = Object.keys(devices)
      .map((user) => devices[user].length)
      .reduce((a, b) => a + b, 0);
    return (
      `[getDevices] Fetched ${devicesCount} ` +
      `devices for ${users.length} users`
    );
  });
  return devices;
}

/**
 * Get last locations for a specific or all user/device.
 *
 * @param {User} [user] Get last locations of all devices from this user
 * @param {Device} [device] Get last location of specific device
 * @returns {Promise<OTLocation[]>} Array of last location objects
 */
export async function getLastLocations(user, device) {
  const params = {};
  if (user) {
    params["user"] = user;
    if (device) {
      params["device"] = device;
    }
  }
  const response = await fetchApi("/api/0/last", params);
  const json = await response.json();
  const lastLocations = json;
  log(
    "API",
    () => `[getLastLocations] Fetched ${lastLocations.length} last locations`
  );
  return lastLocations;
}

/**
 * Get the location history of a specific user/device.
 *
 * @param {User} user Username
 * @param {Device} device Device name
 * @param {String} start Start date and time in UTC
 * @param {String} end End date and time in UTC
 * @param {Object} [fetchOptions] fetch() options
 * @returns {Promise<OTLocation[]>} Array of location history objects
 */
export async function getUserDeviceLocationHistory(
  user,
  device,
  start,
  end,
  fetchOptions
) {
  const response = await fetchApi(
    "/api/0/locations",
    {
      from: start,
      to: end,
      user,
      device,
      format: "json",
    },
    fetchOptions
  );
  const json = await response.json();
  // We need to manually sort by timestamp, otherwise the line segments may be
  // drawn in the wrong order. The recorder API simply returns entries in the
  // same order in which they are in each *.rec file.
  // See https://github.com/owntracks/frontend/issues/67.
  const userDeviceLocationHistory = json.data.sort((a, b) => a.tst - b.tst);
  log(
    "API",
    () =>
      `[getUserDeviceLocationHistory] Fetched ` +
      `${userDeviceLocationHistory.length} locations for ` +
      `${user}/${device} from ${start} - ${end}`
  );
  return userDeviceLocationHistory;
}

/**
 * Get the location history of multiple devices.
 *
 * @param {{User: Device[]}} devices
 *   Devices of which the history should be fetched
 * @param {String} start Start date and time in UTC
 * @param {String} end End date and time in UTC
 * @param {Object} [fetchOptions] fetch() options
 * @returns {Promise<LocationHistory>} Location history
 */
export async function getLocationHistory(devices, start, end, fetchOptions) {
  const locationHistory = {};
  await Promise.all(
    Object.keys(devices).map(async (user) => {
      locationHistory[user] = {};
      await Promise.all(
        devices[user].map(async (device) => {
          locationHistory[user][device] = await getUserDeviceLocationHistory(
            user,
            device,
            start,
            end,
            fetchOptions
          );
        })
      );
    })
  );
  log("API", () => {
    const locationHistoryCount = getLocationHistoryCount(locationHistory);
    return (
      "[getLocationHistory] Fetched " +
      `${locationHistoryCount} locations in total`
    );
  });
  return locationHistory;
}

/**
 * Connect to the WebSocket API, reconnect when necessary and handle received
 * messages.
 *
 * @param {WebSocketLocationCallback} [callback] Callback for location messages
 */
export async function connectWebsocket(callback, attempt = 0) {
  let url = getApiUrl("/ws/last");
  url.protocol = url.protocol.replace("http", "ws");
  url = url.href;
  const ws = new WebSocket(url);
  log("WS", `Connecting to ${url}`);

  let connected = false;
  ws.onopen = () => {
    connected = true;
    log("WS", "Connected");
    ws.send("LAST");
  };

  ws.onerror = () => {
    log("WS", "Connection error", LOG_ERROR);
  };

  ws.onclose = (event) => {
    const nextAttempt = connected ? 0 : attempt + 1;
    const delay = Math.min(1000 * Math.pow(2, nextAttempt), 30000);

    log(
      "WS",
      `Disconnected (reason: ${
        event.reason || "unknown"
      }). Reconnecting in ${delay / 1000}s.`,
      LOG_WARNING
    );
    setTimeout(() => connectWebsocket(callback, nextAttempt), delay);
  };

  ws.onmessage = async (msg) => {
    if (msg.data) {
      try {
        const data = JSON.parse(msg.data);
        if (data._type === "location") {
          if (!data.username || !data.device) {
            if (data.topic) {
              const parts = data.topic.split("/");
              // Assuming topic format: owntracks/username/device
              if (parts.length >= 3) {
                data.username = data.username || parts[parts.length - 2];
                data.device = data.device || parts[parts.length - 1];
              }
            } else if (data.tid) {
              // Fallback to tid if available and topic is missing
              data.username = data.username || data.tid;
              data.device = data.device || "device";
            }
          }
          log(
            "WS",
            `Location update received for ${data.username}/${data.device}`
          );
          callback && (await callback(data));
        }
      } catch (err) {
        if (msg.data !== "LAST") {
          log("WS", err, LOG_ERROR);
        }
      }
    } else {
      log("WS", "Ping");
    }
  };
}
