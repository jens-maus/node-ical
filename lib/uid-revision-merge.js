import {getDateKey} from './date-utils.js';

/*
 * Merge model for calendar components that share a UID.
 *
 * One calendar can contain several components with the same UID: revisions of the same
 * event (RFC 5545 §3.8.7.4 SEQUENCE) and overrides of single occurrences of a recurring
 * series (§3.8.4.4 RECURRENCE-ID). The parser keeps one entry per UID and resolves every
 * component that carries a UID, in the order the components appear, as follows:
 *
 * 1. No entry for the UID yet: the component becomes the entry and inherits the calendar
 *    METHOD. If it is an override, the entry is a placeholder until the base component
 *    arrives (see 3a), and the override is also stored as in 2.
 * 2. Override (has RECURRENCE-ID): stored in `entry.recurrences` under its date key and,
 *    for DATE-TIME values, its ISO key. Revisions of one occurrence follow SEQUENCE: an
 *    older one is ignored, an equal or newer one replaces the stored override. While the
 *    entry is a placeholder for that same occurrence, an accepted revision replaces the
 *    entry as well, so it never shows an outdated version of the occurrence.
 * 3. Base component (no RECURRENCE-ID), whether it uses RRULE, RDATE or neither:
 *    a. The entry is an override placeholder: the base component replaces it whatever the
 *       SEQUENCE values, because an override counts revisions of its occurrence only.
 *    b. Otherwise SEQUENCE precedence applies: an older revision is ignored with a
 *       warning, an equal or newer one replaces the entry.
 * 4. An entry with an RRULE never keeps a RECURRENCE-ID of its own.
 *
 * Replacing an entry keeps the entry object and its parser-owned fields (see
 * PARSER_OWNED_FIELDS), takes every parsed field from the incoming revision and removes
 * parsed fields the incoming revision no longer has, so no stale data survives.
 */

// Fields that the parser maintains across revisions instead of reading them from one
// component: the collected recurrence overrides and the METHOD inherited from VCALENDAR.
const PARSER_OWNED_FIELDS = new Set(['recurrences', 'method']);

/**
 * @typedef {(recurrences: object, recurrenceId: Date, recurrenceObject: object) => void} StoreOverride
 */

/**
 * Set a field as an own property, also for the key `__proto__`.
 * @param {object} target
 * @param {string} key
 * @param {unknown} value
 * @returns {void}
 */
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

/**
 * Read a field only if it is an own property, so `__proto__` and inherited names never match.
 * @param {object} target
 * @param {string} key
 * @returns {unknown} The own field value, or undefined
 */
function getOwnRecordField(target, key) {
  return Object.hasOwn(target, key) ? target[key] : undefined;
}

function copyRecordFields(target, source) {
  for (const [key, value] of Object.entries(source)) {
    setOwnRecordField(target, key, value);
  }
}

/**
 * Whether a component overrides a single occurrence of a recurring series.
 * @param {object} entry
 * @returns {boolean} True when the component has a RECURRENCE-ID
 */
function isOverride(entry) {
  return entry.recurrenceid !== undefined;
}

/**
 * SEQUENCE of a component, 0 when it is missing or not a number (RFC 5545 §3.8.7.4).
 * @param {object} entry
 * @returns {number} The SEQUENCE value
 */
function getSequence(entry) {
  return Number.isFinite(entry.sequence) ? entry.sequence : 0;
}

/**
 * Replace the stored entry with an accepted revision, keeping the entry object and its
 * parser-owned fields. Parsed fields missing from the revision are removed.
 * @param {object} storedEntry - Entry to update in place
 * @param {object} revision - Accepted incoming revision
 * @returns {void}
 */
function replaceRevision(storedEntry, revision) {
  for (const key of Object.keys(storedEntry)) {
    if (!PARSER_OWNED_FIELDS.has(key) && !Object.hasOwn(revision, key)) {
      delete storedEntry[key];
    }
  }

  copyRecordFields(storedEntry, revision);
}

/**
 * Decide whether an incoming base component replaces the stored entry (rules 3a and 3b).
 * @param {object} storedEntry - Entry stored for the UID
 * @param {object} baseComponent - Incoming component without RECURRENCE-ID
 * @returns {boolean} True to replace, false to ignore an older revision
 */
function isAcceptedBaseRevision(storedEntry, baseComponent) {
  return isOverride(storedEntry) || getSequence(baseComponent) >= getSequence(storedEntry);
}

/**
 * Store a recurrence override with dual-key strategy (rule 2).
 * Uses both date-only (YYYY-MM-DD) and full ISO keys for DATE-TIME entries.
 * Implements RFC 5545 SEQUENCE logic: newer versions (higher SEQUENCE) replace older ones.
 * @param {object} recurrences - Recurrences object to store in
 * @param {Date} recurrenceId - RECURRENCE-ID date value
 * @param {object} recurrenceObject - Recurrence override data
 * @returns {void}
 */
function storeRecurrenceOverride(recurrences, recurrenceId, recurrenceObject) {
  if (typeof recurrenceId.toISOString !== 'function') {
    console.warn(`[node-ical] Invalid recurrenceid (no toISOString): ${recurrenceId}`);
    return;
  }

  const dateKey = getDateKey(recurrenceId);
  const isoKey = recurrenceId.dateOnly === true ? null : recurrenceId.toISOString();

  // Prefer the ISO key if available (more precise), fall back to the date key.
  // This handles both DATE-TIME (precise time) and DATE (date-only) recurrence IDs.
  const existing = (isoKey && recurrences[isoKey]) || recurrences[dateKey];

  if (existing !== undefined) {
    const existingSeq = getSequence(existing);
    const newSeq = getSequence(recurrenceObject);

    if (newSeq < existingSeq) {
      const key = isoKey || dateKey;
      console.warn(`[node-ical] Ignoring older RECURRENCE-ID override (SEQUENCE ${newSeq} < ${existingSeq}) for ${key}`);
      return;
    }
  }

  recurrences[dateKey] = recurrenceObject;

  // Also store with full ISO key for DATE-TIME entries (enables precise matching)
  if (isoKey) {
    recurrences[isoKey] = recurrenceObject;
  }
}

/**
 * Copy an override into a standalone record for `entry.recurrences`.
 * @param {object} overrideComponent
 * @returns {object} Null-prototype copy without nested recurrences
 */
function buildRecurrenceOverrideObject(overrideComponent) {
  const recurrenceObject = Object.create(null);
  copyRecordFields(recurrenceObject, overrideComponent);

  if (recurrenceObject.recurrences !== undefined) {
    delete recurrenceObject.recurrences;
  }

  return recurrenceObject;
}

/**
 * Store an override in the recurrences of the UID entry (rule 2).
 * @param {object} entry - Entry stored for the UID
 * @param {object} overrideComponent - Incoming component with RECURRENCE-ID
 * @param {StoreOverride} storeOverride - Stores one override, see storeRecurrenceOverride()
 * @returns {boolean} True when the override was stored, false when it was ignored
 */
function addOverrideToEntry(entry, overrideComponent, storeOverride) {
  const recurrenceObject = buildRecurrenceOverrideObject(overrideComponent);
  entry.recurrences ||= {};
  storeOverride(entry.recurrences, overrideComponent.recurrenceid, recurrenceObject);
  return Object.values(entry.recurrences).includes(recurrenceObject);
}

/**
 * Whether the entry is still an override standing in for its missing base series.
 * An entry with an RRULE is a series, even if it kept a RECURRENCE-ID (see rule 4).
 * @param {object} entry
 * @returns {boolean} True for an override placeholder
 */
function isOverridePlaceholder(entry) {
  return isOverride(entry) && entry.rrule === undefined;
}

/**
 * Whether two overrides replace the same occurrence.
 * @param {object} first
 * @param {object} second
 * @returns {boolean} True when both RECURRENCE-ID values are the same instant
 */
function isSameOccurrence(first, second) {
  return first.recurrenceid instanceof Date
    && second.recurrenceid instanceof Date
    && first.recurrenceid.getTime() === second.recurrenceid.getTime();
}

/**
 * Drop the RECURRENCE-ID of an entry that carries an RRULE (rule 4).
 * @param {object} entry
 * @param {string} uid
 * @returns {void}
 */
function dropSeriesRecurrenceId(entry, uid) {
  if (uid !== '__proto__' && entry.rrule !== undefined && entry.recurrenceid !== undefined) {
    delete entry.recurrenceid;
  }
}

/**
 * Merge a finished component that carries a UID into the per-UID entries of its parent,
 * following the merge model described at the top of this module.
 * @param {object} parentEntry - Parent component holding one entry per UID
 * @param {object} component - Finished component
 * @param {StoreOverride} storeOverride - Stores one override, see storeRecurrenceOverride()
 * @returns {boolean} False when the component has no UID and is left to the caller
 */
function mergeUidComponent(parentEntry, component, storeOverride) {
  if (!component.uid) {
    return false;
  }

  const {uid} = component;
  let entry = getOwnRecordField(parentEntry, uid);

  if (entry === undefined) {
    // Rule 1
    setOwnRecordField(parentEntry, uid, component);
    entry = getOwnRecordField(parentEntry, uid);

    if (parentEntry.method) {
      entry.method = parentEntry.method;
    }
  } else if (!isOverride(component)) {
    // Rule 3
    if (isAcceptedBaseRevision(entry, component)) {
      replaceRevision(entry, component);
    } else {
      console.warn(`[node-ical] Ignoring older event version (SEQUENCE ${getSequence(component)} < ${getSequence(entry)}) for UID ${uid}`);
    }
  }

  if (isOverride(component)) {
    // Rule 2
    const isStored = addOverrideToEntry(entry, component, storeOverride);

    if (isStored && entry !== component && isOverridePlaceholder(entry) && isSameOccurrence(entry, component)) {
      replaceRevision(entry, component);
    }
  }

  dropSeriesRecurrenceId(entry, uid);
  return true;
}

export {
  mergeUidComponent,
  storeRecurrenceOverride,
};
