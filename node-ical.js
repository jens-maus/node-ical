const fs = require('node:fs');
const ical = require('./ical.js');
const {getDateKey} = require('./lib/date-utils.js');

/**
 * ICal event object.
 *
 * These two fields are always present:
 *  - type
 *  - params
 *
 * The rest of the fields may or may not be present depending on the input.
 * Do not assume any of these fields are valid and check them before using.
 * Most types are simply there as a general guide for IDEs and users.
 *
 * @typedef iCalEvent
 * @type {object}
 *
 * @property {string} type           - Type of event.
 * @property {Array} params          - Extra event parameters.
 *
 * @property {?object} start         - When this event starts.
 * @property {?object} end           - When this event ends.
 *
 * @property {?string} summary       - Event summary string.
 * @property {?string} description   - Event description.
 *
 * @property {?object} dtstamp       - DTSTAMP field of this event.
 *
 * @property {?object} created       - When this event was created.
 * @property {?object} lastmodified  - When this event was last modified.
 *
 * @property {?string} uid           - Unique event identifier.
 *
 * @property {?string} status        - Event status.
 *
 * @property {?string} sequence      - Event sequence.
 *
 * @property {?string} url           - URL of this event.
 *
 * @property {?string} location      - Where this event occurs.
 * @property {?{
 *     lat: number, lon: number
 * }} geo                            - Lat/lon location of this event.
 *
 * @property {?Array.<string>}       - Array of event catagories.
 */
/**
 * Object containing iCal events.
 * @typedef {Object.<string, iCalEvent>} iCalData
 */
/**
 * Callback for iCal parsing functions with error and iCal data as a JavaScript object.
 * @callback icsCallback
 * @param {Error} err
 * @param {iCalData} ics
 */
/**
 * A Promise that is undefined if a compatible callback is passed.
 * @typedef {(Promise.<iCalData>|undefined)} optionalPromise
 */

// utility to allow callbacks to be used for promises
function promiseCallback(fn, cb) {
  const promise = new Promise(fn);
  if (!cb) {
    return promise;
  }

  // Store result/error outside .then/.catch to avoid double-callback
  // if the user's callback throws (the thrown error would be caught by
  // the promise chain and trigger .catch, calling cb a second time)
  let callbackError = null;
  let callbackResult = null;
  let hasResult = false;

  promise
    .then(returnValue => {
      callbackResult = returnValue;
      hasResult = true;
    })
    .catch(error => {
      callbackError = error;
    })
    .finally(() => {
      if (callbackError) {
        cb(callbackError, null);
      } else if (hasResult) {
        cb(null, callbackResult);
      }
    });
}

// Sync functions
const sync = {};
// Async functions
const async = {};
// Auto-detect functions for backwards compatibility.
const autodetect = {};

/**
 * Download an iCal file from the web and parse it.
 *
 * @param {string} url                - URL of file to request.
 * @param {Object|icsCallback} [opts] - Options to pass to fetch(). Supports headers and any standard RequestInit fields.
 *                                      Alternatively you can pass the callback function directly.
 *                                      If no callback is provided a promise will be returned.
 * @param {icsCallback} [cb]          - Callback function.
 *                                      If no callback is provided a promise will be returned.
 *
 * @returns {optionalPromise} Promise is returned if no callback is passed.
 */
async.fromURL = function (url, options, cb) {
  // Normalize overloads: (url, cb) or (url, options, cb)
  if (typeof options === 'function' && cb === undefined) {
    cb = options;
    options = undefined;
  }

  return promiseCallback((resolve, reject) => {
    const fetchOptions = (options && typeof options === 'object') ? {...options} : {};

    fetch(url, fetchOptions)
      .then(response => {
        if (!response.ok) {
          // Mimic previous error style
          throw new Error(`${response.status} ${response.statusText}`);
        }

        return response.text();
      })
      .then(data => {
        ical.parseICS(data, (error, ics) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(ics);
        });
      })
      .catch(error => {
        reject(error);
      });
  }, cb);
};

/**
 * Load iCal data from a file and parse it.
 *
 * @param {string} filename   - File path to load.
 * @param {icsCallback} [cb]  - Callback function.
 *                              If no callback is provided a promise will be returned.
 *
 * @returns {optionalPromise} Promise is returned if no callback is passed.
 */
async.parseFile = function (filename, cb) {
  return promiseCallback((resolve, reject) => {
    fs.readFile(filename, 'utf8', (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      ical.parseICS(data, (error, ics) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(ics);
      });
    });
  }, cb);
};

/**
 * Parse iCal data from a string.
 *
 * @param {string} data       - String containing iCal data.
 * @param {icsCallback} [cb]  - Callback function.
 *                              If no callback is provided a promise will be returned.
 *
 * @returns {optionalPromise} Promise is returned if no callback is passed.
 */
async.parseICS = function (data, cb) {
  return promiseCallback((resolve, reject) => {
    ical.parseICS(data, (error, ics) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(ics);
    });
  }, cb);
};

/**
 * Load iCal data from a file and parse it.
 *
 * @param {string} filename   - File path to load.
 *
 * @returns {iCalData} Parsed iCal data.
 */
sync.parseFile = function (filename) {
  const data = fs.readFileSync(filename, 'utf8');
  return ical.parseICS(data);
};

/**
 * Parse iCal data from a string.
 *
 * @param {string} data - String containing iCal data.
 *
 * @returns {iCalData} Parsed iCal data.
 */
sync.parseICS = function (data) {
  return ical.parseICS(data);
};

/**
 * Load iCal data from a file and parse it.
 *
 * @param {string} filename   - File path to load.
 * @param {icsCallback} [cb]  - Callback function.
 *                              If no callback is provided this function runs synchronously.
 *
 * @returns {iCalData|undefined} Parsed iCal data or undefined if a callback is being used.
 */
autodetect.parseFile = function (filename, cb) {
  if (!cb) {
    return sync.parseFile(filename);
  }

  async.parseFile(filename, cb);
};

/**
 * Parse iCal data from a string.
 *
 * @param {string} data       - String containing iCal data.
 * @param {icsCallback} [cb]  - Callback function.
 *                              If no callback is provided this function runs synchronously.
 *
 * @returns {iCalData|undefined} Parsed iCal data or undefined if a callback is being used.
 */
autodetect.parseICS = function (data, cb) {
  if (!cb) {
    return sync.parseICS(data);
  }

  async.parseICS(data, cb);
};

/**
 * Generate date key for EXDATE/RECURRENCE-ID lookups from an RRULE-generated date.
 * RRULE-generated dates carry no .tz or .dateOnly metadata, so isFullDay must be
 * passed explicitly to decide between local-time and UTC-based key extraction.
 * (For parsed calendar dates that carry .tz/.dateOnly, use getDateKey directly.)
 * @param {Date} date - RRULE-generated Date (no .tz, no .dateOnly)
 * @param {boolean} isFullDay
 * @returns {string} Date key in YYYY-MM-DD format
 */
function generateDateKey(date, isFullDay) {
  if (isFullDay) {
    // Full-day events: use local getters — RRULE returns local-midnight dates
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Timed events: UTC date portion
  return date.toISOString().slice(0, 10);
}

/**
 * Copy timezone metadata (tz, dateOnly) from source Date to target Date.
 * @param {Date} target - Target Date object to copy metadata to
 * @param {Date} source - Source Date object to copy metadata from
 * @returns {Date} Target Date with copied metadata
 */
function copyDateMeta(target, source) {
  if (source?.tz) {
    target.tz = source.tz;
  }

  if (source?.dateOnly) {
    target.dateOnly = source.dateOnly;
  }

  return target;
}

/**
 * Create date from UTC components to avoid DST issues for full-day events.
 * This ensures that a DATE value of 20250107 stays as January 7th regardless of timezone.
 * For dateOnly events, uses local components (DATE values are timezone-independent).
 * @param {Date} utcDate - Date from RRULE (UTC midnight) or dateOnly event
 * @returns {Date} Date representing the same calendar day at local midnight
 */
function createLocalDateFromUTC(utcDate) {
  // For DATE-only events (dateOnly flag set), use local components
  // because DATE values represent calendar dates, not moments in time.
  // This prevents timezone-shift issues (e.g., 20260227 in CET being
  // stored as 2026-02-26T23:00:00Z and then wrongly extracted as Feb 26)
  if (utcDate?.dateOnly) {
    const year = utcDate.getFullYear();
    const month = utcDate.getMonth();
    const day = utcDate.getDate();
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  // For regular full-day events from RRULE (no dateOnly flag),
  // extract UTC components to create the local date
  const year = utcDate.getUTCFullYear();
  const month = utcDate.getUTCMonth();
  const day = utcDate.getUTCDate();
  // Create date at midnight in local timezone with same calendar day
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Get event duration in milliseconds.
 * @param {object} eventData - The event data (original or override)
 * @param {boolean} isFullDay - Whether this is a full-day event
 * @returns {number} Duration in milliseconds
 */
function getEventDurationMs(eventData, isFullDay) {
  if (eventData?.start && eventData?.end) {
    return new Date(eventData.end).getTime() - new Date(eventData.start).getTime();
  }

  if (isFullDay) {
    return 24 * 60 * 60 * 1000;
  }

  return 0;
}

/**
 * Calculate end time for an event instance
 * @param {Date} start - The start time of this specific instance
 * @param {object} eventData - The event data (original or override)
 * @param {boolean} isFullDay - Whether this is a full-day event
 * @param {number} [baseDurationMs] - Base duration (used when override lacks end)
 * @returns {Date} End time for this instance
 */
function calculateEndTime(start, eventData, isFullDay, baseDurationMs) {
  const durationMs = (eventData?.start && eventData?.end)
    ? getEventDurationMs(eventData, isFullDay)
    : (baseDurationMs ?? (isFullDay ? 24 * 60 * 60 * 1000 : 0));

  return new Date(start.getTime() + durationMs);
}

/**
 * Process a non-recurring event
 * @param {object} event
 * @param {object} options
 * @returns {Array} Array of event instances
 */
function processNonRecurringEvent(event, options) {
  const {from, to, expandOngoing} = options;
  const isFullDay = event.datetype === 'date' || Boolean(event.start?.dateOnly);
  const baseDurationMs = getEventDurationMs(event, isFullDay);

  // Ensure we have a proper Date object
  let eventStart = event.start instanceof Date ? event.start : new Date(event.start);

  // For full-day events, normalize to local calendar date to avoid timezone shifts
  if (isFullDay) {
    eventStart = createLocalDateFromUTC(eventStart);
  }

  const eventEnd = calculateEndTime(eventStart, event, isFullDay, baseDurationMs);

  // Check if event is within range
  const inRange = expandOngoing
    ? (eventEnd >= from && eventStart <= to)
    : (eventStart >= from && eventStart <= to);

  if (!inRange) {
    return [];
  }

  const instance = {
    start: eventStart,
    end: eventEnd,
    summary: event.summary || '',
    isFullDay,
    isRecurring: false,
    isOverride: false,
    event,
  };

  // Preserve timezone metadata
  copyDateMeta(instance.start, event.start);
  copyDateMeta(instance.end, event.end);

  return [instance];
}

/**
 * Process a recurring event instance
 * @param {Date} date
 * @param {object} event
 * @param {object} options
 * @param {number} baseDurationMs
 * @returns {object|null} Event instance or null if excluded
 */
function processRecurringInstance(date, event, options, baseDurationMs) {
  const {excludeExdates, includeOverrides} = options;
  const isFullDay = event.datetype === 'date' || Boolean(event.start?.dateOnly);

  // Generate date key for lookups
  const dateKey = generateDateKey(date, isFullDay);

  // Check EXDATE exclusions
  if (excludeExdates && event.exdate) {
    if (isFullDay) {
      // Full-day: compare by calendar date using timezone-aware formatting
      // (e.g., Exchange/O365 stores EXDATE as DATE-TIME with timezone, so we need
      // to extract the calendar date in the EXDATE's timezone, not host-local time)
      for (const exdateValue of Object.values(event.exdate)) {
        if (!(exdateValue instanceof Date)) {
          continue;
        }

        if (getDateKey(exdateValue) === dateKey) {
          return null;
        }
      }
    } else if (event.exdate[dateKey]) {
      return null;
    }
  }

  // Check for RECURRENCE-ID override
  let instanceEvent = event;
  let isOverride = false;

  if (includeOverrides && event.recurrences && event.recurrences[dateKey]) {
    instanceEvent = event.recurrences[dateKey];
    isOverride = true;
  }

  // Calculate start time for this instance
  let start = date;

  // If override has its own DTSTART, use that instead of the RRULE-generated date
  if (isOverride && instanceEvent.start) {
    start = instanceEvent.start instanceof Date ? instanceEvent.start : new Date(instanceEvent.start);
  }

  // For full-day events, extract UTC components to avoid DST issues
  if (isFullDay) {
    start = createLocalDateFromUTC(start);
  }

  // For recurring events, use override duration when available; otherwise use base duration
  const end = calculateEndTime(start, instanceEvent, isFullDay, baseDurationMs);

  const instance = {
    start,
    end,
    summary: instanceEvent.summary || event.summary || '',
    isFullDay,
    isRecurring: true,
    isOverride,
    event: instanceEvent,
  };

  // Preserve timezone metadata
  copyDateMeta(instance.start, isOverride ? instanceEvent.start : event.start);
  copyDateMeta(instance.end, instanceEvent.end || event.end);

  return instance;
}

/**
 * Check if an event instance is within the specified date range
 * @param {object} instance - Event instance with start, end, isFullDay
 * @param {Date} from - Range start
 * @param {Date} to - Range end
 * @param {boolean} expandOngoing - Whether to include ongoing events
 * @returns {boolean} Whether instance is in range
 */
function isInstanceInRange(instance, from, to, expandOngoing) {
  if (instance.isFullDay) {
    // For full-day events, compare calendar dates only (ignore time component)
    const instanceDate = new Date(instance.start.getFullYear(), instance.start.getMonth(), instance.start.getDate());
    const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const instanceEndDate = new Date(instance.end.getFullYear(), instance.end.getMonth(), instance.end.getDate());

    return expandOngoing
      ? (instanceEndDate >= fromDate && instanceDate <= toDate)
      : (instanceDate >= fromDate && instanceDate <= toDate);
  }

  // For timed events: use exact timestamp comparison
  return expandOngoing
    ? (instance.end >= from && instance.start <= to)
    : (instance.start >= from && instance.start <= to);
}

/**
 * Expand a recurring event into individual instances within a date range.
 * Handles RRULE expansion, EXDATE filtering, and RECURRENCE-ID overrides.
 * Also works for non-recurring events (returns single instance if within range).
 *
 * @param {object} event - The VEVENT object (with or without rrule)
 * @param {object} options - Expansion options
 * @param {Date} options.from - Start of date range (inclusive)
 * @param {Date} options.to - End of date range (inclusive)
 * @param {boolean} [options.includeOverrides=true] - Apply RECURRENCE-ID overrides
 * @param {boolean} [options.excludeExdates=true] - Filter out EXDATE exclusions
 * @param {boolean} [options.expandOngoing=false] - Include events that started before range but still ongoing
 * @returns {Array<{start: Date, end: Date, summary: string, isFullDay: boolean, isRecurring: boolean, isOverride: boolean, event: object}>} Sorted array of event instances
 */
function expandRecurringEvent(event, options) {
  const {
    from,
    to,
    includeOverrides = true,
    excludeExdates = true,
    expandOngoing = false,
  } = options;

  // Input validation
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
    throw new TypeError('options.from must be a valid Date object');
  }

  if (!(to instanceof Date) || Number.isNaN(to.getTime())) {
    throw new TypeError('options.to must be a valid Date object');
  }

  if (from > to) {
    throw new RangeError('options.from must be before or equal to options.to');
  }

  // Handle non-recurring events
  if (!event.rrule) {
    return processNonRecurringEvent(event, {from, to, expandOngoing});
  }

  // Handle recurring events
  const isFullDay = event.datetype === 'date' || Boolean(event.start?.dateOnly);
  const baseDurationMs = getEventDurationMs(event, isFullDay);

  // For full-day events, adjust 'to' to end of day to ensure RRULE includes the full day
  // in all timezones (otherwise timezone offset can truncate the last day)
  let searchTo = to;
  if (isFullDay && to.getHours() === 0 && to.getMinutes() === 0 && to.getSeconds() === 0) {
    searchTo = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
  }

  // For expandOngoing, look back by the event duration to capture ongoing instances
  const searchFrom = expandOngoing ? new Date(from.getTime() - baseDurationMs) : from;
  const dates = event.rrule.between(searchFrom, searchTo, true);
  const instances = [];

  for (const date of dates) {
    const instance = processRecurringInstance(date, event, {excludeExdates, includeOverrides}, baseDurationMs);
    if (instance && isInstanceInRange(instance, from, to, expandOngoing)) {
      instances.push(instance);
    }
  }

  return instances.sort((a, b) => a.start - b.start);
}

// Export api functions
module.exports = {
  // Autodetect
  fromURL: async.fromURL,
  parseFile: autodetect.parseFile,
  parseICS: autodetect.parseICS,
  // Sync
  sync,
  // Async
  async,
  // Recurring event expansion
  expandRecurringEvent,
  // Other backwards compat things
  objectHandlers: ical.objectHandlers,
  handleObject: ical.handleObject,
  parseLines: ical.parseLines,
};
