/* eslint-disable max-depth, max-params, no-warning-comments, complexity, import-x/order */

const {randomUUID} = require('node:crypto');

// Load Temporal polyfill if not natively available
// TODO: Drop the polyfill branch once our minimum Node version ships Temporal
const Temporal = globalThis.Temporal || require('@js-temporal/polyfill').Temporal;
// Ensure Temporal exists before loading rrule-temporal
globalThis.Temporal ??= Temporal;

const {RRuleTemporal} = require('rrule-temporal');
const {toText: toTextFunction} = require('rrule-temporal/totext');
const tzUtil = require('./tz-utils.js');

/**
 * Construct a date-only key (YYYY-MM-DD) from a Date object.
 * For date-only events, uses local date components to avoid timezone shifts.
 * For date-time events, extracts the date portion from the ISO timestamp.
 * @param {Date} dateValue - Date object with optional dateOnly property
 * @returns {string} Date key in YYYY-MM-DD format
 */
const getDateKey = function (dateValue) {
  if (dateValue.dateOnly) {
    return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`;
  }

  return dateValue.toISOString().slice(0, 10);
};

/**
 * Wrapper class to convert RRuleTemporal (Temporal.ZonedDateTime) to Date objects
 * This maintains backward compatibility while using rrule-temporal internally
 */
class RRuleCompatWrapper {
  constructor(rruleTemporal) {
    this._rrule = rruleTemporal;
  }

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

  between(after, before, inclusive = false) {
    const results = this._rrule.between(after, before, inclusive);
    // Convert Temporal.ZonedDateTime → Date
    return results.map(zdt => new Date(zdt.epochMilliseconds));
  }

  all(iterator) {
    const results = this._rrule.all(iterator);
    return results.map(zdt => new Date(zdt.epochMilliseconds));
  }

  before(date, inclusive = false) {
    const result = this._rrule.before(date, inclusive);
    return result ? new Date(result.epochMilliseconds) : null;
  }

  after(date, inclusive = false) {
    const result = this._rrule.after(date, inclusive);
    return result ? new Date(result.epochMilliseconds) : null;
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

/** **************
 *  A tolerant, minimal icalendar parser
 *  (http://tools.ietf.org/html/rfc5545)
 *
 *  <peterbraden@peterbraden.co.uk>
 * ************* */

// Unescape Text re RFC 4.3.11
const text = function (t = '') {
  return t
    .replaceAll(String.raw`\,`, ',') // Unescape escaped commas
    .replaceAll(String.raw`\;`, ';') // Unescape escaped semicolons
    .replaceAll(/\\[nN]/g, '\n') // Replace escaped newlines with actual newlines
    .replaceAll('\\\\', '\\') // Unescape backslashes
    .replace(/^"(.*)"$/, '$1'); // Remove surrounding double quotes, if present
};

const parseValue = function (value) {
  if (value === 'TRUE') {
    return true;
  }

  if (value === 'FALSE') {
    return false;
  }

  const number = Number(value);
  if (!Number.isNaN(number)) {
    return number;
  }

  // Remove quotes if found
  value = value.replace(/^"(.*)"$/, '$1');

  return value;
};

const parseParameters = function (p) {
  const out = {};
  for (const element of p) {
    if (element.includes('=')) {
      const segs = element.split('=');

      out[segs[0]] = parseValue(segs.slice(1).join('='));
    }
  }

  // Sp is not defined in this scope, typo?
  // original code from peterbraden
  // return out || sp;
  return out;
};

const storeValueParameter = function (name) {
  return function (value, curr) {
    const current = curr[name];

    if (Array.isArray(current)) {
      current.push(value);
      return curr;
    }

    curr[name] = current === undefined ? value : [current, value];

    return curr;
  };
};

const storeParameter = function (name) {
  return function (value, parameters, curr) {
    const data = parameters && parameters.length > 0 && !(parameters.length === 1 && (parameters[0] === 'CHARSET=utf-8' || parameters[0] === 'VALUE=TEXT')) ? {params: parseParameters(parameters), val: text(value)} : text(value);

    return storeValueParameter(name)(data, curr);
  };
};

const addTZ = function (dt, parameters) {
  if (!dt) {
    return dt;
  }

  const p = parseParameters(parameters);
  if (parameters && p && p.TZID !== undefined) {
    let tzid = p.TZID.toString();
    // Remove surrounding quotes if found at the beginning and at the end of the string
    // (Occurs when parsing Microsoft Exchange events containing TZID with Windows standard format instead IANA)
    tzid = tzid.replace(/^"(.*)"$/, '$1');
    return tzUtil.attachTz(dt, tzid);
  }

  if (dt.tz) {
    return tzUtil.attachTz(dt, dt.tz);
  }

  return dt;
};

function isDateOnly(value, parameters) {
  const dateOnly = ((parameters && parameters.includes('VALUE=DATE') && !parameters.includes('VALUE=DATE-TIME')) || /^\d{8}$/.test(value) === true);
  return dateOnly;
}

const typeParameter = function (name) {
  // Typename is not used in this function?
  return function (value, parameters, curr) {
    const returnValue = isDateOnly(value, parameters) ? 'date' : 'date-time';
    return storeValueParameter(name)(returnValue, curr);
  };
};

const dateParameter = function (name) {
  return function (value, parameters, curr, stack) {
    // The regex from main gets confused by extra :
    const pi = parameters.indexOf('TZID=tzone');
    if (pi !== -1) {
      // Correct the parameters with the part on the value
      parameters[pi] = parameters[pi] + ':' + value.split(':')[0];
      // Get the date from the field, other code uses the value parameter
      value = value.split(':')[1];
    }

    let newDate = text(value);

    // Process 'VALUE=DATE' and EXDATE
    if (isDateOnly(value, parameters)) {
      // Just Date

      const comps = /^(\d{4})(\d{2})(\d{2}).*$/.exec(value);
      if (comps !== null) {
        // No TZ info - assume same timezone as this computer
        newDate = new Date(comps[1], Number.parseInt(comps[2], 10) - 1, comps[3]);

        newDate.dateOnly = true;

        // Store as string - worst case scenario
        return storeValueParameter(name)(newDate, curr);
      }
    }

    // Typical RFC date-time format
    const comps = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
    if (comps !== null) {
      const year = Number.parseInt(comps[1], 10);
      const monthIndex = Number.parseInt(comps[2], 10) - 1;
      const day = Number.parseInt(comps[3], 10);
      const hour = Number.parseInt(comps[4], 10);
      const minute = Number.parseInt(comps[5], 10);
      const second = Number.parseInt(comps[6], 10);

      if (comps[7] === 'Z') {
        // GMT
        newDate = new Date(Date.UTC(year, monthIndex, day, hour, minute, second));
        tzUtil.attachTz(newDate, 'Etc/UTC');
      } else {
        const fallbackWithStackTimezone = () => {
          // Get the time zone from the stack
          const stackItemWithTimeZone
            = (stack || []).find(item => Object.values(item).find(subItem => subItem.type === 'VTIMEZONE')) || {};
          const vTimezone
            = Object.values(stackItemWithTimeZone).find(({type}) => type === 'VTIMEZONE');

          // If the VTIMEZONE contains multiple TZIDs (against RFC), use last one
          const normalizedTzId = vTimezone
            ? (Array.isArray(vTimezone.tzid) ? vTimezone.tzid.at(-1) : vTimezone.tzid)
            : null;

          if (!normalizedTzId) {
            return new Date(year, monthIndex, day, hour, minute, second);
          }

          const tzInfo = tzUtil.resolveTZID(normalizedTzId);
          const offsetString = typeof tzInfo.offset === 'string' ? tzInfo.offset : undefined;
          if (offsetString) {
            return tzUtil.parseWithOffset(value, offsetString);
          }

          if (tzInfo.iana) {
            return tzUtil.parseDateTimeInZone(value, tzInfo.iana);
          }

          return new Date(year, monthIndex, day, hour, minute, second);
        };

        if (parameters) {
          const parameterMap = parseParameters(parameters);
          let tz = parameterMap.TZID;

          const findTZIDIndex = () => {
            if (!Array.isArray(parameters)) {
              return -1;
            }

            return parameters.findIndex(parameter => typeof parameter === 'string' && parameter.toUpperCase().startsWith('TZID='));
          };

          let tzParameterIndex = findTZIDIndex();
          const setTZIDParameter = newTZID => {
            if (!Array.isArray(parameters)) {
              return;
            }

            const normalized = 'TZID=' + newTZID;
            if (tzParameterIndex >= 0) {
              parameters[tzParameterIndex] = normalized;
            } else {
              parameters.push(normalized);
              tzParameterIndex = parameters.length - 1;
            }
          };

          if (tz) {
            tz = tz.toString().replace(/^"(.*)"$/, '$1');

            if (tz === 'tzone://Microsoft/Custom' || tz === '(no TZ description)' || tz.startsWith('Customized Time Zone') || tz.startsWith('tzone://Microsoft/')) {
              tz = tzUtil.guessLocalZone();
            }

            const tzInfo = tzUtil.resolveTZID(tz);
            const resolvedTZID = tzInfo.iana || tzInfo.original || tz;
            setTZIDParameter(resolvedTZID);

            // Prefer an explicit numeric offset because it keeps DTSTART wall-time semantics accurate across DST transitions.
            const offsetString = typeof tzInfo.offset === 'string' ? tzInfo.offset : undefined;
            if (offsetString) {
              newDate = tzUtil.parseWithOffset(value, offsetString);
            } else if (tzInfo.iana) {
              newDate = tzUtil.parseDateTimeInZone(value, tzInfo.iana);
            } else {
              newDate = new Date(year, monthIndex, day, hour, minute, second);
            }

            // Make sure to correct the parameters if the TZID= is changed
            newDate = addTZ(newDate, parameters);
          } else {
            newDate = fallbackWithStackTimezone();
          }
        } else {
          newDate = fallbackWithStackTimezone();
        }
      }
    }

    // Store as string - worst case scenario
    return storeValueParameter(name)(newDate, curr);
  };
};

const geoParameter = function (name) {
  return function (value, parameters, curr) {
    storeParameter(value, parameters, curr);
    const parts = value.split(';');
    curr[name] = {lat: Number(parts[0]), lon: Number(parts[1])};
    return curr;
  };
};

const categoriesParameter = function (name) {
  return function (value, parameters, curr) {
    storeParameter(value, parameters, curr);
    if (curr[name] === undefined) {
      curr[name] = value ? value.split(',').map(s => s.trim()) : [];
    } else if (value) {
      curr[name] = curr[name].concat(value.split(',').map(s => s.trim()));
    }

    return curr;
  };
};

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
const exdateParameter = function (name) {
  return function (value, parameters, curr) {
    curr[name] ||= {};
    const dates = value ? value.split(',').map(s => s.trim()) : [];

    for (const entry of dates) {
      // Temporary container for dateParameter() to write to
      const temporaryContainer = {};
      dateParameter(name)(entry, parameters, temporaryContainer);

      const dateValue = temporaryContainer[name];
      if (!dateValue) {
        continue;
      }

      if (typeof dateValue.toISOString !== 'function') {
        console.warn(`[node-ical] Invalid exdate value (no toISOString): ${dateValue}`);
        continue;
      }

      const isoString = dateValue.toISOString();

      // For date-only events, use local date components to avoid UTC timezone shift
      // (e.g., 2024-07-15 midnight in UTC+2 would be 2024-07-14T22:00Z, giving wrong dateKey)
      const dateKey = getDateKey(dateValue);

      // Always store with date-only key for backward compatibility and simple lookups
      curr[name][dateKey] = dateValue;

      // For DATE-TIME entries, also store with full ISO string for precise matching
      // This enables excluding specific instances when events recur multiple times per day
      // Note: dateOnly is already set by dateParameter() which checks the raw value and parameters
      if (!dateValue.dateOnly) {
        curr[name][isoString] = dateValue;
      }
    }

    return curr;
  };
};

// RECURRENCE-ID is the ID of a specific recurrence within a recurrence rule.
// TODO:  It's also possible for it to have a range, like "THISANDPRIOR", "THISANDFUTURE".  This isn't currently handled.
const recurrenceParameter = function (name) {
  return dateParameter(name);
};

const addFBType = function (fb, parameters) {
  const p = parseParameters(parameters);

  if (parameters && p) {
    fb.type = p.FBTYPE || 'BUSY';
  }

  return fb;
};

const freebusyParameter = function (name) {
  return function (value, parameters, curr) {
    const fb = addFBType({}, parameters);
    curr[name] ||= [];
    curr[name].push(fb);

    storeParameter(value, parameters, fb);

    const parts = value.split('/');

    for (const [index, name] of ['start', 'end'].entries()) {
      dateParameter(name)(parts[index], parameters, fb);
    }

    return curr;
  };
};

module.exports = {
  objectHandlers: {
    BEGIN(component, parameters, curr, stack) {
      stack.push(curr);

      return {type: component, params: parameters};
    },
    END(value, parameters, curr, stack) {
      // Original end function
      const originalEnd = function (component, parameters_, curr, stack) {
        // Prevents the need to search the root of the tree for the VCALENDAR object
        if (component === 'VCALENDAR') {
          // Scan all high level object in curr and drop all strings
          let key;
          let object;
          const highLevel = {};

          for (key in curr) {
            if (!Object.hasOwn(curr, key)) {
              continue;
            }

            object = curr[key];
            if (typeof object === 'string') {
              highLevel[key] = object;
              delete curr[key];
            }
          }

          if (highLevel.type) {
            curr[highLevel.type.toLowerCase()] = highLevel;
          }

          return curr;
        }

        const par = stack.pop();

        if (!curr.end) { // RFC5545, 3.6.1
          // Set the end according to the datetype of event
          curr.end = (curr.datetype === 'date-time') ? new Date(curr.start) : tzUtil.utcAdd(curr.start, 1, 'days');

          // If there was a duration specified
          // see RFC5545, 3.3.6 (no year and month)
          if (curr.duration !== undefined) {
            const durationUnits
            = {
              W: 'weeks',
              D: 'days',
              H: 'hours',
              M: 'minutes',
              S: 'seconds',
            };
            // Get the list of duration elements
            const duration = curr.duration.match(/-?\d{1,10}[WDHMS]/g);
            if (!duration || duration.length === 0) {
              throw new Error('Invalid DURATION format: ' + curr.duration);
            }

            // Use the duration to create the end value, from the start
            let newEnd = curr.start;

            // Is the 1st character a negative sign?
            const indicator = curr.duration.startsWith('-') ? -1 : 1;

            for (const r of duration) {
              const unit = r.slice(-1);
              if (!durationUnits[unit]) {
                throw new Error(`Invalid duration unit: ${unit}`);
              }

              newEnd = tzUtil.utcAdd(newEnd, Number.parseInt(r, 10) * indicator, durationUnits[r.toString().slice(-1)]);
            }

            // End is a Date type, not moment
            curr.end = new Date(newEnd);
          }
        }

        if (curr.uid) {
          // If this is the first time we run into this UID, just save it.
          if (par[curr.uid] === undefined) {
            par[curr.uid] = curr;

            if (par.method) { // RFC5545, 3.2
              par[curr.uid].method = par.method;
            }
          } else if (curr.recurrenceid === undefined) {
            // If we have multiple ical entries with the same UID, it's either going to be a
            // modification to a recurrence (RECURRENCE-ID), and/or a significant modification
            // to the entry (SEQUENCE).

            // TODO: Look into proper sequence logic.

            // If we have the same UID as an existing record, and it *isn't* a specific recurrence ID,
            // not quite sure what the correct behaviour should be.  For now, just take the new information
            // and merge it with the old record by overwriting only the fields that appear in the new record.
            let key;
            for (key in curr) {
              if (key !== null) {
                par[curr.uid][key] = curr[key];
              }
            }
          }

          // If we have recurrence-id entries, list them as an array of recurrences keyed off of recurrence-id.
          // To use - as you're running through the dates of an rrule, you can try looking it up in the recurrences
          // array.  If it exists, then use the data from the calendar object in the recurrence instead of the parent
          // for that day.

          // NOTE:  Sometimes the RECURRENCE-ID record will show up *before* the record with the RRULE entry.  In that
          // case, what happens is that the RECURRENCE-ID record ends up becoming both the parent record and an entry
          // in the recurrences array, and then when we process the RRULE entry later it overwrites the appropriate
          // fields in the parent record.

          if (curr.recurrenceid !== undefined) {
            // TODO:  Is there ever a case where we have to worry about overwriting an existing entry here?

            // Create a copy of the current object to save in our recurrences array.  (We *could* just do par = curr,
            // except for the case that we get the RECURRENCE-ID record before the RRULE record.  In that case, we
            // would end up with a shared reference that would cause us to overwrite *both* records at the point
            // that we try and fix up the parent record.)
            const recurrenceObject = {};
            let key;
            for (key in curr) {
              if (key !== null) {
                recurrenceObject[key] = curr[key];
              }
            }

            if (recurrenceObject.recurrences !== undefined) {
              delete recurrenceObject.recurrences;
            }

            // If we don't have an array to store recurrences in yet, create it.
            if (par[curr.uid].recurrences === undefined) {
              par[curr.uid].recurrences = {};
            }

            // Store the recurrence override with dual-key strategy (same as EXDATE):
            // - Date-only key (YYYY-MM-DD) for simple lookups
            // - Full ISO string for precise matching when multiple instances occur per day
            if (typeof curr.recurrenceid.toISOString === 'function') {
              const isoString = curr.recurrenceid.toISOString();

              // For date-only events, use local date components to avoid UTC timezone shift
              const dateKey = getDateKey(curr.recurrenceid);

              // Primary key: date-only for backward compatibility
              par[curr.uid].recurrences[dateKey] = recurrenceObject;

              // Additional key: full timestamp for events recurring multiple times per day
              // Note: dateOnly is already set by dateParameter()
              if (!curr.recurrenceid.dateOnly) {
                par[curr.uid].recurrences[isoString] = recurrenceObject;
              }
            } else {
              console.warn(`[node-ical] No toISOString function in recurrenceid: ${curr.recurrenceid}`);
              // Skip malformed recurrence-id entries to avoid storing invalid keys
            }
          }

          // One more specific fix - in the case that an RRULE entry shows up after a RECURRENCE-ID entry,
          // let's make sure to clear the recurrenceid off the parent field.
          if (curr.uid !== '__proto__'
            && par[curr.uid].rrule !== undefined
            && par[curr.uid].recurrenceid !== undefined) {
            delete par[curr.uid].recurrenceid;
          }
        } else if (component === 'VALARM' && (par.type === 'VEVENT' || par.type === 'VTODO')) {
          par.alarms ??= [];
          par.alarms.push(curr);
        } else {
          const id = randomUUID();
          par[id] = curr;

          if (par.method) { // RFC5545, 3.2
            par[id].method = par.method;
          }
        }

        return par;
      };

      // Recurrence rules are only valid for VEVENT, VTODO, and VJOURNAL.
      // More specifically, we need to filter the VCALENDAR type because we might end up with a defined rrule
      // due to the subtypes.

      if ((value === 'VEVENT' || value === 'VTODO' || value === 'VJOURNAL') && curr.rrule) {
        let rule = curr.rrule.replace('RRULE:', '');
        // Make sure the rrule starts with FREQ=
        rule = rule.slice(rule.lastIndexOf('FREQ='));
        // If no rule start date
        if (rule.includes('DTSTART') === false) {
          // This a whole day event
          if (curr.datetype === 'date') {
            const originalStart = curr.start;
            // Get the timezone offset
            // The internal date is stored in UTC format
            const offset = originalStart.getTimezoneOffset();
            let nextStart;

            // Only east of gmt is a problem
            if (offset < 0) {
              // Calculate the new startdate with the offset applied, bypass RRULE/Luxon confusion
              // Make the internally stored DATE the actual date (not UTC offseted)
              // Luxon expects local time, not utc, so gets start date wrong if not adjusted
              nextStart = new Date(originalStart.getTime() + (Math.abs(offset) * 60_000));
            } else {
              // Strip any residual time component by rebuilding local midnight
              nextStart = new Date(
                originalStart.getFullYear(),
                originalStart.getMonth(),
                originalStart.getDate(),
                0,
                0,
                0,
                0,
              );
            }

            curr.start = nextStart;

            // Preserve any metadata that was attached to the original Date instance.
            if (originalStart && originalStart.tz) {
              tzUtil.attachTz(curr.start, originalStart?.tz);
            }

            if (originalStart && originalStart.dateOnly === true) {
              curr.start.dateOnly = true;
            }
          }

          // If the date has an toISOString function
          if (curr.start && typeof curr.start.toISOString === 'function') {
            try {
              // If the original date has a TZID, add it
              // BUT: UTC (Etc/UTC, UTC, Etc/GMT) should use ISO format with Z, not TZID
              const isUtc = tzUtil.isUtcTimezone(curr.start.tz);

              if (curr.start.tz && !isUtc) {
                const tzInfo = tzUtil.resolveTZID(curr.start.tz);
                const localStamp = tzUtil.formatDateForRrule(curr.start, tzInfo);
                const tzidLabel = tzInfo.iana || tzInfo.etc || tzInfo.original;

                if (localStamp && tzidLabel) {
                  // RFC5545 requires DTSTART to be expressed in local time when a TZID is present.
                  rule += `;DTSTART;TZID=${tzidLabel}:${localStamp}`;
                } else if (localStamp) {
                  // Fall back to a floating DTSTART (still without a trailing Z) if we lack a dependable TZ label.
                  rule += `;DTSTART=${localStamp}`;
                } else {
                  // Ultimate fallback: emit a UTC value (legacy behaviour) rather than crashing.
                  rule += `;DTSTART=${curr.start.toISOString().replaceAll(/[-:]/g, '')}`;
                }
              } else {
                rule += `;DTSTART=${curr.start.toISOString().replaceAll(/[-:]/g, '')}`;
              }

              rule = rule.replace(/\.\d{3}/, '');
            } catch (error) { // This should not happen, issue #56
              throw new Error('ERROR when trying to convert to ISOString ' + error);
            }
          } else {
            throw new Error('No toISOString function in curr.start ' + curr.start);
          }
        }

        // Create RRuleTemporal with separate DTSTART and RRULE parameters
        if (curr.start) {
          // Extract RRULE segments while preserving everything except inline DTSTART
          const rruleOnly = rule.split(';')
            .filter(segment => !segment.startsWith('DTSTART'))
            .join(';');

          // Convert curr.start (Date) to Temporal.ZonedDateTime
          let dtstartTemporal;

          if (curr.start.tz) {
            // Has timezone - use Intl to get the local wall-clock time in that timezone
            const tzInfo = tzUtil.resolveTZID(curr.start.tz);
            const timeZone = tzInfo?.tzid || tzInfo?.iana || curr.start.tz || 'UTC';

            try {
              // Extract local time components in the target timezone.
              // We use Intl.DateTimeFormat because curr.start is a Date in UTC but represents
              // wall-clock time in the event's timezone.
              const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone,
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false,
              });

              const parts = formatter.formatToParts(curr.start);
              const partMap = {};
              for (const part of parts) {
                if (part.type !== 'literal') {
                  partMap[part.type] = Number.parseInt(part.value, 10);
                }
              }

              // Create a PlainDateTime from the local time components
              const plainDateTime = Temporal.PlainDateTime.from({
                year: partMap.year,
                month: partMap.month,
                day: partMap.day,
                hour: partMap.hour,
                minute: partMap.minute,
                second: partMap.second,
              });

              dtstartTemporal = plainDateTime.toZonedDateTime(timeZone, {disambiguation: 'compatible'});
            } catch (error) {
              // Invalid timezone - fall back to UTC interpretation
              console.warn(`[node-ical] Failed to convert timezone "${timeZone}", falling back to UTC: ${error.message}`);
              dtstartTemporal = Temporal.ZonedDateTime.from({
                year: curr.start.getUTCFullYear(),
                month: curr.start.getUTCMonth() + 1,
                day: curr.start.getUTCDate(),
                hour: curr.start.getUTCHours(),
                minute: curr.start.getUTCMinutes(),
                second: curr.start.getUTCSeconds(),
                timeZone: 'UTC',
              });
            }
          } else {
            // No timezone - use UTC
            dtstartTemporal = Temporal.ZonedDateTime.from({
              year: curr.start.getUTCFullYear(),
              month: curr.start.getUTCMonth() + 1,
              day: curr.start.getUTCDate(),
              hour: curr.start.getUTCHours(),
              minute: curr.start.getUTCMinutes(),
              second: curr.start.getUTCSeconds(),
              timeZone: 'UTC',
            });
          }

          const rruleTemporal = new RRuleTemporal({
            rruleString: rruleOnly,
            dtstart: dtstartTemporal,
          });

          curr.rrule = new RRuleCompatWrapper(rruleTemporal);
        }
      }

      return originalEnd.call(this, value, parameters, curr, stack);
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
    EXDATE: exdateParameter('exdate'),
    ' CLASS': storeParameter('class'), // Should there be a space in this property?
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
    RRULE(value, parameters, curr, stack, line) {
      curr.rrule = line;
      return curr;
    },
  },

  handleObject(name, value, parameters, ctx, stack, line) {
    if (this.objectHandlers[name]) {
      return this.objectHandlers[name](value, parameters, ctx, stack, line);
    }

    // Handling custom properties
    if (/X-[\w-]+/.test(name) && stack.length > 0) {
      // Trimming the leading and perform storeParam
      name = name.slice(2);
      return storeParameter(name)(value, parameters, ctx, stack, line);
    }

    return storeParameter(name.toLowerCase())(value, parameters, ctx);
  },

  parseLines(lines, limit, ctx, stack, lastIndex, cb) {
    if (!cb && typeof ctx === 'function') {
      cb = ctx;
      ctx = undefined;
    }

    ctx ||= {};
    stack ||= [];

    let limitCounter = 0;

    let i = lastIndex || 0;
    for (let ii = lines.length; i < ii; i++) {
      let l = lines[i];
      // Unfold : RFC#3.1
      while (lines[i + 1] && /[ \t]/.test(lines[i + 1][0])) {
        l += lines[i + 1].slice(1);
        i++;
      }

      // Remove any double quotes in any tzid statement// except around (utc+hh:mm
      if (l.includes('TZID=') && !l.includes('"(')) {
        l = l.replaceAll('"', '');
      }

      const exp = /^([\w\d-]+)((?:;[\w\d-]+=(?:(?:"[^"]*")|[^":;]+))*):(.*)$/;
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
      if (++limitCounter > limit) {
        break;
      }
    }

    if (i >= lines.length) {
      // Type and params are added to the list of items, get rid of them.
      delete ctx.type;
      delete ctx.params;
    }

    if (cb) {
      if (i < lines.length) {
        setImmediate(() => {
          this.parseLines(lines, limit, ctx, stack, i + 1, cb);
        });
      } else {
        setImmediate(() => {
          cb(null, ctx);
        });
      }
    } else {
      return ctx;
    }
  },

  parseICS(string, cb) {
    const lines = string.split(/\r?\n/);
    let ctx;

    if (cb) {
      // Asynchronous execution
      this.parseLines(lines, 2000, cb);
    } else {
      // Synchronous execution
      ctx = this.parseLines(lines, lines.length);
      return ctx;
    }
  },
};
