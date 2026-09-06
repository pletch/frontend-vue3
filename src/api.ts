import config from "@/config";
import { log, LOG_WARNING, LOG_ERROR } from "@/logging";
import { getApiUrl } from "@/util";
import type { RawLocationHistory } from "@/track";

/** Progress reported as a response body arrives. Both counts are deltas. */
export interface FetchProgress {
  received: number;
  total: number;
  reliable: boolean;
}

/** Called as bytes arrive. */
export type ProgressCallback = (progress: FetchProgress) => void;

/** An API request that could not be completed. */
export class ApiError extends Error {
  /**
   * @param {String} message Human readable description
   * @param {Object} [details] Additional context
   * @param {String} [details.url] Requested URL
   * @param {Number} [details.status] HTTP status, if a response was received
   * @param {Error} [details.cause] Underlying error, if any
   */
  url?: string;
  status?: number;
  override cause?: unknown;

  constructor(
    message: string,
    {
      url,
      status,
      cause,
    }: { url?: string; status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.url = url;
    this.status = status;
    this.cause = cause;
  }
}

/**
 * Fetch an API resource.
 *
 * Rejects rather than resolving to `undefined` when the request fails, so that
 * callers cannot accidentally treat a failure as a response.
 *
 * @param path API resource path
 * @param [params] Query parameters
 * @param [fetchOptions]
 *   fetch() options (merged with config.api.fetchOptions)
 * @returns Response returned by the fetch call
 */
function fetchApi(
  path: string,
  params: Record<string, string> = {},
  fetchOptions: RequestInit = {}
): Promise<Response> {
  const url = getApiUrl(path);
  Object.keys(params).forEach((key) => url.searchParams.set(key, params[key]));
  log("HTTP", `GET ${url.href}`);
  return fetch(url.href, {
    ...fetchOptions,
    ...config.api.fetchOptions,
  });
}

/**
 * Fetch an API resource and decode it as JSON.
 *
 * Network failures, error statuses and malformed payloads are all surfaced as
 * an `ApiError`. Aborts are re-thrown unchanged so that callers can recognise
 * them by `error.name`.
 *
 * @param path API resource path
 * @param [params] Query parameters
 * @param [fetchOptions] fetch() options
 * @param [onProgress] Called as bytes arrive
 * @returns Decoded JSON body
 */
async function fetchJson(
  path: string,
  params: Record<string, string> = {},
  fetchOptions: RequestInit = {},
  onProgress?: ProgressCallback
): Promise<any> {
  const url = getApiUrl(path).href;
  let response;

  try {
    response = await fetchApi(path, params, fetchOptions);
  } catch (caught) {
    const error = caught as Error;
    if (error.name === "AbortError") {
      log("HTTP", `GET ${url} - Request was aborted`, LOG_WARNING);
      throw error;
    }
    log("HTTP", error, LOG_ERROR);
    throw new ApiError("Could not reach the OwnTracks recorder.", {
      url,
      cause: error,
    });
  }

  if (!response.ok) {
    log("HTTP", `GET ${url} - HTTP ${response.status}`, LOG_ERROR);
    throw new ApiError(
      `The OwnTracks recorder returned HTTP ${response.status}.`,
      { url, status: response.status }
    );
  }

  try {
    return onProgress
      ? await readJsonWithProgress(response, onProgress)
      : await response.json();
  } catch (caught) {
    const error = caught as Error;
    if (error.name === "AbortError") {
      throw error;
    }
    log("HTTP", error, LOG_ERROR);
    throw new ApiError("The OwnTracks recorder returned an invalid response.", {
      url,
      status: response.status,
      cause: error,
    });
  }
}

/**
 * Read a response body, reporting progress as bytes arrive, then decode it.
 *
 * A history request can take a long time on a large date range, and a spinner
 * says nothing about whether it is nearly done. Reading the body as a stream
 * lets us report actual progress.
 *
 * `Content-Length` describes the bytes on the wire while the stream yields
 * decoded bytes, so with compression enabled the total is an underestimate.
 * Rather than show a bar that races past 100%, the total is reported as
 * unknown once it is exceeded, and the UI falls back to showing the amount
 * received.
 *
 * @param response Response to read
 * @param onProgress Called with deltas as bytes arrive
 * @returns Decoded JSON body
 */
async function readJsonWithProgress(
  response: Response,
  onProgress: ProgressCallback
): Promise<any> {
  if (!response.body || typeof response.body.getReader !== "function") {
    // No streaming support: fall back to a plain read.
    return response.json();
  }

  const declared = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let announcedTotal = false;
  let reliable = Boolean(declared);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.length;
    if (declared && received > declared) {
      // More decoded bytes than the wire length, so the body was compressed
      // and the declared total is not a usable denominator.
      reliable = false;
    }
    // Both fields are deltas, so that a caller can aggregate across the
    // several requests that make up one load. The total is contributed once.
    onProgress({
      received: value.length,
      total: announcedTotal ? 0 : declared,
      reliable,
    });
    announcedTotal = true;
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(body));
}

/**
 * Get the recorder's version.
 *
 * @returns Version
 */
export async function getVersion(): Promise<string> {
  const json = await fetchJson("/api/0/version");
  const version = json.version;
  log("API", () => `[getVersion] ${version}`);
  return version;
}

/**
 * Get all users.
 *
 * @returns Array of usernames
 */
export async function getUsers(): Promise<User[]> {
  const json = await fetchJson("/api/0/list");
  const users = json.results;
  log("API", () => `[getUsers] Fetched ${users.length} users`);
  return users;
}

/**
 * Get all devices for the provided users.
 *
 * @param users Array of usernames
 * @returns {Promise<{User: Device[]}>}
 *   Object mapping each username to an array of device names
 */
export async function getDevices(
  users: User[]
): Promise<Record<User, Device[]>> {
  const devices: Record<User, Device[]> = {};
  await Promise.all(
    users.map(async (user) => {
      const json = await fetchJson(`/api/0/list`, { user });
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
 * @param [user] Get last locations of all devices from this user
 * @param [device] Get last location of specific device
 * @returns Array of last location objects
 */
export async function getLastLocations(
  user?: User | null,
  device?: Device | null
): Promise<OTLocation[]> {
  const params: Record<string, string> = {};
  if (user) {
    params["user"] = user;
    if (device) {
      params["device"] = device;
    }
  }
  const lastLocations = await fetchJson("/api/0/last", params);
  log(
    "API",
    () => `[getLastLocations] Fetched ${lastLocations.length} last locations`
  );
  return lastLocations;
}

/**
 * Get the location history of a specific user/device.
 *
 * @param user Username
 * @param device Device name
 * @param start Start date and time in UTC
 * @param end End date and time in UTC
 * @param [fetchOptions] fetch() options
 * @param [onProgress] Called as bytes arrive
 * @returns Array of location history objects
 */
export async function getUserDeviceLocationHistory(
  user: User,
  device: Device,
  start: string,
  end: string,
  fetchOptions?: RequestInit,
  onProgress?: ProgressCallback
): Promise<OTLocation[]> {
  const json = await fetchJson(
    "/api/0/locations",
    {
      from: start,
      to: end,
      user,
      device,
      format: "json",
    },
    fetchOptions,
    onProgress
  );
  // We need to manually sort by timestamp, otherwise the line segments may be
  // drawn in the wrong order. The recorder API simply returns entries in the
  // same order in which they are in each *.rec file.
  // See https://github.com/owntracks/frontend/issues/67.
  const userDeviceLocationHistory: OTLocation[] = json.data.sort(
    (a: OTLocation, b: OTLocation) => a.tst - b.tst
  );
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
 * @param start Start date and time in UTC
 * @param end End date and time in UTC
 * @param [fetchOptions] fetch() options
 * @param [onProgress] Called as bytes arrive
 * @returns Location history
 */
export async function getLocationHistory(
  devices: Record<User, Device[]>,
  start: string,
  end: string,
  fetchOptions?: RequestInit,
  onProgress?: ProgressCallback
): Promise<RawLocationHistory> {
  const locationHistory: RawLocationHistory = {};
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
            fetchOptions,
            onProgress
          );
        })
      );
    })
  );
  log("API", () => {
    const locationHistoryCount = Object.values(locationHistory)
      .flatMap((byDevice) => Object.values(byDevice))
      .reduce((total, locations) => total + locations.length, 0);
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
 * @param [callback] Callback for location messages
 */
export async function connectWebsocket(
  callback?: WebSocketLocationCallback,
  attempt = 0
): Promise<void> {
  const wsUrl = getApiUrl("/ws/last");
  wsUrl.protocol = wsUrl.protocol.replace("http", "ws");
  const url = wsUrl.href;
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
