import {getDateKey} from './date-utils.js';

// Shared recurring expansion implementation used by both CJS and ESM entrypoints.

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
    // Full-day events: use local getters - RRULE returns local-midnight dates
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
  const copyMetaProperty = (name, value) => {
    if (value === undefined) {
      return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor?.writable === false) {
      // ESM runs in strict mode, so reassigning an existing read-only metadata property throws.
      if (descriptor.value === value) {
        return;
      }

      if (descriptor.configurable) {
        Object.defineProperty(target, name, {...descriptor, value});
      }

      return;
    }

    target[name] = value;
  };

  if (source?.tz) {
    copyMetaProperty('tz', source.tz);
  }

  if (source?.dateOnly) {
    copyMetaProperty('dateOnly', source.dateOnly);
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
  if (utcDate?.dateOnly) {
    const year = utcDate.getFullYear();
    const month = utcDate.getMonth();
    const day = utcDate.getDate();
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  const year = utcDate.getUTCFullYear();
  const month = utcDate.getUTCMonth();
  const day = utcDate.getUTCDate();
  return new Date(year, month, day, 0, 0, 0, 0);
}

function getFullDaySpanDays(eventData) {
  if (eventData?.start && eventData.end) {
    const startDate = new Date(eventData.start);
    const endDate = new Date(eventData.end);
    const startDay = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDay = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.max(1, Math.round((endDay - startDay) / (24 * 60 * 60 * 1000)));
  }

  return 1;
}

/**
 * Get event duration in milliseconds.
 * @param {object} eventData - The event data (original or override)
 * @param {boolean} isFullDay - Whether this is a full-day event
 * @returns {number} Duration in milliseconds
 */
function getEventDurationMs(eventData, isFullDay) {
  if (isFullDay) {
    return getFullDaySpanDays(eventData) * 24 * 60 * 60 * 1000;
  }

  if (eventData?.start && eventData.end) {
    return new Date(eventData.end).getTime() - new Date(eventData.start).getTime();
  }

  return 0;
}

/**
 * Calculate end time for an event instance.
 * @param {Date} start - The start time of this specific instance
 * @param {object} eventData - The event data (original or override)
 * @param {boolean} isFullDay - Whether this is a full-day event
 * @param {number} [baseDurationMs] - Base duration (used when override lacks end)
 * @returns {Date} End time for this instance
 */
function calculateEndTime(start, eventData, isFullDay, baseDurationMs) {
  if (isFullDay) {
    const daySpan = eventData?.start && eventData.end
      ? getFullDaySpanDays(eventData)
      : Math.max(1, Math.round((baseDurationMs ?? (24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000)));

    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + daySpan, 0, 0, 0, 0);
  }

  const durationMs = (eventData?.start && eventData.end)
    ? getEventDurationMs(eventData, isFullDay)
    : (baseDurationMs ?? 0);

  return new Date(start.getTime() + durationMs);
}

function getOverrideRecurrenceKey(overrideEvent) {
  if (!(overrideEvent?.recurrenceid instanceof Date)) {
    return undefined;
  }

  return overrideEvent.recurrenceid.dateOnly === true
    ? getDateKey(overrideEvent.recurrenceid)
    : overrideEvent.recurrenceid.toISOString();
}

function buildOverrideInstance(overrideEvent, event, isFullDay, baseDurationMs) {
  if (!(overrideEvent?.start instanceof Date) && !(overrideEvent?.start)) {
    return null;
  }

  let start = overrideEvent.start instanceof Date ? overrideEvent.start : new Date(overrideEvent.start);
  if (isFullDay) {
    start = createLocalDateFromUTC(start);
  }

  const end = calculateEndTime(start, overrideEvent, isFullDay, baseDurationMs);
  const instance = {
    start,
    end,
    summary: overrideEvent.summary || event.summary || '',
    isFullDay,
    isRecurring: true,
    isOverride: true,
    event: overrideEvent,
  };

  copyDateMeta(instance.start, overrideEvent.start);
  copyDateMeta(instance.end, overrideEvent.end || event.end);

  return instance;
}

function collectOverrideInstances(event, {
  isFullDay,
  baseDurationMs,
  from,
  to,
  expandOngoing,
  seenKeys,
}) {
  if (!event.recurrences) {
    return [];
  }

  const overrideEvents = new Set(Object.values(event.recurrences));
  const instances = [];

  for (const overrideEvent of overrideEvents) {
    const recurrenceKey = getOverrideRecurrenceKey(overrideEvent);
    if (!recurrenceKey) {
      continue;
    }

    if (recurrenceKey && seenKeys.has(recurrenceKey)) {
      continue;
    }

    const instance = buildOverrideInstance(overrideEvent, event, isFullDay, baseDurationMs);
    if (!instance || !isInstanceInRange(instance, from, to, expandOngoing)) {
      continue;
    }

    if (recurrenceKey) {
      seenKeys.add(recurrenceKey);
    }

    instances.push(instance);
  }

  return instances;
}

/**
 * Process a non-recurring event.
 * @param {object} event
 * @param {object} options
 * @returns {Array<object>} Array of event instances
 */
function processNonRecurringEvent(event, options) {
  const {from, to, expandOngoing} = options;
  const isFullDay = event.datetype === 'date' || Boolean(event.start?.dateOnly);
  const baseDurationMs = getEventDurationMs(event, isFullDay);

  let eventStart = event.start instanceof Date ? event.start : new Date(event.start);

  if (isFullDay) {
    eventStart = createLocalDateFromUTC(eventStart);
  }

  const eventEnd = calculateEndTime(eventStart, event, isFullDay, baseDurationMs);

  const isInRange = expandOngoing
    ? (eventEnd >= from && eventStart <= to)
    : (eventStart >= from && eventStart <= to);

  if (!isInRange) {
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

  copyDateMeta(instance.start, event.start);
  copyDateMeta(instance.end, event.end);

  return [instance];
}

/**
 * Check if a date is excluded by EXDATE rules.
 * @param {Date} date - The instance date to check
 * @param {object} event - The calendar event
 * @param {string} dateKey - Pre-computed date key
 * @param {boolean} isFullDay - Whether the event is a full-day event
 * @returns {boolean} True if the date is excluded
 */
function isExcludedByExdate(date, event, dateKey, isFullDay) {
  if (!event.exdate) {
    return false;
  }

  if (isFullDay) {
    for (const exdateValue of new Set(Object.values(event.exdate))) {
      if (exdateValue instanceof Date && getDateKey(exdateValue) === dateKey) {
        return true;
      }
    }

    return false;
  }

  const isoKey = date.toISOString();
  const hasIsoExdate = Object.hasOwn(event.exdate, isoKey);
  const dateKeyExdate = event.exdate[dateKey];
  return hasIsoExdate || Boolean(dateKeyExdate?.dateOnly);
}

/**
 * Validate that from/to are proper Dates in the right order.
 * @param {Date} from
 * @param {Date} to
 */
function validateDateRange(from, to) {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
    throw new TypeError('options.from must be a valid Date object');
  }

  if (!(to instanceof Date) || Number.isNaN(to.getTime())) {
    throw new TypeError('options.to must be a valid Date object');
  }

  if (from > to) {
    throw new RangeError('options.from must be before or equal to options.to');
  }
}

/**
 * Compute the effective RRULE search window from the user-facing range.
 * @param {Date} from
 * @param {Date} to
 * @param {boolean} isFullDay
 * @param {boolean} expandOngoing
 * @param {number} baseDurationMs
 * @returns {{searchFrom: Date, searchTo: Date}} Adjusted search range bounds
 */
function adjustSearchRange(from, to, isFullDay, expandOngoing, baseDurationMs) {
  let searchFrom;
  let searchTo;

  if (isFullDay) {
    searchFrom = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
    searchTo = new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999));
  } else {
    const isMidnight = to.getHours() === 0 && to.getMinutes() === 0 && to.getSeconds() === 0;
    searchFrom = from;
    searchTo = isMidnight
      ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
      : to;
  }

  if (expandOngoing) {
    searchFrom = new Date(searchFrom.getTime() - baseDurationMs);
  }

  return {searchFrom, searchTo};
}

/**
 * Build a single recurring event instance for an RRULE-generated date.
 * @param {Date} date - RRULE-generated Date
 * @param {object} event - The base VEVENT
 * @param {boolean} isFullDay - Pre-computed full-day flag
 * @param {number} baseDurationMs - Pre-computed base duration
 * @param {{excludeExdates: boolean, includeOverrides: boolean}} options
 * @returns {object|null} Event instance or null if excluded
 */
function buildRecurringInstance(date, event, isFullDay, baseDurationMs, options) {
  const {excludeExdates, includeOverrides} = options;
  const dateKey = generateDateKey(date, isFullDay);

  if (excludeExdates && isExcludedByExdate(date, event, dateKey, isFullDay)) {
    return null;
  }

  const isoKey = isFullDay ? null : date.toISOString();
  const overrideEvent = includeOverrides
    && (isoKey ? event.recurrences?.[isoKey] : event.recurrences?.[dateKey]);
  const isOverride = Boolean(overrideEvent);
  const instanceEvent = isOverride ? overrideEvent : event;

  let start = (isOverride && instanceEvent.start)
    ? (instanceEvent.start instanceof Date ? instanceEvent.start : new Date(instanceEvent.start))
    : date;

  if (isFullDay) {
    start = createLocalDateFromUTC(start);
  }

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

  copyDateMeta(instance.start, (isOverride ? instanceEvent : event).start);
  copyDateMeta(instance.end, instanceEvent.end || event.end);

  return instance;
}

/**
 * Check if an event instance is within the specified date range.
 * @param {object} instance - Event instance with start, end, isFullDay
 * @param {Date} from - Range start
 * @param {Date} to - Range end
 * @param {boolean} expandOngoing - Whether to include ongoing events
 * @returns {boolean} Whether instance is in range
 */
function isInstanceInRange(instance, from, to, expandOngoing) {
  if (instance.isFullDay) {
    const instanceDate = new Date(instance.start.getFullYear(), instance.start.getMonth(), instance.start.getDate());
    const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const instanceEndDate = new Date(instance.end.getFullYear(), instance.end.getMonth(), instance.end.getDate());

    return expandOngoing
      ? (instanceEndDate >= fromDate && instanceDate <= toDate)
      : (instanceDate >= fromDate && instanceDate <= toDate);
  }

  return expandOngoing
    ? (instance.end >= from && instance.start <= to)
    : (instance.start >= from && instance.start <= to);
}

/**
 * Expand a recurring event into individual instances within a date range.
 * Handles RRULE expansion, EXDATE filtering, and RECURRENCE-ID overrides.
 * Also works for non-recurring events (returns a single instance if within range).
 * @param {object} event - The VEVENT object (with or without rrule)
 * @param {object} options - Expansion options
 * @param {Date} options.from - Start of date range (inclusive)
 * @param {Date} options.to - End of date range (inclusive)
 * @param {boolean} [options.includeOverrides=true] - Apply RECURRENCE-ID overrides
 * @param {boolean} [options.excludeExdates=true] - Filter out EXDATE exclusions
 * @param {boolean} [options.expandOngoing=false] - Include ongoing events
 * @returns {Array<object>} Sorted array of event instances
 */
export default function expandRecurringEvent(event, options) {
  const {
    from,
    to,
    includeOverrides = true,
    excludeExdates = true,
    expandOngoing = false,
  } = options;

  validateDateRange(from, to);

  if (!event.rrule) {
    return processNonRecurringEvent(event, {from, to, expandOngoing});
  }

  const isFullDay = event.datetype === 'date' || Boolean(event.start?.dateOnly);
  const baseDurationMs = getEventDurationMs(event, isFullDay);
  const {searchFrom, searchTo} = adjustSearchRange(from, to, isFullDay, expandOngoing, baseDurationMs);
  const dates = event.rrule.between(searchFrom, searchTo, true);
  const instances = [];
  const seenRecurrenceKeys = new Set();

  for (const date of dates) {
    const instance = buildRecurringInstance(date, event, isFullDay, baseDurationMs, {excludeExdates, includeOverrides});
    if (instance && isInstanceInRange(instance, from, to, expandOngoing)) {
      seenRecurrenceKeys.add(instance.isOverride ? getOverrideRecurrenceKey(instance.event) : date.toISOString());
      instances.push(instance);
    }
  }

  if (includeOverrides) {
    instances.push(...collectOverrideInstances(event, {
      isFullDay,
      baseDurationMs,
      from,
      to,
      expandOngoing,
      seenKeys: seenRecurrenceKeys,
    }));
  }

  return instances.toSorted((a, b) => a.start - b.start);
}
