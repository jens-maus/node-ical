/* eslint-disable max-params */

import {randomUUID} from 'node:crypto';
import {RRuleTemporal} from 'rrule-temporal';
import {toText as toTextFunction} from 'rrule-temporal/totext';
import {getDateKey, localDate} from './lib/date-utils.js';
import {
  parseValue,
  finalizeEndedComponent,
  createTemporalRule,
  storeParameter,
  typeParameter,
  addTZFactory,
  createDateParameterFactory,
  createComponentParameterHandlers,
  createExdateParameterFactory,
} from './lib/ical-parser-utils.js';
import {Temporal} from './lib/temporal.js';
import tzUtil from './lib/tz-utils.js';
import {storeRecurrenceOverride} from './lib/uid-revision-merge.js';

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
    return typeof value === 'object' && !(value instanceof Date) && typeof value.epochMilliseconds === 'number' ? new Date(value.epochMilliseconds) : value;
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
      const d = localDate(zdt.year, zdt.month - 1, zdt.day);
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

// A content line: name, optional ;parameters and the value after the first unquoted colon
const CONTENT_LINE = /^((?:\w|-)+)((?:;(?:\w|-)+=(?:"[^"]*"|[^":;]+))*):(.*)$/v;

/**
 * Yield the lines of an iCalendar string one at a time, so parsing does not hold an array
 * of all lines next to the string. Lines end at LF, and a CR right before it belongs to the
 * line ending, as with `string.split(/\r?\n/)`.
 * @param {string} string - Raw iCalendar data
 * @yields {string} One line without its line ending
 */
function * splitLines(string) {
  let start = 0;
  let end = string.indexOf('\n');

  while (end !== -1) {
    const lineEnd = end > start && string[end - 1] === '\r' ? end - 1 : end;
    yield string.slice(start, lineEnd);
    start = end + 1;
    end = string.indexOf('\n', start);
  }

  yield string.slice(start);
}

/**
 * Yield the entries of a line array from a start index on.
 * @param {string[]} lines
 * @param {number} startIndex
 * @yields {string} One line
 */
function * linesFrom(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i++) {
    yield lines[i];
  }
}

/**
 * Join folded lines (RFC 5545 §3.1): a line starting with a space or tab continues the
 * previous one, without that first character.
 * @param {Iterable<string>} lines - Raw lines
 * @yields {string} One unfolded content line
 */
function * unfoldLines(lines) {
  let current;

  for (const line of lines) {
    if (current !== undefined && (line[0] === ' ' || line[0] === '\t')) {
      current += line.slice(1);
      continue;
    }

    if (current !== undefined) {
      yield current;
    }

    current = line;
  }

  if (current !== undefined) {
    yield current;
  }
}

/**
 * Parse one unfolded content line into the current component.
 * @param {object} parser - The ical object, for its handleObject()
 * @param {string} line - Unfolded content line
 * @param {object} ctx - Current component
 * @param {Array} stack - Parent components
 * @returns {object} The component to continue with
 */
function parseContentLine(parser, line, ctx, stack) {
  // Remove any double quotes in any tzid statement // except around (utc+hh:mm
  if (line.includes('TZID=') && !line.includes('"(')) {
    line = line.replaceAll('"', '');
  }

  const match = CONTENT_LINE.exec(line);
  if (match === null) {
    // Invalid line - must have k&v
    return ctx;
  }

  const [, name, parameterString, value] = match;
  const parameters = parameterString ? parameterString.split(';').slice(1) : [];

  return parser.handleObject(name, value, parameters, ctx, stack, line) || {};
}

function finishParsing(ctx) {
  delete ctx.type;
  delete ctx.params;
  return ctx;
}

/**
 * Parse content lines in one go.
 * @param {object} parser - The ical object
 * @param {Iterable<string>} contentLines - Unfolded content lines
 * @param {object} ctx - Starting component
 * @param {Array} stack - Parent components
 * @returns {object} Parsed calendar data
 */
function parseContentLines(parser, contentLines, ctx, stack) {
  for (const line of contentLines) {
    ctx = parseContentLine(parser, line, ctx, stack);
  }

  return finishParsing(ctx);
}

/**
 * Parse content lines in batches, yielding to the event loop between batches so a large
 * calendar does not block it. Errors reject the returned promise.
 * @param {object} parser - The ical object
 * @param {Iterable<string>} contentLines - Unfolded content lines
 * @param {number} batchSize - Content lines per batch
 * @param {object} ctx - Starting component
 * @param {Array} stack - Parent components
 * @returns {Promise<object>} Parsed calendar data
 */
async function parseContentLinesBatched(parser, contentLines, batchSize, ctx, stack) {
  let linesInBatch = 0;

  for (const line of contentLines) {
    if (linesInBatch === batchSize) {
      linesInBatch = 0;
      // eslint-disable-next-line no-await-in-loop -- yielding between batches is the point
      await new Promise(resolve => {
        setImmediate(resolve);
      });
    }

    ctx = parseContentLine(parser, line, ctx, stack);
    linesInBatch++;
  }

  return finishParsing(ctx);
}

/**
 * Report a parse result to a node-style callback: cb(null, data) or cb(error, {}).
 * The callback runs in its own microtask, so it is called exactly once and an error it
 * throws surfaces as an uncaught exception instead of a rejected promise.
 * @param {Promise<object>} parsing
 * @param {icsCallback} cb
 * @returns {void}
 */
function settleCallback(parsing, cb) {
  // The handlers only schedule the callback and cannot throw, so .catch() never sees
  // an error from the success path
  parsing
    .then(result => {
      queueMicrotask(() => {
        cb(null, result);
      });
    })
    .catch(error => {
      queueMicrotask(() => {
        cb(error, {});
      });
    });
}

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

        if (curr.start) {
          curr.rrule = createTemporalRule(curr, rule, {
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
        findLaterOccurrence: tzUtil.findLaterOccurrence,
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
   * @param {number} [startIndex=0] - Position in lines array to start at (internal)
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
    const contentLines = unfoldLines(linesFrom(lines, startIndex));

    if (batchSize > 0) {
      const parsing = parseContentLinesBatched(this, contentLines, batchSize, ctx, stack);
      if (cb) {
        settleCallback(parsing, cb);
      } else {
        // Without a callback nobody receives the result; still surface an error
        parsing.catch(error => {
          queueMicrotask(() => {
            throw error;
          });
        });
      }

      return;
    }

    let result;
    try {
      result = parseContentLines(this, contentLines, ctx, stack);
    } catch (error) {
      if (!cb) {
        throw error;
      }

      // Call the callback outside the try block so an error it throws is not reported to it
      cb(error, {});
      return;
    }

    if (cb) {
      cb(null, result);
      return;
    }

    return result;
  },

  /**
   * Parse an iCalendar string.
   * Lines are read from the string one at a time instead of splitting it into an array first.
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
    // Accept strings and String objects only, and fail like the former string.split() did
    // instead of reading a Buffer or an array as lines
    const text = string?.valueOf();
    if (typeof text !== 'string') {
      throw new TypeError(`parseICS() expects a string, got ${string === null ? 'null' : typeof string}; decode a Buffer with buffer.toString('utf8') first`);
    }

    const contentLines = unfoldLines(splitLines(text));

    if (cb) {
      // Async mode: start on the next turn of the event loop and parse in batches
      setImmediate(() => {
        settleCallback(parseContentLinesBatched(this, contentLines, PARSE_BATCH_SIZE, {}, []), cb);
      });
      return;
    }

    // Sync mode: parse all at once (no batching)
    return parseContentLines(this, contentLines, {}, []);
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
