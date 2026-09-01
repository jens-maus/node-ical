// Unescape Text re RFC 4.3.11
function text(t = '') {
  return t
    .replaceAll(String.raw`\,`, ',') // Unescape escaped commas
    .replaceAll(String.raw`\;`, ';') // Unescape escaped semicolons
    .replaceAll(/\\n/giv, '\n') // Replace escaped newlines with actual newlines
    .replaceAll('\\\\', '\\') // Unescape backslashes
    .replace(/^"(.*)"$/v, '$1'); // Remove surrounding double quotes, if present
}

function parseValue(value) {
  if (typeof value === 'string') {
    const upperValue = value.toUpperCase();
    if (upperValue === 'TRUE') {
      return true;
    }

    if (upperValue === 'FALSE') {
      return false;
    }
  }

  const number = Number(value);
  if (!Number.isNaN(number)) {
    return number;
  }

  // Remove quotes if found
  return value.replace(/^"(.*)"$/v, '$1');
}

function parseParameters(parameters) {
  const out = {};
  for (const element of parameters) {
    if (!element.includes('=')) {
      continue;
    }

    const segs = element.split('=');
    // Parameter names are case-insensitive per RFC 5545; normalize to uppercase
    // so lookups like `p.TZID`/`p.FBTYPE`/`p.VALUE` work regardless of input casing.
    out[segs[0].toUpperCase()] = parseValue(segs.slice(1).join('='));
  }

  return out;
}

function isDefaultTextParameter(parameter) {
  if (typeof parameter !== 'string') {
    return false;
  }

  const index = parameter.indexOf('=');
  if (index === -1) {
    return false;
  }

  const nameLower = parameter.slice(0, index).toLowerCase();
  const normalizedValue = parameter.slice(index + 1).toLowerCase().replaceAll('-', '');

  return (nameLower === 'charset' && normalizedValue === 'utf8')
    || (nameLower === 'value' && normalizedValue === 'text');
}

function splitUnescapedCommas(value) {
  if (!value) {
    return [];
  }

  const parts = [];
  let current = '';
  let backslashRun = 0;

  for (const character of value) {
    if (character === '\\') {
      backslashRun++;
      current += character;
      continue;
    }

    if (character === ',' && backslashRun % 2 === 0) {
      parts.push(current);
      current = '';
      backslashRun = 0;
      continue;
    }

    backslashRun = 0;
    current += character;
  }

  parts.push(current);
  return parts;
}

function setOwnRecordField(target, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return;
  }

  target[key] = value;
}

function getOwnRecordField(target, key) {
  return Object.hasOwn(target, key) ? target[key] : undefined;
}

function copyRecordFields(target, source) {
  for (const [key, value] of Object.entries(source)) {
    setOwnRecordField(target, key, value);
  }
}

// Fields that are parser-owned aggregate/inherited state rather than data parsed
// from the current VEVENT/VTODO/VJOURNAL occurrence itself. These must survive a
// SEQUENCE-based merge even though they never appear on the incoming entry.
const PRESERVED_MERGE_FIELDS = new Set(['recurrences', 'method']);

function clearFieldsRemovedInRevision(target, source) {
  for (const key of Object.keys(target)) {
    if (PRESERVED_MERGE_FIELDS.has(key) || Object.hasOwn(source, key)) {
      continue;
    }

    delete target[key];
  }
}

function applyUidSequenceMerge(existingEntry, incomingEntry, uid) {
  // Special case: existing entry is a RECURRENCE-ID override while the incoming
  // entry is the base series. The base series can drive recurrence via RRULE,
  // via RDATE only, or be a plain singleton - the only thing that matters is
  // that it is not itself a RECURRENCE-ID override. Keep both concerns by
  // merging base fields.
  const isExistingIsRecurrence = existingEntry.recurrenceid !== undefined;
  const isIncomingIsBaseSeries = incomingEntry.recurrenceid === undefined;

  if (isExistingIsRecurrence && isIncomingIsBaseSeries) {
    clearFieldsRemovedInRevision(existingEntry, incomingEntry);
    copyRecordFields(existingEntry, incomingEntry);
    return;
  }

  // Otherwise apply RFC 5545 SEQUENCE precedence for duplicate base entries.
  const existingSeq = Number.isFinite(existingEntry.sequence) ? existingEntry.sequence : 0;
  const newSeq = Number.isFinite(incomingEntry.sequence) ? incomingEntry.sequence : 0;

  if (newSeq < existingSeq) {
    console.warn(`[node-ical] Ignoring older event version (SEQUENCE ${newSeq} < ${existingSeq}) for UID ${uid}`);
    return;
  }

  // The accepted revision fully replaces the previous one: drop fields that no
  // longer exist on the incoming entry (e.g. RRULE removed) instead of leaving
  // stale data behind, while keeping parser-owned aggregate state intact and
  // preserving object identity (existingEntry is mutated in place).
  clearFieldsRemovedInRevision(existingEntry, incomingEntry);
  copyRecordFields(existingEntry, incomingEntry);
}

function buildRecurrenceOverrideObject(sourceEntry) {
  const recurrenceObject = Object.create(null);
  copyRecordFields(recurrenceObject, sourceEntry);

  if (recurrenceObject.recurrences !== undefined) {
    delete recurrenceObject.recurrences;
  }

  return recurrenceObject;
}

function storeRecurrenceOverrideForEntry(parentEntry, sourceEntry, storeRecurrenceOverride) {
  if (sourceEntry.recurrenceid === undefined) {
    return;
  }

  const recurrenceObject = buildRecurrenceOverrideObject(sourceEntry);
  parentEntry.recurrences ||= {};
  storeRecurrenceOverride(parentEntry.recurrences, sourceEntry.recurrenceid, recurrenceObject);
}

function cleanupBaseSeriesRecurrenceId(entry, uid) {
  if (uid !== '__proto__' && entry.rrule !== undefined && entry.recurrenceid !== undefined) {
    delete entry.recurrenceid;
  }
}

function handleUidEntryInParent(parentEntry, sourceEntry, storeRecurrenceOverride) {
  if (!sourceEntry.uid) {
    return false;
  }

  const {uid} = sourceEntry;
  let existingEntry = getOwnRecordField(parentEntry, uid);

  if (existingEntry === undefined) {
    setOwnRecordField(parentEntry, uid, sourceEntry);
    existingEntry = getOwnRecordField(parentEntry, uid);

    if (parentEntry.method) {
      existingEntry.method = parentEntry.method;
    }
  } else if (sourceEntry.recurrenceid === undefined) {
    applyUidSequenceMerge(existingEntry, sourceEntry, uid);
  }

  if (sourceEntry.recurrenceid !== undefined) {
    storeRecurrenceOverrideForEntry(existingEntry, sourceEntry, storeRecurrenceOverride);
  }

  cleanupBaseSeriesRecurrenceId(existingEntry, uid);
  return true;
}

function splitVCalendarProperties(entry) {
  const vcalendarProps = {};

  for (const key in entry) {
    if (!Object.hasOwn(entry, key)) {
      continue;
    }

    const value = entry[key];
    if (typeof value === 'string') {
      vcalendarProps[key] = value;
      delete entry[key];
    }
  }

  if (Object.keys(vcalendarProps).length > 0) {
    entry.vcalendar = vcalendarProps;
  }

  return entry;
}

function handleNonUidEntryInParent(parentEntry, sourceEntry, component, randomIdFactory) {
  if (component === 'VALARM' && (parentEntry.type === 'VEVENT' || parentEntry.type === 'VTODO')) {
    parentEntry.alarms ||= [];
    parentEntry.alarms.push(sourceEntry);
    return parentEntry;
  }

  const id = randomIdFactory();
  parentEntry[id] = sourceEntry;

  if (parentEntry.method) {
    parentEntry[id].method = parentEntry.method;
  }

  return parentEntry;
}

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

function getDurationString(duration) {
  if (typeof duration === 'object' && duration?.val) {
    return String(duration.val);
  }

  return duration ? String(duration) : '';
}

const DURATION_UNITS = {
  W: 'weeks',
  D: 'days',
  H: 'hours',
  M: 'minutes',
  S: 'seconds',
};

// Time-only designators (RFC 5545 §3.3.6 dur-time). "M" means minutes here,
// but means months in ISO 8601's date part - which RFC 5545 DURATION doesn't
// support at all. Requiring these to appear after a "T" is what disambiguates
// "P1M" (invalid - bare "M" has no valid meaning) from "PT1M" (1 minute).
const TIME_ONLY_UNITS = new Set(['H', 'M', 'S']);

// A single "<digits><unit>" token, e.g. "1D" or "30M".
const DURATION_TOKEN_PATTERN = /^(\d{1,10})([dhmsw])/iv;

// Validates and parses an RFC 5545 §3.3.6 DURATION value token by token,
// consuming the optional sign and leading "P" and then walking the rest of
// the string one unit-fragment at a time. This rejects anything that isn't
// fully consumed by valid fragments (e.g. "P1DXYZ" or "garbage1D" - a
// valid-looking fragment surrounded by garbage) and rejects date-only
// letters appearing where only a time designator would make sense (e.g. the
// standalone "M" in "P1M"). It deliberately still tolerates some real-world
// vendor quirks seen in the wild, such as a "T" preceding a week count
// ("PT1W") or all unit letters bunched together after a single "T"
// ("-PT1W1D2H3M4S"), since those are unambiguous even though non-standard.
function applyDurationToDate(start, durationString, utcAdd) {
  const trimmed = durationString.trim();
  const prefixMatch = /^([+\-]?)p/iv.exec(trimmed);
  if (!prefixMatch) {
    return undefined;
  }

  const sign = prefixMatch[1] === '-' ? -1 : 1;
  let rest = trimmed.slice(prefixMatch[0].length);
  let isSeenTimeDesignator = false;
  let hasComponent = false;
  let endTime = start;

  while (rest.length > 0) {
    if (/^t/iv.test(rest)) {
      isSeenTimeDesignator = true;
      rest = rest.slice(1);
      continue;
    }

    const tokenMatch = DURATION_TOKEN_PATTERN.exec(rest);
    if (!tokenMatch) {
      return undefined;
    }

    const unitLetter = tokenMatch[2].toUpperCase();
    if (TIME_ONLY_UNITS.has(unitLetter) && !isSeenTimeDesignator) {
      return undefined;
    }

    hasComponent = true;
    endTime = utcAdd(endTime, Number(tokenMatch[1]) * sign, DURATION_UNITS[unitLetter]);
    rest = rest.slice(tokenMatch[0].length);
  }

  return hasComponent ? endTime : undefined;
}

function applyImplicitEndDate(entry, utcAdd) {
  if (entry.end) {
    return entry;
  }

  if (entry.duration === undefined) {
    entry.end = entry.datetype === 'date-time'
      ? cloneDateWithMeta(entry.start)
      : cloneDateWithMeta(
        entry.start,
        entry.start
          ? new Date(entry.start.getFullYear(), entry.start.getMonth(), entry.start.getDate() + 1, 0, 0, 0, 0)
          : entry.start,
      );
    return entry;
  }

  const durationString = getDurationString(entry.duration);
  const endTime = applyDurationToDate(entry.start, durationString, utcAdd);
  if (endTime !== undefined) {
    entry.end = cloneDateWithMeta(entry.start, endTime);
    return entry;
  }

  console.warn(`[node-ical] Ignoring malformed DURATION value: "${durationString}" – treating as zero duration`);
  entry.end = cloneDateWithMeta(entry.start);
  return entry;
}

function finalizeEndedComponent(component, current, parentStack, {
  storeRecurrenceOverride,
  randomIdFactory,
  utcAdd,
}) {
  if (component === 'VCALENDAR') {
    return splitVCalendarProperties(current);
  }

  const parentEntry = parentStack.pop();

  // Implicit end derivation only applies to start-bearing VEVENT/VTODO components.
  const isSupportsImplicitEnd = ['VEVENT', 'VTODO'].includes(component) && current.start instanceof Date;
  if (isSupportsImplicitEnd) {
    applyImplicitEndDate(current, utcAdd);
  }

  if (handleUidEntryInParent(parentEntry, current, storeRecurrenceOverride)) {
    return parentEntry;
  }

  return handleNonUidEntryInParent(parentEntry, current, component, randomIdFactory);
}

function buildDateOnlyStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function normalizeRruleUntil(rruleOnly, startDate, tzUtil) {
  if (!rruleOnly.includes('UNTIL=')) {
    return rruleOnly;
  }

  const untilMatch = rruleOnly.match(/UNTIL=(\d{8})(T\d{6})?(Z)?/v);
  if (!untilMatch) {
    return rruleOnly;
  }

  const [, datePart, timePart, zSuffix] = untilMatch;
  const untilStart = untilMatch.index;
  const untilEnd = untilStart + untilMatch[0].length;

  if (startDate.dateOnly) {
    if (timePart) {
      return rruleOnly.slice(0, untilStart) + `UNTIL=${datePart}` + rruleOnly.slice(untilEnd);
    }

    return rruleOnly;
  }

  if (!timePart || zSuffix) {
    return rruleOnly;
  }

  let isConverted = false;
  if (startDate.tz) {
    try {
      const tzInfo = tzUtil.resolveTZID(startDate.tz);
      const untilLocal = datePart + timePart;
      let untilDateObject;

      if (tzInfo.iana && tzUtil.isValidIana(tzInfo.iana)) {
        untilDateObject = tzUtil.parseDateTimeInZone(untilLocal, tzInfo.iana);
      } else if (Number.isFinite(tzInfo.offsetMinutes)) {
        untilDateObject = tzUtil.parseWithOffset(untilLocal, tzInfo.offset);
      }

      if (untilDateObject) {
        const untilUtc = untilDateObject.toISOString().replaceAll(/[-:]/gv, '').replaceAll(/\.\d{3}/gv, '');
        rruleOnly = rruleOnly.slice(0, untilStart) + `UNTIL=${untilUtc}` + rruleOnly.slice(untilEnd);
        isConverted = true;
      }
    } catch {
      // Fall through to append Z
    }
  }

  return isConverted ? rruleOnly : rruleOnly.replace(/UNTIL=(\d{8}T\d{6})(?!Z)/v, 'UNTIL=$1Z');
}

function buildRruleStringForTemporal(rule, startDate, tzUtil) {
  const rruleOnly = rule.split(';')
    .filter(segment =>
      !segment.startsWith('DTSTART')
      && !segment.startsWith('VALUE=')
      && !segment.startsWith('TZID='))
    .join(';');

  return normalizeRruleUntil(rruleOnly, startDate, tzUtil);
}

function buildDateOnlyRruleString(startDate, rruleOnly) {
  const dtstartString = `DTSTART;VALUE=DATE:${buildDateOnlyStamp(startDate)}`;
  return `${dtstartString}\nRRULE:${rruleOnly}`;
}

function buildTemporalDtstart(startDate, Temporal, tzUtil) {
  const tzInfo = startDate.tz ? tzUtil.resolveTZID(startDate.tz) : undefined;
  let timeZone = 'UTC';
  if (tzInfo?.iana || tzInfo?.offset) {
    timeZone = tzInfo.iana || tzInfo.offset;
  } else if (tzInfo) {
    console.warn('[node-ical] TZID resolved to neither IANA nor UTC offset; falling back to UTC for DTSTART conversion.');
  }

  try {
    return Temporal.Instant.fromEpochMilliseconds(startDate.getTime())
      .toZonedDateTimeISO(timeZone);
  } catch (error) {
    console.warn(`[node-ical] Failed to convert timezone "${timeZone}", falling back to UTC: ${error?.message ?? String(error)}`);
    return Temporal.Instant.fromEpochMilliseconds(startDate.getTime())
      .toZonedDateTimeISO('UTC');
  }
}

function buildRruleCompatWrapper(entry, rruleOnly, {
  RRuleTemporal,
  RRuleCompatWrapper,
  Temporal,
  tzUtil,
}) {
  if (entry.start.dateOnly) {
    const rruleTemporal = new RRuleTemporal({
      rruleString: buildDateOnlyRruleString(entry.start, rruleOnly),
    });

    return new RRuleCompatWrapper(rruleTemporal, true);
  }

  const rruleTemporal = new RRuleTemporal({
    rruleString: rruleOnly,
    dtstart: buildTemporalDtstart(entry.start, Temporal, tzUtil),
  });

  return new RRuleCompatWrapper(rruleTemporal, false);
}

function createTemporalRule(entry, rule, dependencies) {
  const {tzUtil} = dependencies;

  if (!entry.start || typeof entry.start.toISOString !== 'function') {
    throw new Error('No toISOString function in entry.start ' + entry.start);
  }

  const rruleOnly = buildRruleStringForTemporal(rule.replaceAll(/\.\d{3}/gv, ''), entry.start, tzUtil);
  return buildRruleCompatWrapper(entry, rruleOnly, dependencies);
}

function storeValueParameter(name) {
  return function (value, curr) {
    const current = curr[name];

    if (Array.isArray(current)) {
      current.push(value);
      return curr;
    }

    curr[name] = current === undefined ? value : [current, value];
    return curr;
  };
}

function storeParameter(name) {
  return function (value, parameters, curr) {
    const data = parameters && parameters.length > 0
      && !(parameters.length === 1 && isDefaultTextParameter(parameters[0]))
      ? {params: parseParameters(parameters), val: text(value)}
      : text(value);

    return storeValueParameter(name)(data, curr);
  };
}

function isDateOnly(value, parameters) {
  if (parameters) {
    const valueParameter = parseParameters(parameters).VALUE;
    if (typeof valueParameter === 'string') {
      const normalized = valueParameter.toUpperCase();
      if (normalized === 'DATE') {
        return true;
      }

      if (normalized === 'DATE-TIME') {
        return false;
      }
    }
  }

  return /^\d{8}$/v.test(value);
}

function typeParameter(name) {
  return function (value, parameters, curr) {
    const returnValue = isDateOnly(value, parameters) ? 'date' : 'date-time';
    return storeValueParameter(name)(returnValue, curr);
  };
}

function addTZFactory(attachTz) {
  return function (dt, parameters) {
    if (!dt) {
      return dt;
    }

    const p = parseParameters(parameters);
    if (parameters && p && p.TZID !== undefined) {
      let tzid = p.TZID.toString();
      // Remove surrounding quotes if found at the beginning and at the end of the string
      // (Occurs when parsing Microsoft Exchange events containing TZID with Windows standard format instead IANA)
      tzid = tzid.replace(/^"(.*)"$/v, '$1');
      return attachTz(dt, tzid);
    }

    if (dt.tz) {
      return attachTz(dt, dt.tz);
    }

    return dt;
  };
}

// Find a VTIMEZONE block in the parser stack. When tzid is given, only
// the block whose quote-stripped tzid matches is returned; without tzid
// the first VTIMEZONE found is returned.
function findVtimezoneInStack(stack, tzid) {
  for (const item of (stack || [])) {
    for (const v of Object.values(item)) {
      if (v && v.type === 'VTIMEZONE') {
        if (!tzid) {
          return v;
        }

        const ids = Array.isArray(v.tzid) ? v.tzid : [v.tzid];
        if (ids.some(id => String(id).replace(/^"(.*)"$/v, '$1') === tzid)) {
          return v;
        }
      }
    }
  }
}

/* eslint-disable complexity, max-depth -- extracted date parsing logic is intentionally kept structurally close to original implementation to minimize regression risk */
function createDateParameterFactory({addTZ, tzUtil}) {
  return function (name) {
    return function (value, parameters, curr, stack) {
      // A schemed TZID like "tzone://Microsoft/Utc" gets split at its "://" colon
      // by the line parser, so the scheme tail leaks into `value`. Repair both by
      // re-splitting `value` at the date's colon.
      const pi = Array.isArray(parameters)
        ? parameters.findIndex(parameter => {
          if (typeof parameter !== 'string') {
            return false;
          }

          const index = parameter.indexOf('=');
          if (index === -1) {
            return false;
          }

          const nameLower = parameter.slice(0, index).toLowerCase();
          const valueLower = parameter.slice(index + 1).toLowerCase();
          return nameLower === 'tzid' && valueLower === 'tzone';
        })
        : -1;
      if (pi !== -1) {
        const parameter = parameters[pi];
        const index = typeof parameter === 'string' ? parameter.indexOf('=') : -1;
        const firstColon = value.indexOf(':');
        const tzidRemainder = value.slice(0, firstColon);
        const dateValue = value.slice(firstColon + 1);

        if (index !== -1) {
          const parameterName = parameter.slice(0, index);
          const parameterValue = parameter.slice(index + 1);
          parameters[pi] = `${parameterName}=${parameterValue}:${tzidRemainder}`;
        }

        value = dateValue;
      }

      let newDate = text(value);

      // Process 'VALUE=DATE' and EXDATE
      if (isDateOnly(value, parameters)) {
        // Just Date

        const comps = /^(\d{4})(\d{2})(\d{2}).*$/v.exec(value);
        if (comps !== null) {
          // No TZ info - assume same timezone as this computer
          newDate = new Date(comps[1], Number(comps[2]) - 1, comps[3]);

          newDate.dateOnly = true;

          // Store as string - worst case scenario
          return storeValueParameter(name)(newDate, curr);
        }
      }

      // Typical RFC date-time format
      const comps = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/v.exec(value);
      if (comps !== null) {
        const year = Number(comps[1]);
        const monthIndex = Number(comps[2]) - 1;
        const day = Number(comps[3]);
        const hour = Number(comps[4]);
        const minute = Number(comps[5]);
        const second = Number(comps[6]);

        if (comps[7] === 'Z') {
          // GMT
          newDate = new Date(Date.UTC(year, monthIndex, day, hour, minute, second));
          tzUtil.attachTz(newDate, 'Etc/UTC');
        } else if (curr.type === 'STANDARD' || curr.type === 'DAYLIGHT') {
          // Inside a VTIMEZONE observance block the DTSTART is a plain local
          // wall-clock time that defines when the rule takes effect - it must
          // NOT trigger timezone resolution (which would look up the *enclosing*
          // VTIMEZONE and could crash on exotic years like 0001).
          newDate = new Date(year, monthIndex, day, hour, minute, second);
          newDate.setFullYear(year);
        } else {
          // Floating DATE-TIME values (no TZID parameter) are, per RFC 5545, meant to stay
          // in local wall-clock time with no timezone conversion. However, some very common
          // real-world exports (e.g. the WordPress "The Events Calendar" plugin) emit DTSTART
          // without a TZID *and* a single VTIMEZONE block that was clearly meant to apply to it
          // (see node-ical issue #305 / PR #307 - washougal.k12.wa.us school calendar). Borrowing
          // that VTIMEZONE keeps those calendars working correctly instead of silently reverting
          // to whatever timezone the host process happens to run in.
          const fallbackWithStackTimezone = () => {
            const vTimezone = findVtimezoneInStack(stack);

            // If the VTIMEZONE contains multiple TZIDs (against RFC), use last one
            const normalizedTzId = vTimezone
              ? (Array.isArray(vTimezone.tzid) ? vTimezone.tzid.at(-1) : vTimezone.tzid)
              : null;

            if (!normalizedTzId) {
              return new Date(year, monthIndex, day, hour, minute, second);
            }

            let resolvedTzId = String(normalizedTzId).replace(/^"(.*)"$/v, '$1');

            // When a VTIMEZONE block is present, prefer its STANDARD/DAYLIGHT offset data over
            // a pure string-based TZID lookup. This handles both well-known IANA names (where
            // the embedded rules may be more historically precise) and completely custom TZIDs
            // (e.g. Microsoft's "Customized Time Zone", "tzone://Microsoft/Custom") that
            // resolveTZID cannot look up at all.
            // Only replace resolvedTzId when resolution actually succeeds; otherwise keep the
            // original value so resolveTZID can make a best effort - never substitute the host
            // zone via guessLocalZone().
            if (vTimezone) {
              const resolved = tzUtil.resolveVTimezoneToIana(vTimezone, year);
              if (resolved.iana || resolved.offset) {
                resolvedTzId = resolved.iana || resolved.offset;
              }
            }

            const tzInfo = tzUtil.resolveTZID(resolvedTzId);
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
              tz = tz.toString().replace(/^"(.*)"$/v, '$1');

              if (tz === 'tzone://Microsoft/Custom' || tz === '(no TZ description)' || tz.startsWith('Customized Time Zone') || tz.startsWith('tzone://Microsoft/')) {
                // Outlook and Exchange often emit custom TZID values (e.g. "Customized Time Zone")
                // together with a VTIMEZONE section that contains the real STANDARD/DAYLIGHT rules.
                // Try to match those rules to a known IANA zone so that recurring events that span
                // DST boundaries are handled correctly. Falls back to guessLocalZone() when no
                // VTIMEZONE is present or its offsets cannot be resolved.
                const originalTz = tz;
                const stackVTimezone = findVtimezoneInStack(stack, originalTz);

                if (stackVTimezone) {
                  const resolved = tzUtil.resolveVTimezoneToIana(stackVTimezone, year);
                  // Only override when resolution succeeds; keep the original tz otherwise
                  // so resolveTZID can make a best effort - never substitute guessLocalZone()
                  if (resolved.iana || resolved.offset) {
                    tz = resolved.iana || resolved.offset;
                  }
                } else {
                  tz = tzUtil.guessLocalZone();
                }
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
}
/* eslint-enable complexity, max-depth */

function createComponentParameterHandlers({dateParameter, utcAdd}) {
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
      const parsedCategories = splitUnescapedCommas(value).map(category => text(category.trim()));
      if (curr[name] === undefined) {
        curr[name] = parsedCategories;
      } else if (value) {
        curr[name] = [...curr[name], ...parsedCategories];
      }

      return curr;
    };
  };

  const recurrenceParameter = function (name) {
    return dateParameter(name);
  };

  const addFBType = function (fb, parameters) {
    const p = parseParameters(parameters);

    if (parameters && p) {
      // FBTYPE is an enumerated value (RFC 5545 §3.2.9); normalize to uppercase
      // so lowercase/mixed-case input behaves the same as the canonical form.
      fb.type = typeof p.FBTYPE === 'string' ? p.FBTYPE.toUpperCase() : 'BUSY';
    }

    return fb;
  };

  const freebusyParameter = function (name) {
    const storeFreebusyValue = storeParameter(name);
    const isDurationValue = value => /^[+\-]?p/iv.test(value);

    return function (value, parameters, curr) {
      curr[name] ||= [];

      // FREEBUSY may list multiple comma-separated periods on a single property line
      // (RFC 5545 §3.8.2.6); process each period independently.
      const periods = value.split(',').map(period => period.trim()).filter(Boolean);

      for (const period of periods) {
        const fb = addFBType({}, parameters);
        curr[name].push(fb);

        storeFreebusyValue(period, parameters, fb);

        const parts = period.split('/');
        dateParameter('start')(parts[0], parameters, fb);

        const secondPart = parts[1];
        if (secondPart && isDurationValue(secondPart)) {
          const durationEnd = applyDurationToDate(fb.start, secondPart, utcAdd);
          if (durationEnd === undefined) {
            console.warn(`[node-ical] Ignoring malformed FREEBUSY duration value: "${secondPart}" – end not set`);
          } else {
            fb.end = cloneDateWithMeta(fb.start, durationEnd);
          }
        } else {
          dateParameter('end')(secondPart, parameters, fb);
        }
      }

      return curr;
    };
  };

  return {
    geoParameter,
    categoriesParameter,
    recurrenceParameter,
    addFBType,
    freebusyParameter,
  };
}

function createExdateParameterFactory({dateParameter, getDateKey}) {
  return function (name) {
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
}

export {
  text,
  parseValue,
  parseParameters,
  applyUidSequenceMerge,
  storeRecurrenceOverrideForEntry,
  cleanupBaseSeriesRecurrenceId,
  handleUidEntryInParent,
  splitVCalendarProperties,
  handleNonUidEntryInParent,
  cloneDateWithMeta,
  getDurationString,
  applyImplicitEndDate,
  finalizeEndedComponent,
  createTemporalRule,
  storeValueParameter,
  storeParameter,
  isDateOnly,
  typeParameter,
  addTZFactory,
  findVtimezoneInStack,
  createDateParameterFactory,
  createComponentParameterHandlers,
  createExdateParameterFactory,
};
