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
    } catch {
      // Fall through to UTC-based key if timezone resolution fails
    }
  }

  return dateValue.toISOString().slice(0, 10);
}

/**
 * Clone a Date object and preserve custom metadata (tz, dateOnly).
 * @param {Date} source - Source Date object with optional tz and dateOnly properties
 * @param {Date|number} newTime - New time value (defaults to source)
 * @returns {Date} Cloned Date with preserved metadata
 */
function cloneDateWithMeta(source, newTime = source) {
  const cloned = new Date(newTime);

  if (source?.tz) {
    cloned.tz = source.tz;
  }

  if (source?.dateOnly) {
    cloned.dateOnly = source.dateOnly;
  }

  return cloned;
}

/**
 * Extract string value from DURATION (handles {params, val} shape).
 * @param {string|object} duration - Duration value (string or object with val property)
 * @returns {string} Duration string
 */
function getDurationString(duration) {
  if (typeof duration === 'object' && duration?.val) {
    return String(duration.val);
  }

  return duration ? String(duration) : '';
}

/**
 * Store a recurrence override with dual-key strategy.
 * Uses both date-only (YYYY-MM-DD) and full ISO keys for DATE-TIME entries.
 * Implements RFC 5545 SEQUENCE logic: newer versions (higher SEQUENCE) replace older ones.
 * @param {Object} recurrences - Recurrences object to store in
 * @param {Date} recurrenceId - RECURRENCE-ID date value
 * @param {Object} recurrenceObject - Recurrence override data
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

// Default batch size for async parsing to prevent event loop blocking
const PARSE_BATCH_SIZE = 2000;

module.exports = {
  objectHandlers: {
    BEGIN(component, parameters, curr, stack) {
      stack.push(curr);

      return {type: component};
    },
    END(value, parameters, curr, stack) {
      // Original end function
      const originalEnd = function (component, parameters_, curr, stack) {
        // Prevents the need to search the root of the tree for the VCALENDAR object
        if (component === 'VCALENDAR') {
          // Preserve VCALENDAR string properties in a separate 'vcalendar' object
          // for easy access to calendar metadata
          // (X-WR-CALNAME, X-WR-CALDESC, X-WR-TIMEZONE, METHOD, etc.)
          let key;
          let object;
          const vcalendarProps = {};

          for (key in curr) {
            if (!Object.hasOwn(curr, key)) {
              continue;
            }

            object = curr[key];
            if (typeof object === 'string') {
              vcalendarProps[key] = object;
              delete curr[key];
            }
          }

          // Store VCALENDAR properties in a dedicated object for easy access
          if (Object.keys(vcalendarProps).length > 0) {
            curr.vcalendar = vcalendarProps;
          }

          return curr;
        }

        const par = stack.pop();

        if (!curr.end) { // RFC5545, 3.6.1
          // Calculate end date based on DURATION or default rules
          if (curr.duration === undefined) {
            // No DURATION: default end is same time (date-time) or +1 day (date-only)
            curr.end = curr.datetype === 'date-time'
              ? cloneDateWithMeta(curr.start)
              : cloneDateWithMeta(curr.start, tzUtil.utcAdd(curr.start, 1, 'days'));
          } else {
            const durationString = getDurationString(curr.duration);
            const durationParts = durationString.match(/-?\d{1,10}[WDHMS]/g);

            if (durationParts && durationParts.length > 0) {
              // Valid DURATION: apply each component (W/D/H/M/S)
              const units = {
                W: 'weeks',
                D: 'days',
                H: 'hours',
                M: 'minutes',
                S: 'seconds',
              };
              const sign = durationString.startsWith('-') ? -1 : 1;

              let endTime = curr.start;
              for (const part of durationParts) {
                const value = Number.parseInt(part, 10) * sign;
                const unit = units[part.slice(-1)];
                endTime = tzUtil.utcAdd(endTime, value, unit);
              }

              curr.end = cloneDateWithMeta(curr.start, endTime);
            } else {
              // Malformed DURATION (e.g., "P", "PT", "") → treat as zero duration
              // Follows Postel's Law: be liberal in what you accept
              console.warn(`[node-ical] Ignoring malformed DURATION value: "${durationString}" – treating as zero duration`);
              curr.end = cloneDateWithMeta(curr.start);
            }
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

            // Special case: If existing entry is a RECURRENCE-ID override but current entry is the base series (has RRULE),
            // we should always accept the base series regardless of SEQUENCE, as they serve different purposes.
            // The RECURRENCE-ID will be stored separately in the recurrences array later.
            const existingIsRecurrence = par[curr.uid].recurrenceid !== undefined;
            // Note: This only detects RRULE-based series. RDATE-based recurring series
            // (without RRULE) will fall through to SEQUENCE comparison.
            const currentIsBaseSeries = curr.rrule !== undefined;

            if (existingIsRecurrence && currentIsBaseSeries) {
              // Existing is a recurrence override, current is the base series - always accept the base series
              // Note: The stale recurrenceid on par[curr.uid] will be cleaned up by the
              // existing recurrenceid-cleanup block below (after the recurrence-id handling section).
              for (const key in curr) {
                if (key !== null) {
                  par[curr.uid][key] = curr[key];
                }
              }
            } else {
              // Both are base series entries (no RECURRENCE-ID) - apply SEQUENCE logic
              // Check SEQUENCE to determine which version to keep (RFC 5545)
              // Normalize SEQUENCE to number, default to 0 if invalid/missing
              const existingSeq = Number.isFinite(par[curr.uid].sequence) ? par[curr.uid].sequence : 0;
              const newSeq = Number.isFinite(curr.sequence) ? curr.sequence : 0;

              if (newSeq < existingSeq) {
                // Older version - ignore it entirely
                console.warn(`[node-ical] Ignoring older event version (SEQUENCE ${newSeq} < ${existingSeq}) for UID ${curr.uid}`);
              } else {
                // Newer or same version - merge fields from the new record into the existing one
                for (const key in curr) {
                  if (key !== null) {
                    par[curr.uid][key] = curr[key];
                  }
                }
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

            // Store the recurrence override with dual-key strategy (same as EXDATE)
            storeRecurrenceOverride(par[curr.uid].recurrences, curr.recurrenceid, recurrenceObject);
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

              // For date-only events (VALUE=DATE), we need to preserve that information
              // so rrule-temporal can properly validate UNTIL values.
              // Use local date components since dateOnly dates are created with local timezone
              // (see dateParameter where new Date(year, month, day) is used without UTC)
              if (curr.start.dateOnly) {
                // Format: YYYYMMDD using local date components
                const year = curr.start.getFullYear();
                const month = String(curr.start.getMonth() + 1).padStart(2, '0');
                const day = String(curr.start.getDate()).padStart(2, '0');
                rule += `;DTSTART;VALUE=DATE:${year}${month}${day}`;
              } else if (curr.start.tz && !isUtc) {
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
          // When rule contains DTSTART;TZID=..., splitting on ';' produces orphaned
          // TZID= and VALUE= segments that must also be filtered out
          let rruleOnly = rule.split(';')
            .filter(segment =>
              !segment.startsWith('DTSTART')
              && !segment.startsWith('VALUE=')
              && !segment.startsWith('TZID='))
            .join(';');

          // Normalize UNTIL for rrule-temporal 1.4.2+ compatibility:
          // - DATE-only DTSTART: UNTIL must also be DATE-only (strip time)
          // - DATE-TIME DTSTART: UNTIL must be UTC with Z suffix
          if (rruleOnly.includes('UNTIL=')) {
            const untilMatch = rruleOnly.match(/UNTIL=(\d{8})(T\d{6})?(Z)?/);
            if (untilMatch) {
              const [, datePart, timePart, zSuffix] = untilMatch;

              if (curr.start.dateOnly) {
                // DATE-only: strip time from UNTIL
                if (timePart) {
                  rruleOnly = rruleOnly.replace(/UNTIL=\d{8}T\d{6}Z?/, `UNTIL=${datePart}`);
                }
              } else if (timePart && !zSuffix) {
                // DATE-TIME without Z: convert to UTC if we have a timezone, otherwise just append Z
                let converted = false;
                if (curr.start.tz) {
                  try {
                    const tzInfo = tzUtil.resolveTZID(curr.start.tz);
                    const untilLocal = datePart + timePart;
                    let untilDateObject;

                    if (tzInfo.iana && tzUtil.isValidIana(tzInfo.iana)) {
                      untilDateObject = tzUtil.parseDateTimeInZone(untilLocal, tzInfo.iana);
                    } else if (Number.isFinite(tzInfo.offsetMinutes)) {
                      untilDateObject = tzUtil.parseWithOffset(untilLocal, tzInfo.offset);
                    }

                    if (untilDateObject) {
                      const untilUtc = untilDateObject.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}/, '');
                      rruleOnly = rruleOnly.replace(/UNTIL=\d{8}T\d{6}/, `UNTIL=${untilUtc}`);
                      converted = true;
                    }
                  } catch {/* Fall through to append Z */}
                }

                if (!converted) {
                  rruleOnly = rruleOnly.replace(/UNTIL=(\d{8}T\d{6})(?!Z)/, 'UNTIL=$1Z');
                }
              }
            }
          }

          // For DATE-only events, we need to include DTSTART;VALUE=DATE in the rruleString
          // because rrule-temporal needs to know it's a DATE (not DATE-TIME) to validate UNTIL
          if (curr.start.dateOnly) {
            // Build DTSTART;VALUE=DATE:YYYYMMDD from curr.start
            // Use local getters (not UTC) to match dateParameter which creates Date with local components
            const year = curr.start.getFullYear();
            const month = String(curr.start.getMonth() + 1).padStart(2, '0');
            const day = String(curr.start.getDate()).padStart(2, '0');
            const dtstartString = `DTSTART;VALUE=DATE:${year}${month}${day}`;

            // Prepend DTSTART to rruleString
            const fullRruleString = `${dtstartString}\nRRULE:${rruleOnly}`;

            const rruleTemporal = new RRuleTemporal({
              rruleString: fullRruleString,
            });

            curr.rrule = new RRuleCompatWrapper(rruleTemporal);
          } else {
            // DATE-TIME events: convert curr.start (Date) to Temporal.ZonedDateTime
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

  /**
   * Parse iCalendar lines into a structured object.
   * Supports both sync and async (batched) modes.
   *
   * @param {string[]} lines - Array of iCalendar lines
   * @param {number} [batchSize=0] - Lines per batch (0=sync mode, >0=async batching)
   * @param {Object} [ctx] - Context object (internal, created if not provided)
   * @param {Array} [stack] - Parser stack for nested components (internal)
   * @param {number} [startIndex=0] - Current position in lines array (internal)
   * @param {Function} [cb] - Callback for async mode: cb(error, data)
   * @returns {Object|undefined} Parsed calendar data (sync mode), undefined (async mode with callback)
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
        while (lines[i + 1] && /[ \t]/.test(lines[i + 1][0])) {
          l += lines[i + 1].slice(1);
          i++;
        }

        // Remove any double quotes in any tzid statement // except around (utc+hh:mm
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
   * @param {Function} [cb] - Optional callback for async mode: cb(error, data)
   * @returns {Object|undefined} Parsed calendar data (sync) or undefined (async)
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
    const lines = string.split(/\r?\n/);

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
