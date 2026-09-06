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

/**
 * Split a date range into consecutive slices.
 *
 * Slices are returned oldest first and are contiguous: each one starts where
 * the previous ended, and the last ends exactly at `end`. When the range would
 * produce more than `maxSlices`, the slices are widened instead so that a very
 * long range cannot flood the recorder with requests.
 *
 * @param {String} start Start date and time
 * @param {String} end End date and time
 * @param {Number} days Slice length in days, 0 or less for a single slice
 * @param {Number} [maxSlices] Most slices to produce
 * @returns {Array<{from: String, to: String}>} Slices, oldest first
 */
export function buildDateSlices(start, end, days, maxSlices = 32) {
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

  const slices = [];
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
 * Merge a slice of history into an existing structure.
 *
 * Slices arrive oldest first, so a slice's points belong after everything
 * already held for that device. Any points at or before the newest point
 * already held are dropped, which removes the duplicate that appears when the
 * recorder treats both ends of a range as inclusive.
 *
 * @param {Object} history Existing history, mutated in place
 * @param {Object} slice Newly fetched history for the same devices
 * @returns {OTLocation[]} The locations that were actually added, in order
 */
export function mergeHistorySlice(history, slice) {
  const added = [];

  Object.keys(slice).forEach((user) => {
    if (!history[user]) {
      history[user] = {};
    }
    Object.keys(slice[user]).forEach((device) => {
      const existing = history[user][device] || [];
      const incoming = slice[user][device] || [];
      const lastTst = existing.length
        ? existing[existing.length - 1].tst
        : -Infinity;

      const fresh = incoming.filter((location) => location.tst > lastTst);
      if (fresh.length === 0) {
        history[user][device] = existing;
        return;
      }

      history[user][device] = existing.concat(fresh);
      fresh.forEach((location) => added.push({ user, device, location }));
    });
  });

  return added;
}
