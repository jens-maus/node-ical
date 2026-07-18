/* eslint-disable max-params */

import {randomUUID} from 'node:crypto';
import {RRuleTemporal} from 'rrule-temporal';
import {toText as toTextFunction} from 'rrule-temporal/totext';
import {getDateKey} from './lib/date-utils.js';
import {
  parseValue,
  finalizeEndedComponent,
  ensureRruleHasDtstart,
  buildRruleStringForTemporal,
  buildRruleCompatWrapper,
  storeParameter,
  typeParameter,
  addTZFactory,
  createDateParameterFactory,
  createComponentParameterHandlers,
  createExdateParameterFactory,
} from './lib/ical-parser-utils.js';
import {Temporal} from './lib/temporal.js';
import tzUtil from './lib/tz-utils.js';

/**
 * Store a recurrence override with dual-key strategy.
 * Uses both date-only (YYYY-MM-DD) and full ISO keys for DATE-TIME entries.
 * Implements RFC 5545 SEQUENCE logic: newer versions (higher SEQUENCE) replace older ones.
 * @param {object} recurrences - Recurrences object to store in
 * @param {Date} recurrenceId - RECURRENCE-ID date value
 * @param {object} recurrenceObject - Recurrence override data
 */
function storeRecurrenceOverride(recurrences, recurrenceId, recurrenceObject) {
  if (typeof recurrenceId.toISOString !== 'function') {
    console.warn(`[node-ical] Invalid recurrenceid (no toISOString): ${recurrenceId}`);
    return;
  }

  const dateKey = getDateKey(recurrenceId);
  const isoKey = recurrenceId.dateOnly === true ? null : recurrenceId.toISOString();

  // Check for existing override: prefer ISO key if available (more precise), fallback to date key
  // This handles both DATE-TIME (precise time) and DATE (date-only) recurrence IDs
  const existing = (isoKey && recurrences[isoKey]) || recurrences[dateKey];

  // Check SEQUENCE to determine which version to keep (RFC 5545)
  // Normalize SEQUENCE to number, default to 0 if invalid/missing
  if (existing !== undefined) {
    const existingSeq = Number.isFinite(existing.sequence) ? existing.sequence : 0;
    const newSeq = Number.isFinite(recurrenceObject.sequence) ? recurrenceObject.sequence : 0;

    if (newSeq < existingSeq) {
      // Older version - ignore it
      const key = isoKey || dateKey;
      console.warn(`[node-ical] Ignoring older RECURRENCE-ID override (SEQUENCE ${newSeq} < ${existingSeq}) for ${key}`);
      return;
    }
    // If newSeq >= existingSeq, continue and overwrite (newer or same version)
  }

  recurrences[dateKey] = recurrenceObject;

  // Also store with full ISO key for DATE-TIME entries (enables precise matching)
  if (isoKey) {
    recurrences[isoKey] = recurrenceObject;
  }
}

/**
 * Wrapper class to convert RRuleTemporal (Temporal.ZonedDateTime) to Date objects
 * This maintains backward compatibility while using rrule-temporal internally
 */
class RRuleCompatWrapper {
  static #temporalToDate(value) {
    if (value === undefined || value === null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => RRuleCompatWrapper.#temporalToDate(item));
    }

    // Convert known Temporal instances to Date
    if (typeof value === 'object' && !(value instanceof Date) && typeof value.epochMilliseconds === 'number') {
      return new Date(value.epochMilliseconds);
    }

    return value;
  }

  constructor(rruleTemporal, dateOnly = false) {
    this._rrule = rruleTemporal;
    // VALUE=DATE events are anchored to UTC midnight in rrule-temporal.
    // Converting via epochMilliseconds shifts the date backwards in timezones
    // west of UTC; instead we use the ZonedDateTime calendar components directly.
    this._dateOnly = dateOnly;
  }

  #serializeOptions() {
    const raw = this._rrule.options();
    const converted = {};

    for (const [key, value] of Object.entries(raw)) {
      converted[key] = RRuleCompatWrapper.#temporalToDate(value);
    }

    // Map rrule-temporal `byDay` to legacy `byweekday`
    if (converted.byweekday === undefined && raw.byDay !== undefined) {
      converted.byweekday = RRuleCompatWrapper.#temporalToDate(raw.byDay);
    }

    return converted;
  }

  // Convert a ZonedDateTime to a JS Date.
  // For VALUE=DATE events the ZDT calendar components (year/month/day in UTC)
  // represent the intended calendar date; create a local-midnight Date so that
  // .toDateString() returns the correct day regardless of the host timezone.
  // Mark the result with dateOnly=true so that downstream helpers that
  // distinguish date-only from timed dates (e.g. createLocalDateFromUTC) also
  // use local getters rather than UTC getters.
  #zdtToDate(zdt) {
    if (this._dateOnly) {
      const d = new Date(zdt.year, zdt.month - 1, zdt.day, 0, 0, 0, 0);
      d.dateOnly = true;
      return d;
    }

    return new Date(zdt.epochMilliseconds);
  }

  between(after, before, inclusive = false) {
    const results = this._rrule.between(after, before, inclusive);
    return results.map(zdt => this.#zdtToDate(zdt));
  }

  all(iterator) {
    // If the caller supplied an iterator, wrap it so it receives a converted Date
    // rather than a raw Temporal.ZonedDateTime — keeping the public API consistent
    // with between() and matching the declared return type.
    const wrappedIterator = iterator
      ? (zdt, index) => iterator(this.#zdtToDate(zdt), index)
      : undefined;
    const results = this._rrule.all(wrappedIterator);
    return results.map(zdt => this.#zdtToDate(zdt));
  }

  before(date, inclusive = false) {
    const result = this._rrule.previous(date, inclusive);
    return result ? this.#zdtToDate(result) : undefined;
  }

  after(date, inclusive = false) {
    const result = this._rrule.next(date, inclusive);
    return result ? this.#zdtToDate(result) : undefined;
  }

  toText(locale) {
    return toTextFunction(this._rrule, locale);
  }

  // Delegate other methods
  toString() {
    return this._rrule.toString();
  }

  // Expose options as a property for compatibility with the old rrule.js API
  // (the wrapper hides the underlying method-based interface)
  get options() {
    return this.#serializeOptions();
  }

  // OrigOptions: the original options as passed to the constructor (before processing).
  // In rrule.js, this was used for toString() and clone() operations.
  // For rrule-temporal, options() already returns the unprocessed original options,
  // so origOptions and options are equivalent.
  get origOptions() {
    return this.#serializeOptions();
  }
}

/**
 *  A tolerant, minimal icalendar parser
 *  (https://tools.ietf.org/html/rfc5545)
 *
 *  <peterbraden@peterbraden.co.uk>
 */

const addTZ = addTZFactory(tzUtil.attachTz);
const dateParameter = createDateParameterFactory({
  addTZ,
  tzUtil,
});

const {
  geoParameter,
  categoriesParameter,
  recurrenceParameter,
  freebusyParameter,
} = createComponentParameterHandlers({
  dateParameter,
  utcAdd: tzUtil.utcAdd,
});

const exdateParameter = createExdateParameterFactory({
  dateParameter,
  getDateKey,
});

// EXDATE is an entry that represents exceptions to a recurrence rule (ex: "repeat every day except on 7/4").
// The EXDATE entry itself can also contain a comma-separated list, so we parse each date separately.
// Multiple EXDATE entries can exist in a calendar record.
//
// Storage strategy (RFC 5545 compliant):
// We create an object with the exception dates as keys and Date objects as values.
// - For VALUE=DATE (date-only): key is "YYYY-MM-DD"
// - For DATE-TIME: BOTH "YYYY-MM-DD" AND full ISO string keys are created
//
// This dual-key approach provides:
// 1. Backward compatibility: date-only lookups continue to work
// 2. Precision matching: events recurring multiple times per day can exclude specific instances
// 3. RFC 5545 compliance: supports both DATE and DATE-TIME exclusions
//
// Usage examples:
//   if (event.exdate?.['2024-01-15']) { ... }              // Check if any instance on this day is excluded
//   if (event.exdate?.['2024-01-15T14:00:00.000Z']) { ... } // Check specific time instance
//
// NOTE: We intentionally use date-based keys as the primary lookup because:
//   1. Floating times (without timezone) would create inconsistent ISO strings
//   2. DST transitions can affect exact time matching
//   3. Real-world calendar data often has mismatched times between RRULE and EXDATE
// Default batch size for async parsing to prevent event loop blocking
const PARSE_BATCH_SIZE = 2000;

const ical = {
  objectHandlers: {
    BEGIN(component, parameters, curr, stack) {
      stack.push(curr);

      return {type: component};
    },
    END(value, parameters, curr, stack) {
      // Recurrence rules are only valid for VEVENT, VTODO, and VJOURNAL.
      // More specifically, we need to filter the VCALENDAR type because we might end up with a defined rrule
      // due to the subtypes.

      if (['VEVENT', 'VTODO', 'VJOURNAL'].includes(value) && curr.rrule) {
        let rule = curr.rrule.replace('RRULE:', '');
        // Make sure the rrule starts with FREQ=
        rule = rule.slice(rule.lastIndexOf('FREQ='));
        rule = ensureRruleHasDtstart(rule, curr, tzUtil).replace(/\.\d{3}/v, '');

        // Create RRuleTemporal with separate DTSTART and RRULE parameters
        if (curr.start) {
          const rruleOnly = buildRruleStringForTemporal(rule, curr.start, tzUtil);
          curr.rrule = buildRruleCompatWrapper(curr, rruleOnly, {
            RRuleTemporal,
            RRuleCompatWrapper,
            Temporal,
            tzUtil,
          });
        }
      }

      return finalizeEndedComponent(value, curr, stack, {
        storeRecurrenceOverride,
        randomIdFactory: randomUUID,
        utcAdd: tzUtil.utcAdd,
      });
    },
    SUMMARY: storeParameter('summary'),
    DESCRIPTION: storeParameter('description'),
    URL: storeParameter('url'),
    UID: storeParameter('uid'),
    LOCATION: storeParameter('location'),
    DTSTART(value, parameters, curr, stack, line) {
      // If already defined, this is a duplicate for this event
      if (curr.start === undefined) {
        curr = dateParameter('start')(value, parameters, curr, stack);
        return typeParameter('datetype')(value, parameters, curr);
      }

      throw new Error('duplicate DTSTART encountered, line=' + line);
    },
    DTEND(value, parameters, curr, stack, line) {
      // If already defined, this is a duplicate for this event
      if (curr.end === undefined) {
        return dateParameter('end')(value, parameters, curr, stack);
      }

      throw new Error('duplicate DTEND encountered, line=' + line);
    },
    DUE(value, parameters, curr, stack, line) {
      // If already defined, this is a duplicate for this event
      if (curr.due === undefined) {
        return dateParameter('due')(value, parameters, curr, stack);
      }

      throw new Error('duplicate DUE encountered, line=' + line);
    },
    EXDATE: exdateParameter('exdate'),
    CLASS: storeParameter('class'),
    TRANSP: storeParameter('transparency'),
    GEO: geoParameter('geo'),
    'PERCENT-COMPLETE': storeParameter('completion'),
    COMPLETED: dateParameter('completed'),
    CATEGORIES: categoriesParameter('categories'),
    FREEBUSY: freebusyParameter('freebusy'),
    DTSTAMP: dateParameter('dtstamp'),
    CREATED: dateParameter('created'),
    'LAST-MODIFIED': dateParameter('lastmodified'),
    'RECURRENCE-ID': recurrenceParameter('recurrenceid'),
    SEQUENCE(value, parameters, curr) {
      curr.sequence = parseValue(value);
      return curr;
    },
    RRULE(value, parameters, curr, stack, line) {
      curr.rrule = line;
      return curr;
    },
  },

  handleObject(name, value, parameters, ctx, stack, line) {
    if (Object.hasOwn(this.objectHandlers, name)) {
      return this.objectHandlers[name](value, parameters, ctx, stack, line);
    }

    // Handling custom properties
    if (/X-(?:\w|-)+/v.test(name) && stack.length > 0) {
      // Trimming the leading and perform storeParam
      name = name.slice(2);
      return storeParameter(name)(value, parameters, ctx, stack, line);
    }

    return storeParameter(name.toLowerCase())(value, parameters, ctx);
  },

  /**
   * Parse iCalendar lines into a structured object.
   * Supports both sync and async (batched) modes.
   *
   * @param {string[]} lines - Array of iCalendar lines
   * @param {number} [batchSize=0] - Lines per batch (0=sync mode, >0=async batching)
   * @param {object} [ctx] - Context object (internal, created if not provided)
   * @param {Array} [stack] - Parser stack for nested components (internal)
   * @param {number} [startIndex=0] - Current position in lines array (internal)
   * @param {icsCallback} [cb] - Callback for async mode: cb(error, data)
   * @returns {object | undefined} Parsed calendar data (sync mode), undefined (async mode with callback)
   *
   * @example
   * // Sync mode (no batching)
   * const data = parseLines(lines);
   *
   * @example
   * // Async mode (with batching)
   * parseLines(lines, 2000, undefined, undefined, 0, (err, data) => { ... });
   */
  parseLines(lines, batchSize = 0, ctx, stack, startIndex = 0, cb) {
    ctx ||= {};
    stack ||= [];

    let parseError = null;
    let parseResult = null;

    try {
      const endIndex = batchSize > 0 ? Math.min(startIndex + batchSize, lines.length) : lines.length;

      for (let i = startIndex; i < endIndex; i++) {
        let l = lines[i];
        // Unfold : RFC#3.1
        let nextLine = lines[i + 1];
        while (typeof nextLine === 'string' && /[\t ]/v.test(nextLine[0])) {
          l += nextLine.slice(1);
          i++;
          nextLine = lines[i + 1];
        }

        // Remove any double quotes in any tzid statement // except around (utc+hh:mm
        if (l.includes('TZID=') && !l.includes('"(')) {
          l = l.replaceAll('"', '');
        }

        const exp = /^((?:\w|-)+)((?:;(?:\w|-)+=(?:"[^"]*"|[^":;]+))*):(.*)$/v;
        let kv = l.match(exp);

        if (kv === null) {
          // Invalid line - must have k&v
          continue;
        }

        kv = kv.slice(1);

        const value = kv.at(-1);
        const name = kv[0];
        const parameters = kv[1] ? kv[1].split(';').slice(1) : [];

        ctx = this.handleObject(name, value, parameters, ctx, stack, l) || {};
      }

      // Check if more batches needed
      if (batchSize > 0 && endIndex < lines.length) {
        // Async mode: schedule next batch
        setImmediate(() => {
          this.parseLines(lines, batchSize, ctx, stack, endIndex, cb);
        });
        return; // Exit early, callback will be invoked by recursive call
      }

      // Finished parsing - prepare result
      delete ctx.type;
      delete ctx.params;
      parseResult = ctx;
    } catch (error) {
      parseError = error;
    }

    // Call callback outside try-catch to prevent double-calling if cb throws
    if (cb) {
      if (parseError) {
        cb(parseError, {});
      } else {
        cb(null, parseResult);
      }
    } else if (parseError) {
      throw parseError;
    } else {
      return parseResult;
    }
  },

  /**
   * Parse an iCalendar string.
   *
   * @param {string} string - Raw iCalendar data (ICS format)
   * @param {icsCallback} [cb] - Optional callback for async mode: cb(error, data)
   * @returns {object | undefined} Parsed calendar data (sync) or undefined (async)
   *
   * @example
   * // Synchronous parsing
   * const data = ical.parseICS(icsString);
   *
   * @example
   * // Asynchronous parsing with callback
   * ical.parseICS(icsString, (err, data) => {
   *   if (err) console.error(err);
   *   else console.log(data);
   * });
   *
   * @todo for v1.0: Split into separate parseICS() (sync) and parseICSAsync() (Promise-based) functions.
   * The current dual-mode API (sync if no callback, async if callback) is an anti-pattern that
   * makes the function behavior unpredictable and harder to type correctly in TypeScript.
   */
  parseICS(string, cb) {
    const lines = string.split(/\r?\n/v);

    if (cb) {
      // Async mode: use batching to prevent event loop blocking
      setImmediate(() => {
        this.parseLines(lines, PARSE_BATCH_SIZE, undefined, undefined, 0, cb);
      });
    } else {
      // Sync mode: parse all at once (no batching)
      return this.parseLines(lines);
    }
  },
};

const {objectHandlers} = ical;
const handleObject = ical.handleObject.bind(ical);
const parseLines = ical.parseLines.bind(ical);
const parseICS = ical.parseICS.bind(ical);

export {
  objectHandlers,
  handleObject,
  parseLines,
  parseICS,
};
export default ical;
