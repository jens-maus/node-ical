import {Temporal} from './temporal.js';
import tzUtil from './tz-utils.js';

/**
 * Construct a date-only key (YYYY-MM-DD) from a Date object.
 * For date-only events, uses local date components to avoid timezone shifts.
 * For date-time events with a timezone, uses Temporal to extract the calendar date
 * in the original timezone (avoids UTC shift, e.g. Exchange O365 RECURRENCE-ID
 * midnight-CET becoming previous day in UTC – see GitHub issue #459).
 * For date-time events without timezone, extracts the date from the ISO timestamp.
 * @param {Date} dateValue - Date object with optional dateOnly and tz properties
 * @returns {string} Date key in YYYY-MM-DD format
 */
function getDateKey(dateValue) {
  if (dateValue.dateOnly) {
    return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`;
  }

  // When the Date carries timezone metadata, extract the calendar date in that timezone.
  // This prevents midnight-in-local-tz (e.g. 00:00 CET = 23:00 UTC the day before)
  // from being mapped to the wrong calendar day.
  // Temporal handles both IANA zones and fixed-offset strings (e.g. "+01:00") uniformly.
  if (dateValue.tz) {
    try {
      const resolved = tzUtil.resolveTZID(dateValue.tz);
      const tzId = resolved?.iana || resolved?.offset;
      if (resolved && !tzId) {
        console.warn(
          '[node-ical] Could not resolve TZID to an IANA name or UTC offset; falling back to UTC-based date key.',
          {tzid: dateValue.tz, resolved},
        );
      }

      if (tzId) {
        return Temporal.Instant.fromEpochMilliseconds(dateValue.getTime())
          .toZonedDateTimeISO(tzId)
          .toPlainDate()
          .toString();
      }
    } catch (error) {
      console.warn(`[node-ical] Failed to resolve timezone for date key (TZID="${dateValue.tz}"), falling back to UTC: ${error?.message ?? String(error)}`);
    }
  }

  return dateValue.toISOString().slice(0, 10);
}

/**
 * Construct a local date without the Date constructor's 1900 offset for years 0-99.
 * @param {number} year
 * @param {number} month - Zero-based month
 * @param {number} day
 * @param {number} [hour]
 * @param {number} [minute]
 * @param {number} [second]
 * @param {number} [millisecond]
 * @returns {Date} Calendar fields interpreted in the host timezone
 */
function localDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(hour, minute, second, millisecond);
  return date;
}

/**
 * Construct a UTC timestamp without remapping years 0-99.
 * @param {number} year
 * @param {number} month - Zero-based month
 * @param {number} day
 * @param {number} [hour]
 * @param {number} [minute]
 * @param {number} [second]
 * @param {number} [millisecond]
 * @returns {number} Epoch milliseconds
 */
function utcDateMs(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

export {getDateKey, localDate, utcDateMs};
