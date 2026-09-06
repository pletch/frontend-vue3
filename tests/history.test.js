import { describe, expect, test } from "vitest";

import { buildDateSlices, mergeHistorySlice } from "@/history";

describe("buildDateSlices", () => {
  test("returns one slice when the range is shorter than a slice", () => {
    expect(
      buildDateSlices("2025-06-01T00:00:00", "2025-06-03T00:00:00", 7)
    ).toEqual([{ from: "2025-06-01T00:00:00", to: "2025-06-03T00:00:00" }]);
  });

  test("splits a longer range into contiguous slices", () => {
    const slices = buildDateSlices(
      "2025-06-01T00:00:00",
      "2025-06-29T00:00:00",
      7
    );

    expect(slices).toHaveLength(4);
    expect(slices[0].from).toBe("2025-06-01T00:00:00");
    expect(slices[slices.length - 1].to).toBe("2025-06-29T00:00:00");
    // Contiguous: no gaps and no overlap.
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].from).toBe(slices[i - 1].to);
    }
  });

  test("covers a range that is not a whole number of slices", () => {
    const slices = buildDateSlices(
      "2025-06-01T00:00:00",
      "2025-06-10T12:00:00",
      7
    );

    expect(slices).toHaveLength(2);
    expect(slices[0].to).toBe("2025-06-08T00:00:00");
    expect(slices[1].to).toBe("2025-06-10T12:00:00");
  });

  test("widens slices rather than exceeding maxSlices", () => {
    const slices = buildDateSlices(
      "2020-01-01T00:00:00",
      "2026-01-01T00:00:00",
      1,
      8
    );

    // Six years at one day each would be over 2000 requests.
    expect(slices.length).toBeLessThanOrEqual(8);
    expect(slices[0].from).toBe("2020-01-01T00:00:00");
    expect(slices[slices.length - 1].to).toBe("2026-01-01T00:00:00");
  });

  test("returns a single slice when slicing is disabled", () => {
    expect(
      buildDateSlices("2025-01-01T00:00:00", "2026-01-01T00:00:00", 0)
    ).toHaveLength(1);
    expect(
      buildDateSlices("2025-01-01T00:00:00", "2026-01-01T00:00:00", 7, 1)
    ).toHaveLength(1);
  });

  test("returns a single slice for invalid or inverted ranges", () => {
    expect(buildDateSlices("nonsense", "2026-01-01T00:00:00", 7)).toHaveLength(
      1
    );
    expect(
      buildDateSlices("2026-01-01T00:00:00", "2025-01-01T00:00:00", 7)
    ).toHaveLength(1);
  });
});

describe("mergeHistorySlice", () => {
  const loc = (tst) => ({ tst, lat: 1, lon: 2 });

  test("adds a device that was not present", () => {
    const history = {};
    const added = mergeHistorySlice(history, {
      alice: { phone: [loc(1), loc(2)] },
    });

    expect(history.alice.phone.map((l) => l.tst)).toEqual([1, 2]);
    expect(added).toHaveLength(2);
  });

  test("appends later points to an existing device", () => {
    const history = { alice: { phone: [loc(1), loc(2)] } };
    mergeHistorySlice(history, { alice: { phone: [loc(3), loc(4)] } });

    expect(history.alice.phone.map((l) => l.tst)).toEqual([1, 2, 3, 4]);
  });

  test("drops the duplicate at an inclusive slice boundary", () => {
    const history = { alice: { phone: [loc(1), loc(2)] } };
    const added = mergeHistorySlice(history, {
      alice: { phone: [loc(2), loc(3)] },
    });

    expect(history.alice.phone.map((l) => l.tst)).toEqual([1, 2, 3]);
    expect(added).toHaveLength(1);
    expect(added[0].location.tst).toBe(3);
  });

  test("ignores a slice that is entirely older than what is held", () => {
    const history = { alice: { phone: [loc(5), loc(6)] } };
    const added = mergeHistorySlice(history, {
      alice: { phone: [loc(1), loc(2)] },
    });

    expect(history.alice.phone.map((l) => l.tst)).toEqual([5, 6]);
    expect(added).toHaveLength(0);
  });

  test("keeps devices and users independent", () => {
    const history = { alice: { phone: [loc(1)] } };
    mergeHistorySlice(history, {
      alice: { phone: [loc(2)], tablet: [loc(1)] },
      bob: { watch: [loc(9)] },
    });

    expect(history.alice.phone.map((l) => l.tst)).toEqual([1, 2]);
    expect(history.alice.tablet.map((l) => l.tst)).toEqual([1]);
    expect(history.bob.watch.map((l) => l.tst)).toEqual([9]);
  });

  test("reports what it added, in order", () => {
    const history = {};
    const added = mergeHistorySlice(history, {
      alice: { phone: [loc(1), loc(2), loc(3)] },
    });

    expect(added.map((a) => a.location.tst)).toEqual([1, 2, 3]);
    expect(added.every((a) => a.user === "alice" && a.device === "phone")).toBe(
      true
    );
  });

  test("handles an empty slice", () => {
    const history = { alice: { phone: [loc(1)] } };
    expect(mergeHistorySlice(history, {})).toHaveLength(0);
    expect(history.alice.phone).toHaveLength(1);
  });
});
