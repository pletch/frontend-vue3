/**
 * Splitting a history request into successive date ranges.
 *
 * A single request for a long range returns nothing until the whole body has
 * arrived. Requesting the range in slices lets each one be rendered as it
 * lands, so the track draws progressively, while every slice is still decoded
 * by the native JSON parser.
 */

import moment from "moment";

import { DATE_TIME_FORMAT } from "@/constants";
import { Track } from "@/track";
import type { RawLocationHistory, TrackHistory } from "@/track";

/** One request covering part of a longer date range. */
export interface DateSlice {
  from: string;
  to: string;
}

/** A run of points appended to a track by a merge. */
export interface AppendedRange {
  track: Track;
  from: number;
  to: number;
}

/**
 * Split a date range into consecutive slices.
 *
 * Slices are returned oldest first and are contiguous: each one starts where
 * the previous ended, and the last ends exactly at `end`. When the range would
 * produce more than `maxSlices`, the slices are widened instead so that a very
 * long range cannot flood the recorder with requests.
 *
 * @param start Start date and time
 * @param end End date and time
 * @param days Slice length in days, 0 or less for a single slice
 * @param [maxSlices] Most slices to produce
 * @returns {Array<{from: String, to: String}>} Slices, oldest first
 */
export function buildDateSlices(
  start: string,
  end: string,
  days: number,
  maxSlices = 32
): DateSlice[] {
  const from = moment.utc(start, DATE_TIME_FORMAT, true);
  const to = moment.utc(end, DATE_TIME_FORMAT, true);
  const whole = [{ from: start, to: end }];

  if (!from.isValid() || !to.isValid() || !to.isAfter(from)) {
    return whole;
  }
  if (!days || days <= 0 || maxSlices <= 1) {
    return whole;
  }

  const totalMs = to.diff(from);
  const requested = days * 24 * 60 * 60 * 1000;
  // Widen rather than exceed the cap.
  const sliceMs = Math.max(requested, Math.ceil(totalMs / maxSlices));
  if (sliceMs >= totalMs) {
    return whole;
  }

  const slices: DateSlice[] = [];
  let cursor = from.clone();
  while (cursor.isBefore(to)) {
    const next = moment.min(cursor.clone().add(sliceMs, "milliseconds"), to);
    slices.push({
      from: cursor.format(DATE_TIME_FORMAT),
      to: next.format(DATE_TIME_FORMAT),
    });
    cursor = next;
  }

  return slices.length > 1 ? slices : whole;
}

/**
 * Merge a slice of history into an existing set of tracks.
 *
 * Slices arrive oldest first, so a slice's points belong after everything
 * already held for that device. Any points at or before the newest point
 * already held are dropped, which removes the duplicate that appears when the
 * recorder treats both ends of a range as inclusive.
 *
 * @param history Tracks keyed by user, then device, mutated in place
 * @param slice Raw history for the same devices, from the API
 * @returns {Array<{track: Track, from: Number, to: Number}>} Appended ranges
 */
export function mergeHistorySlice(
  history: TrackHistory,
  slice: RawLocationHistory
): AppendedRange[] {
  const ranges: AppendedRange[] = [];

  Object.keys(slice).forEach((user) => {
    if (!history[user]) {
      history[user] = {};
    }
    Object.keys(slice[user]).forEach((device) => {
      let track = history[user][device];
      if (!track) {
        track = new Track(user, device);
        history[user][device] = track;
      }

      // Captured before appending, so every point in this slice is compared
      // against what was held before it started.
      const lastTst = track.lastTst();
      const incoming = slice[user][device] || [];
      const from = track.length;

      track.reserve(track.length + incoming.length);
      for (let i = 0; i < incoming.length; i++) {
        if (incoming[i].tst > lastTst) {
          track.push(incoming[i]);
        }
      }

      if (track.length > from) {
        ranges.push({ track, from, to: track.length });
      }
    });
  });

  return ranges;
}
