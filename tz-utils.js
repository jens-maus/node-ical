// Thin abstraction over Intl to centralize all timezone logic
// This simplifies swapping libraries later and is easy to mock in tests.

// Load Temporal polyfill if not natively available (mirrors ical.js)
const Temporal = globalThis.Temporal || require('temporal-polyfill').Temporal;
const windowsZones = require('./windowsZones.json');

// Ensure polyfill is globally available for downstream modules
globalThis.Temporal ??= Temporal;

// Minimal alias map to emulate the subset of moment.tz.link behavior tests rely on
const aliasMap = new Map();

/**
 * Normalize a Windows timezone display label so that visually similar strings compare equally.
 * Collapses whitespace, trims the result, and lowercases the value for case-insensitive lookups.
 *
 * @param {string} label
 * @returns {string}
 */
function normalizeWindowsLabel(label) {
  return String(label)
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Build an index of normalized Windows timezone labels (and common variants) to their data entries.
 * This lets us resolve the canonical IANA identifier without relying on fuzzy substring matching.
 *
 * @param {Record<string, {iana: string[]}>} source
 * @returns {Map<string, {iana: string[]}>}
 */
function buildWindowsLabelIndex(source) {
  const index = new Map();

  const addVariant = (label, data) => {
    const normalized = normalizeWindowsLabel(label);
    if (!normalized || index.has(normalized)) {
      return;
    }

    index.set(normalized, data);
  };

  for (const [label, data] of Object.entries(source)) {
    addVariant(label, data);

    const withoutOffset = label.replace(/^\(utc[^)]*\)\s*/i, '').replace(/^\(gmt[^)]*\)\s*/i, '');
    if (withoutOffset !== label) {
      addVariant(withoutOffset, data);

      if (withoutOffset.includes(',')) {
        for (const segment of withoutOffset.split(',')) {
          addVariant(segment, data);
        }
      }
    }
  }

  return index;
}

const windowsLabelIndex = buildWindowsLabelIndex(windowsZones);

/**
 * Resolve a Windows/legacy timezone label to the canonical IANA identifier exported in windowsZones.json.
 *
 * @param {string} label
 * @returns {string|null}
 */
function mapWindowsZone(label) {
  const exact = windowsZones[label];
  if (exact && Array.isArray(exact.iana) && exact.iana.length > 0) {
    return exact.iana[0];
  }

  const normalized = normalizeWindowsLabel(label);
  const indexed = windowsLabelIndex.get(normalized);
  if (indexed && Array.isArray(indexed.iana) && indexed.iana.length > 0) {
    return indexed.iana[0];
  }

  if (label.includes(',')) {
    // Some feeds pass comma-separated display names; try each segment individually.
    for (const segment of label.split(',')) {
      const variant = windowsLabelIndex.get(normalizeWindowsLabel(segment));
      if (variant && Array.isArray(variant.iana) && variant.iana.length > 0) {
        return variant.iana[0];
      }
    }
  }

  return null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

// Memoize IANA zone validity checks to avoid repeated Intl constructor throws
const validIanaCache = new Map();

/**
 * Convert textual UTC offsets ("+05:30", "UTC-4", "(UTC+02:00)") into signed minute counts.
 *
 * @param {string} offset
 * @returns {number|undefined}
 */
function offsetLabelToMinutes(offset) {
  if (!offset) {
    return undefined;
  }

  const trimmed = String(offset)
    .trim()
    .replace(/^\(?(?:utc|gmt)\)?\s*/i, '')
    .replace(/\)$/, '')
    .trim();
  const match = trimmed.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return undefined;
  }

  const [, sign, hoursPart, minutesPart] = match;
  const hours = Number(hoursPart);
  const minutes = minutesPart ? Number(minutesPart) : 0;
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return undefined;
  }

  // Minutes must be < 60; IANA/ICS max absolute offset is 14:00
  if (minutes >= 60) {
    return undefined;
  }

  if (hours > 14 || (hours === 14 && minutes !== 0)) {
    return undefined;
  }

  const total = (hours * 60) + minutes;
  return sign === '-' ? -total : total;
}

function minutesToOffset(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) {
    return undefined;
  }

  const sign = totalMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(totalMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

function minutesToEtcZone(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) {
    return undefined;
  }

  if (totalMinutes === 0) {
    return 'Etc/GMT';
  }

  if (totalMinutes % 60 !== 0) {
    return undefined;
  }

  const hours = Math.abs(totalMinutes) / 60;
  const sign = totalMinutes > 0 ? '-' : '+'; // Etc/GMT zones invert sign
  return `Etc/GMT${sign}${hours}`;
}

/**
 * Interpret a TZID value (IANA, Windows display name, or offset label) and return structured metadata.
 *
 * @param {string} value
 * @returns {{original: string|undefined, iana: string|undefined, offset: string|undefined, offsetMinutes: number|undefined, etc: string|undefined}}
 */
function resolveTZID(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return {
      original: undefined,
      iana: undefined,
      offset: undefined,
      offsetMinutes: undefined,
      etc: undefined,
    };
  }

  let tz = value;
  if (tz === 'tzone://Microsoft/Custom' || tz.startsWith('Customized Time Zone') || tz.startsWith('tzone://Microsoft/')) {
    tz = guessLocalZone();
  }

  tz = tz.replace(/^"(.*)"$/, '$1');
  const original = tz;

  if (tz && (tz.includes(' ') || tz.includes(','))) {
    const mapped = mapWindowsZone(tz);
    if (mapped) {
      tz = mapped;
    }
  }

  let offsetMinutes;
  if (tz && tz.startsWith('(')) {
    const offsetMatch = tz.match(/([+-]\d{1,2}:\d{2})/);
    if (offsetMatch) {
      offsetMinutes = offsetLabelToMinutes(offsetMatch[1]);
    }

    tz = null;
  }

  if (offsetMinutes === undefined && tz) {
    // Handle raw offset TZIDs like "UTC+02:00", "+0530", or "GMT-4" that skip the
    // Windows-style parentheses but still represent fixed offsets.
    const mins = offsetLabelToMinutes(tz);
    if (Number.isFinite(mins)) {
      offsetMinutes = mins;
      tz = null;
    }
  }

  const exact = findExactZoneMatch(tz);
  const iana = exact || (tz && isValidIana(tz) ? tz : undefined);
  const offset = minutesToOffset(offsetMinutes);
  const etc = minutesToEtcZone(offsetMinutes);

  return {
    original,
    iana,
    offset,
    offsetMinutes,
    etc,
  };
}

/**
 * Format a Date as a local wall-time string (`YYYYMMDDTHHmmss`) suitable for RRULE DTSTART emission.
 * Converts the UTC instant to the given timezone using Temporal, then formats the wall-clock fields.
 * Accepts either an IANA zone name (via `tzInfo.iana`) or a UTC-offset zone derived from
 * `tzInfo.offsetMinutes` (e.g. `+01:00`).
 *
 * @param {Date} date
 * @param {{iana?: string, offsetMinutes?: number}} tzInfo
 * @returns {string|undefined}
 */
function formatDateForRrule(date, tzInfo = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return undefined;
  }

  const tzId
    = tzInfo.iana && isValidIana(tzInfo.iana)
      ? tzInfo.iana
      : (Number.isFinite(tzInfo.offsetMinutes)
        ? minutesToOffset(tzInfo.offsetMinutes)
        : undefined);

  if (!tzId) {
    return undefined;
  }

  const {year, month, day, hour, minute, second} = Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(tzId);
  return `${year}${pad2(month)}${pad2(day)}T${pad2(hour)}${pad2(minute)}${pad2(second)}`;
}

/**
 * Attach non-enumerable timezone metadata to a Date instance so downstream consumers
 * can recover the originating TZID without leaking it into JSON/string output.
 *
 * @param {Date} date
 * @param {string|undefined} tzid
 * @returns {Date|undefined}
 */
function attachTz(date, tzid) {
  if (!date || !tzid) {
    return date;
  }

  const hasSameValue = date.tz === tzid;
  const isEnumerable = Object.prototype.propertyIsEnumerable.call(date, 'tz');
  if (!hasSameValue || isEnumerable) {
    Object.defineProperty(date, 'tz', {
      value: tzid,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  }

  return date;
}

function resolveZone(zone) {
  if (!zone) {
    return zone;
  }

  return aliasMap.get(zone) || zone;
}

function guessLocalZone() {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Return the full list of IANA time zone names known to the runtime.
 *
 * We depend on Node 18+, so `Intl.supportedValuesOf('timeZone')` is guaranteed
 * to exist and yields the canonical list without requiring extra guards.
 */
function getZoneNames() {
  return Intl.supportedValuesOf('timeZone');
}

function findExactZoneMatch(tz) {
  if (!tz) {
    return undefined;
  }

  const z = resolveZone(tz);
  return isValidIana(z) ? z : undefined;
}

function isValidIana(zone) {
  if (!zone) {
    return false;
  }

  // Normalize any aliases before validation so cache keys stay consistent
  const tz = resolveZone(zone);
  if (!tz) {
    return false;
  }

  // Memoized hits avoid repeated Intl constructor work and exception cost
  if (validIanaCache.has(tz)) {
    return validIanaCache.get(tz);
  }

  try {
    // Rely on Intl throwing for invalid timeZone identifiers
    // This is more portable across Node builds than Temporal alone
    new Intl.DateTimeFormat('en-US', {timeZone: tz}).format(new Date(0));
    validIanaCache.set(tz, true);
    return true;
  } catch {
    validIanaCache.set(tz, false);
    return false;
  }
}

function parseDateTimeInZone(yyyymmddThhmmss, zone) {
  // Interpret the provided local wall time in the given IANA zone
  // and return a JS Date in UTC representing that instant.
  const s = String(yyyymmddThhmmss);
  // Support basic and extended forms
  // Try extended first: YYYY-MM-DDTHH:mm:ss
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  let fields;
  if (m) {
    fields = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] || 0),
    };
  } else {
    // Basic form: YYYYMMDDTHHmmss or YYYYMMDDTHHmm
    m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
    if (m) {
      fields = {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: Number(m[4]),
        minute: Number(m[5]),
        second: Number(m[6] || 0),
      };
    }
  }

  if (!fields) {
    return undefined;
  }

  const tz = resolveZone(zone);
  // Defensive: bail out early if the zone can't be resolved to a valid IANA identifier
  if (!isValidIana(tz)) {
    return undefined;
  }

  // Use Temporal to convert local wall-clock time in the given zone to a UTC instant.
  // For DST gaps (missing hour, e.g. spring-forward): moves to the first valid instant after
  // the gap ('later' behaves identically to 'compatible'/'earlier' here).
  // For DST folds (repeated hour, e.g. fall-back): picks the second (post-DST) occurrence,
  // matching the behaviour of the previous Intl-based convergeLocalInstant implementation.
  const epochMs = Temporal.PlainDateTime.from(fields)
    .toZonedDateTime(tz, {disambiguation: 'later'})
    .epochMilliseconds;

  return attachTz(new Date(epochMs), zone);
}

function parseWithOffset(yyyymmddThhmmss, offset) {
  // Offset like +hh:mm, -hh:mm, +hhmm, -hhmm, optionally prefixed by UTC/GMT
  const s = String(yyyymmddThhmmss);
  let m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  // Some feeds emit extended ISO `YYYY-MM-DD[T ]HH:mm[:ss]` strings alongside numeric offsets.
  // Mirror parseDateTimeInZone by accepting that form too so we don't fall back to local Date semantics.
  m ||= s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!m) {
    return undefined;
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || 0);
  const totalMinutes = offsetLabelToMinutes(offset);
  if (!Number.isFinite(totalMinutes)) {
    throw new TypeError('Invalid offset string: ' + offset);
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - (totalMinutes * 60_000);
  const normalizedOffset = minutesToOffset(totalMinutes);
  // Preserve original offset metadata so downstream consumers can recover it
  return attachTz(new Date(utcMs), normalizedOffset);
}

function utcAdd(date, amount, unit) {
  if (!(date instanceof Date)) {
    return undefined;
  }

  const msPer = {
    weeks: 7 * 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    minutes: 60 * 1000,
    seconds: 1000,
  };
  const factor = msPer[unit];
  if (!factor) {
    throw new Error('Unsupported unit: ' + unit);
  }

  return new Date(date.getTime() + (amount * factor));
}

function linkAlias(arg1, arg2) {
  // Support both linkAlias('Etc/Unknown|Etc/GMT') and linkAlias('Etc/Unknown','Etc/GMT')
  if (arg2 === undefined) {
    const [a, b] = String(arg1).split('|');
    if (a && b) {
      aliasMap.set(a, b);
    }

    return;
  }

  aliasMap.set(String(arg1), String(arg2));
}

// Public API
module.exports = {
  guessLocalZone,
  getZoneNames,
  findExactZoneMatch,
  isValidIana,
  parseDateTimeInZone,
  parseWithOffset,
  utcAdd,
  linkAlias,
  resolveTZID,
  formatDateForRrule,
  attachTz,
  isUtcTimezone,
};

// Expose some internals for testing
module.exports.__test__ = {
  isUtcTimezone,
};

function isUtcTimezone(tz) {
  if (!tz) {
    return false;
  }

  const tzLower = tz.toLowerCase();
  return tzLower === 'etc/utc' || tzLower === 'utc' || tzLower === 'etc/gmt';
}
