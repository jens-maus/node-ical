// Thin abstraction over Intl to centralize all timezone logic
// This simplifies swapping libraries later and is easy to mock in tests.

// Minimal alias map to emulate the subset of moment.tz.link behavior tests rely on
const aliasMap = new Map();
const windowsZones = require('./windowsZones.json');

/**
 * Resolve a Windows/legacy timezone label to the canonical IANA identifier exported in windowsZones.json.
 *
 * @param {string} label
 * @returns {string|null}
 */
function mapWindowsZone(label) {
  const direct = windowsZones[label];
  if (direct && Array.isArray(direct.iana) && direct.iana.length > 0) {
    return direct.iana[0];
  }

  if (label.includes(',')) {
    const first = label.split(',')[0];
    const candidate = Object.keys(windowsZones).find(zone => zone.includes(first));
    if (candidate) {
      const data = windowsZones[candidate];
      if (data && Array.isArray(data.iana) && data.iana.length > 0) {
        return data.iana[0];
      }
    }
  }

  return null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

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

  const trimmed = String(offset).trim().replace(/^(?:utc|gmt)/i, '').replace(/^\((?:utc|gmt)\)?/i, '').trim();
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
 * Prefers Intl when a valid IANA zone exists; otherwise falls back to offset arithmetic.
 *
 * @param {Date} date
 * @param {{iana?: string, offsetMinutes?: number}} tzInfo
 * @returns {string|undefined}
 */
function formatDateForRrule(date, tzInfo = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return undefined;
  }

  if (tzInfo.iana && isValidIana(tzInfo.iana)) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tzInfo.iana,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const numericParts = new Map([
      ['year', 'year'],
      ['month', 'month'],
      ['day', 'day'],
      ['hour', 'hour'],
      ['minute', 'minute'],
      ['second', 'second'],
    ]);
    const out = {};
    for (const part of parts) {
      const target = numericParts.get(part.type);
      if (!target) {
        continue;
      }

      out[target] = Number(part.value);
    }

    if (out.hour === 24) {
      out.hour = 0;
    }

    if (out.year && out.month && out.day && out.hour !== undefined && out.minute !== undefined && out.second !== undefined) {
      return `${out.year}${pad2(out.month)}${pad2(out.day)}T${pad2(out.hour)}${pad2(out.minute)}${pad2(out.second)}`;
    }
  }

  if (Number.isFinite(tzInfo.offsetMinutes)) {
    const local = new Date(date.getTime() + (tzInfo.offsetMinutes * 60_000));
    return `${local.getUTCFullYear()}${pad2(local.getUTCMonth() + 1)}${pad2(local.getUTCDate())}T${pad2(local.getUTCHours())}${pad2(local.getUTCMinutes())}${pad2(local.getUTCSeconds())}`;
  }

  return undefined;
}

function attachTz(date, tzid) {
  if (date && tzid && date.tz !== tzid) {
    Object.defineProperty(date, 'tz', {
      value: tzid,
      enumerable: true,
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

  try {
    // Rely on Intl throwing for invalid timeZone identifiers
    // This is more portable across Node builds than Temporal alone
    const tz = resolveZone(zone);

    new Intl.DateTimeFormat('en-US', {timeZone: tz}).format(new Date(0));
    return true;
  } catch {
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
  // Initial guess: interpret local fields as if they were UTC
  let t = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);

  const ymdhmsToUtcMs = f => Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const getLocalParts = date => {
    const df = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = df.formatToParts(date);
    const out = {};
    for (const p of parts) {
      if (p.type === 'year') {
        out.year = Number(p.value);
      }

      if (p.type === 'month') {
        out.month = Number(p.value);
      }

      if (p.type === 'day') {
        out.day = Number(p.value);
      }

      if (p.type === 'hour') {
        out.hour = Number(p.value);
      }

      if (p.type === 'minute') {
        out.minute = Number(p.value);
      }

      if (p.type === 'second') {
        out.second = Number(p.value);
      }
    }

    // Handle 24:00 edge case which some TZs may produce for midnight
    // This seems only happen with node < 22 and only for certain zones
    if (Object.hasOwn(out, 'hour') && out.hour === 24) {
      out.hour = 0;
    }

    return out;
  };

  // Iterate a couple times to converge even across DST transitions
  const target = fields;
  for (let i = 0; i < 2; i++) {
    const current = getLocalParts(new Date(t));
    const delta = ymdhmsToUtcMs(current) - ymdhmsToUtcMs(target);
    if (delta === 0) {
      break;
    }

    t -= delta;
  }

  return attachTz(new Date(t), zone);
}

function parseWithOffset(yyyymmddThhmmss, offset) {
  // Offset like +hh:mm, -hh:mm, +hhmm, -hhmm, optionally prefixed by UTC/GMT
  const s = String(yyyymmddThhmmss);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (!m) {
    return undefined;
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || 0);
  // Convert offset to minutes
  const o = String(offset).trim().replace(/^\(?(?:utc|gmt)\)?\s*/i, '');
  const om = o.match(/^([+-])?(\d{1,2})(?::?(\d{2}))?$/);
  const sign = om && om[1] === '-' ? -1 : 1;
  const oh = om ? Number(om[2]) : 0;
  const omm = om && om[3] ? Number(om[3]) : 0;
  const minutesComponent = (oh * 60) + omm;
  const totalMinutes = sign * minutesComponent;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - (totalMinutes * 60_000);
  return new Date(utcMs);
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
};
