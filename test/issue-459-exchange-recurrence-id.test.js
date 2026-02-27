/**
 * Test for GitHub Issue #459
 * Exchange O365: Moved occurrence in a whole-day recurring event (BYDAY=TU,TH)
 * is not recognized because RECURRENCE-ID uses DATE-TIME with timezone while
 * the base event uses VALUE=DATE.
 *
 * Exchange emits: RECURRENCE-ID;TZID=W. Europe Standard Time:20260226T000000
 * For a DATE-only base event with: DTSTART;VALUE=DATE:20260219
 *
 * The RECURRENCE-ID midnight in CET (UTC+1) becomes 2026-02-25T23:00:00Z in UTC,
 * causing getDateKey() to return "2026-02-25" instead of the correct "2026-02-26".
 */
const assert = require('node:assert');
const path = require('node:path');
const {describe, it, before} = require('mocha');
const ical = require('../node-ical.js');

describe('Issue #459 - Exchange DATE-TIME RECURRENCE-ID on DATE-only event', () => {
  let events;
  let event;

  before(() => {
    events = ical.sync.parseFile(path.join(__dirname, 'fixtures', 'exchange_whole_day_moved_recurrence.ics'));
    event = Object.values(events).find(foundEvent => foundEvent.type === 'VEVENT' && foundEvent.rrule);
  });

  it('should parse the event with recurrences', () => {
    assert.ok(event, 'Should find the recurring event');
    assert.ok(event.rrule, 'Should have an rrule');
    assert.ok(event.recurrences, 'Should have recurrences');
    assert.strictEqual(event.datetype, 'date', 'Should be a date-only event');
  });

  it('should store the recurrence override under the correct date key (2026-02-26)', () => {
    // The RECURRENCE-ID refers to the occurrence on 2026-02-26 (Thursday).
    // Exchange sends: RECURRENCE-ID;TZID=W. Europe Standard Time:20260226T000000
    // This must be stored under "2026-02-26", NOT "2026-02-25".
    assert.ok(
      event.recurrences['2026-02-26'],
      'Recurrence override should be stored under "2026-02-26" (the actual calendar date), '
      + `but found keys: ${Object.keys(event.recurrences).join(', ')}`,
    );
  });

  it('should NOT have a stale recurrence key for "2026-02-25"', () => {
    // If the bug is present, the override is stored under "2026-02-25" (wrong UTC date)
    assert.ok(
      !event.recurrences['2026-02-25'],
      'Recurrence override should NOT be stored under "2026-02-25" (UTC-shifted date)',
    );
  });

  describe('expandRecurringEvent', () => {
    it('should show the moved occurrence on Friday 2026-02-27 (not Thursday 2026-02-26)', () => {
      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2026, 1, 19), // Feb 19
        to: new Date(2026, 2, 1), // Mar 1
      });

      assert.ok(instances.length > 0, 'Should have instances');

      // The RRULE generates: Feb 19 (Thu), Feb 24 (Tue), Feb 26 (Thu)
      // But Feb 26 is moved to Feb 27 (Fri) by the RECURRENCE-ID override
      const feb27Instance = instances.find(instance =>
        instance.start.getFullYear() === 2026
        && instance.start.getMonth() === 1
        && instance.start.getDate() === 27);
      assert.ok(feb27Instance, 'Should have an instance on Feb 27 (the moved occurrence)');
      assert.strictEqual(feb27Instance.isOverride, true, 'Feb 27 instance should be an override');
      assert.strictEqual(feb27Instance.isFullDay, true, 'Should be a full-day event');

      // The original Thursday Feb 26 should NOT appear as a regular instance
      // (it was moved to Feb 27)
      const feb26Instance = instances.find(instance =>
        instance.start.getFullYear() === 2026
        && instance.start.getMonth() === 1
        && instance.start.getDate() === 26
        && !instance.isOverride);
      assert.ok(
        !feb26Instance,
        'Should NOT have a non-override instance on Feb 26 (it was moved to Feb 27)',
      );
    });

    it('should still have normal occurrences on the other days', () => {
      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2026, 1, 19), // Feb 19
        to: new Date(2026, 2, 1), // Mar 1
      });

      // Feb 19 (Thu) - first occurrence
      const feb19 = instances.find(instance =>
        instance.start.getFullYear() === 2026
        && instance.start.getMonth() === 1
        && instance.start.getDate() === 19);
      assert.ok(feb19, 'Should have occurrence on Feb 19 (Thu)');
      assert.strictEqual(feb19.isOverride, false, 'Feb 19 should be a regular occurrence');

      // Feb 24 (Tue) - regular occurrence
      const feb24 = instances.find(instance =>
        instance.start.getFullYear() === 2026
        && instance.start.getMonth() === 1
        && instance.start.getDate() === 24);
      assert.ok(feb24, 'Should have occurrence on Feb 24 (Tue)');
      assert.strictEqual(feb24.isOverride, false, 'Feb 24 should be a regular occurrence');
    });
  });

  describe('offset-based TZID variant (RECURRENCE-ID;TZID=UTC+01:...)', () => {
    // Covers the hardened fallback path in getDateKey: when the TZID is a raw numeric
    // offset (e.g. "UTC+01") there is no IANA name, so offsetMinutes arithmetic is used.
    let offsetEvent;

    before(() => {
      const offsetEvents = ical.sync.parseFile(path.join(__dirname, 'fixtures', 'exchange_whole_day_moved_recurrence_offset_tz.ics'));
      offsetEvent = Object.values(offsetEvents).find(foundEvent => foundEvent.type === 'VEVENT' && foundEvent.rrule);
    });

    it('should store the override under the correct date key (2026-02-26) with offset TZID', () => {
      assert.ok(offsetEvent, 'Should find the recurring event');
      assert.ok(offsetEvent.recurrences, 'Should have recurrences');
      assert.ok(
        offsetEvent.recurrences['2026-02-26'],
        'Override should be stored under "2026-02-26" with TZID=UTC+01, '
        + `but found keys: ${Object.keys(offsetEvent.recurrences).join(', ')}`,
      );
    });

    it('should show the moved occurrence on Feb 27 when expanding with offset TZID', () => {
      const instances = ical.expandRecurringEvent(offsetEvent, {
        from: new Date(2026, 1, 19),
        to: new Date(2026, 2, 1),
      });

      const feb27 = instances.find(instance =>
        instance.start.getFullYear() === 2026
        && instance.start.getMonth() === 1
        && instance.start.getDate() === 27);
      assert.ok(feb27, 'Should have moved occurrence on Feb 27 (offset TZID variant)');
      assert.strictEqual(feb27.isOverride, true, 'Should be an override instance');

      const feb26 = instances.find(instance =>
        instance.start.getFullYear() === 2026
        && instance.start.getMonth() === 1
        && instance.start.getDate() === 26
        && instance.isOverride === false);
      assert.strictEqual(feb26, undefined, 'Original Feb 26 non-override instance should be absent (replaced by the moved override)');
    });
  });
});
