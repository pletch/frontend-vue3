import { afterEach, beforeEach, describe, expect, test } from "vitest";

import config from "@/config";
import {
  buildUserColorMap,
  degreesToRadians,
  distanceBetweenCoordinates,
  getApiUrl,
  getUserColor,
  getUserColorPalette,
  humanReadableAltitude,
  humanReadableBytes,
  humanReadableDistance,
  humanReadableSpeed,
  isIsoDateTime,
} from "@/util";

describe("getApiUrl", () => {
  test("without base URL", () => {
    // See testURL in jest.config.js
    expect(getApiUrl("foo").href).toBe("http://localhost:3000/foo");
    expect(getApiUrl("/foo").href).toBe("http://localhost:3000/foo");
    expect(getApiUrl("/foo/bar").href).toBe("http://localhost:3000/foo/bar");
  });

  test("with base URL", () => {
    config.api.baseUrl = "http://example.com/owntracks";
    expect(getApiUrl("foo").href).toBe("http://example.com/owntracks/foo");
    expect(getApiUrl("/foo").href).toBe("http://example.com/owntracks/foo");
    expect(getApiUrl("/foo/bar").href).toBe(
      "http://example.com/owntracks/foo/bar"
    );

    config.api.baseUrl = "http://example.com/owntracks/";
    expect(getApiUrl("foo").href).toBe("http://example.com/owntracks/foo");
    expect(getApiUrl("/foo").href).toBe("http://example.com/owntracks/foo");
    expect(getApiUrl("/foo/bar").href).toBe(
      "http://example.com/owntracks/foo/bar"
    );
  });
});

describe("isIsoDateTime", () => {
  test("no match", () => {
    expect(isIsoDateTime("foo")).toBe(false);
    expect(isIsoDateTime("2019")).toBe(false);
    expect(isIsoDateTime("2019-09")).toBe(false);
    expect(isIsoDateTime("2019.09.27")).toBe(false);
    expect(isIsoDateTime("2019_09_27")).toBe(false);
    expect(isIsoDateTime("2019/09/27")).toBe(false);
    expect(isIsoDateTime("27-09-2019")).toBe(false);
    expect(isIsoDateTime("27.09.2019")).toBe(false);
    expect(isIsoDateTime("27_09_2019")).toBe(false);
    expect(isIsoDateTime("27/09/2019")).toBe(false);
    expect(isIsoDateTime("0000-00-00")).toBe(false);
    expect(isIsoDateTime("1234-56-78")).toBe(false);
    expect(isIsoDateTime("0000-00-00T00:00:00")).toBe(false);
    expect(isIsoDateTime("0000-01-01T25:60:60")).toBe(false);
    expect(isIsoDateTime("2019-12-14T99:00:00")).toBe(false);
    expect(isIsoDateTime("2019-12-14 25:60:60")).toBe(false);
  });

  test("match", () => {
    expect(isIsoDateTime("0000-01-01T00:00:00")).toBe(true);
    expect(isIsoDateTime("0000-01-01T12:34:56")).toBe(true);
    expect(isIsoDateTime("0000-01-01T23:59:59")).toBe(true);
    expect(isIsoDateTime("2019-09-27T00:00:00")).toBe(true);
    expect(isIsoDateTime("2019-09-27T12:34:56")).toBe(true);
    expect(isIsoDateTime("2019-09-27T23:59:59")).toBe(true);
    expect(isIsoDateTime("9999-12-31T00:00:00")).toBe(true);
    expect(isIsoDateTime("9999-12-31T12:34:56")).toBe(true);
    expect(isIsoDateTime("9999-12-31T23:59:59")).toBe(true);
  });
});

describe("degreesToRadians", () => {
  test("expected results", () => {
    expect(degreesToRadians(0)).toBe(0);
    expect(degreesToRadians(45)).toBe(0.7853981633974483);
    expect(degreesToRadians(90)).toBe(1.5707963267948966);
    expect(degreesToRadians(180)).toBe(3.141592653589793);
    expect(degreesToRadians(360)).toBe(6.283185307179586);
    expect(degreesToRadians(-180)).toBe(-3.141592653589793);
  });
});

describe("distanceBetweenCoordinates", () => {
  test("expected results", () => {
    expect(
      distanceBetweenCoordinates({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })
    ).toBe(0);

    // The Shard - Victoria Memorial
    expect(
      distanceBetweenCoordinates(
        { lat: 51.5046678, lng: -0.0870769 },
        { lat: 51.501752, lng: -0.1408258 }
      )
      // 3.74km according to Google Maps
    ).toBe(3734.3632679046705);

    // Gatwick Airport - Heathrow Airport
    expect(
      distanceBetweenCoordinates(
        { lat: 51.1526929, lng: -0.1752475 },
        { lat: 51.4720694, lng: -0.4499871 }
      )
      // 40km according to Google Maps
    ).toBe(40321.457586930104);

    // Berlin - San Francisco
    expect(
      distanceBetweenCoordinates(
        { lat: 52.5067614, lng: 13.284651 },
        { lat: 37.7576948, lng: -122.4726193 }
      )
      // 9,102.73km according to Google Maps
    ).toBe(9105627.810109457);
  });
});

describe("humanReadableDistance", () => {
  /** @type {Config["units"]} */
  let originalUnits;
  beforeEach(() => {
    originalUnits = config.units;
    config.units = "metric";
  });
  afterEach(() => {
    config.units = originalUnits;
  });

  test("metric", () => {
    expect(humanReadableDistance(0)).toBe("0 m");
    expect(humanReadableDistance(1)).toBe("1 m");
    expect(humanReadableDistance(123)).toBe("123 m");
    expect(humanReadableDistance(123.4567)).toBe("123.5 m");
    expect(humanReadableDistance(999)).toBe("999 m");
    expect(humanReadableDistance(1000)).toBe("1 km");
    expect(humanReadableDistance(9000)).toBe("9 km");
    expect(humanReadableDistance(9900)).toBe("9.9 km");
    expect(humanReadableDistance(9990)).toBe("10 km");
    expect(humanReadableDistance(9999)).toBe("10 km");
    expect(humanReadableDistance(9999.0)).toBe("10 km");
    expect(humanReadableDistance(9999.9999)).toBe("10 km");
    expect(humanReadableDistance(100000)).toBe("100 km");
    expect(humanReadableDistance(-42)).toBe("-42 m");
  });

  test("imperial", () => {
    config.units = "imperial";
    expect(humanReadableDistance(0)).toBe("0 ft");
    // 1 m ≈ 3.28 ft → rounds to "3 ft"
    expect(humanReadableDistance(1)).toBe("3 ft");
    // 1609.344 m = 1 mi exactly
    expect(humanReadableDistance(1609.344)).toBe("1 mi");
    // Just under a mile stays in ft
    expect(humanReadableDistance(1609)).toBe("5,279 ft");
    // 10 km ≈ 6.2 mi
    expect(humanReadableDistance(10000)).toBe("6.2 mi");
    expect(humanReadableDistance(100000)).toBe("62.1 mi");
    // Negative distances keep their sign and switch correctly
    expect(humanReadableDistance(-100)).toBe("-328 ft");
  });

  test("auto-derives imperial from en-US locale when units unset", () => {
    config.units = null;
    // setup uses en-US, so this should fall back to imperial
    expect(humanReadableDistance(0)).toBe("0 ft");
  });
});

describe("humanReadableSpeed", () => {
  /** @type {Config["units"]} */
  let originalUnits;
  beforeEach(() => {
    originalUnits = config.units;
  });
  afterEach(() => {
    config.units = originalUnits;
  });

  test("metric", () => {
    config.units = "metric";
    expect(humanReadableSpeed(0)).toBe("0 km/h");
    expect(humanReadableSpeed(50)).toBe("50 km/h");
    expect(humanReadableSpeed(50.27)).toBe("50.3 km/h");
  });

  test("imperial", () => {
    config.units = "imperial";
    expect(humanReadableSpeed(0)).toBe("0 mph");
    // 100 km/h ≈ 62.1 mph
    expect(humanReadableSpeed(100)).toBe("62.1 mph");
    expect(humanReadableSpeed(1)).toBe("0.6 mph");
  });
});

describe("humanReadableAltitude", () => {
  /** @type {Config["units"]} */
  let originalUnits;
  beforeEach(() => {
    originalUnits = config.units;
  });
  afterEach(() => {
    config.units = originalUnits;
  });

  test("metric stays in meters even for large values", () => {
    config.units = "metric";
    expect(humanReadableAltitude(0)).toBe("0 m");
    expect(humanReadableAltitude(100)).toBe("100 m");
    expect(humanReadableAltitude(8848)).toBe("8,848 m");
  });

  test("imperial stays in feet even for large values", () => {
    config.units = "imperial";
    // 100 m ≈ 328 ft
    expect(humanReadableAltitude(100)).toBe("328 ft");
    // 8848 m ≈ 29029 ft (Everest)
    expect(humanReadableAltitude(8848)).toBe("29,029 ft");
  });
});

describe("buildUserColorMap", () => {
  test("gives every user a distinct colour up to the palette size", () => {
    const palette = getUserColorPalette();
    const users = palette.map((_, i) => `user${i}`);
    const colors = buildUserColorMap(users);

    expect(colors.size).toBe(users.length);
    expect(new Set(colors.values()).size).toBe(palette.length);
  });

  test("is independent of the order users are given in", () => {
    const forwards = buildUserColorMap(["alice", "bob", "carol"]);
    const backwards = buildUserColorMap(["carol", "bob", "alice"]);

    ["alice", "bob", "carol"].forEach((user) => {
      expect(forwards.get(user)).toBe(backwards.get(user));
    });
  });

  test("wraps around beyond the palette size", () => {
    const palette = getUserColorPalette();
    const users = [...Array(palette.length + 3)].map((_, i) => `u${i}`);
    const colors = buildUserColorMap(users);

    expect(colors.size).toBe(users.length);
    expect(new Set(colors.values()).size).toBe(palette.length);
  });

  test("ignores empty entries", () => {
    // Deliberately ragged input, as a roster from the API can be.
    const roster = /** @type {User[]} */ (
      /** @type {unknown} */ (["alice", null, "", undefined])
    );
    expect(buildUserColorMap(roster).size).toBe(1);
  });

  test("handles an empty roster", () => {
    expect(buildUserColorMap([]).size).toBe(0);
  });
});

describe("getUserColor", () => {
  test("is stable for the same name", () => {
    expect(getUserColor("alice")).toBe(getUserColor("alice"));
  });

  test("returns a palette colour", () => {
    expect(getUserColorPalette()).toContain(getUserColor("alice"));
  });

  test("falls back to a colour for a missing user", () => {
    expect(getUserColorPalette()).toContain(getUserColor(null));
  });
});

describe("humanReadableBytes", () => {
  test("formats zero and negatives", () => {
    expect(humanReadableBytes(0)).toBe("0 B");
    expect(humanReadableBytes(-1)).toBe("0 B");
  });

  test("formats bytes, kB, MB and GB", () => {
    expect(humanReadableBytes(512)).toBe("512 B");
    expect(humanReadableBytes(2048)).toBe("2.0 kB");
    expect(humanReadableBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(humanReadableBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  test("drops the decimal for larger values", () => {
    expect(humanReadableBytes(45 * 1024 ** 2)).toBe("45 MB");
  });
});
