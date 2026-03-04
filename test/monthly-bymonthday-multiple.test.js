/* eslint-env mocha */
/* eslint-disable prefer-arrow-callback */

// Regression tests for FREQ=MONTHLY with multiple BYMONTHDAY values.
//
// Bug: When DTSTART fell on one of the BYMONTHDAY values AND another BYMONTHDAY
// value existed earlier in the same month, the entire start month was skipped.
// Fixed in rrule-temporal v1.4.7 (https://github.com/neogermi/rrule-temporal/pull/111)

const assert = require('node:assert/strict');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

describe('FREQ=MONTHLY with multiple BYMONTHDAY values (regression test for rrule-temporal v1.4.7)', function () {
  it('should include remaining BYMONTHDAY occurrences in the DTSTART month when a earlier BYMONTHDAY value exists', function () {
    // DTSTART is on the 24th. BYMONTHDAY=24,28,10 means 10 < 24 exists in the same month.
    // Bug: the start month (Feb) was skipped entirely.
    // Fix: Feb 24 and Feb 28 must both appear before moving to Mar 10.
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20260224T090000Z
DTEND:20260224T100000Z
RRULE:FREQ=MONTHLY;COUNT=9;BYMONTHDAY=24,28,10
DTSTAMP:20260304T000000Z
UID:test-monthly-bymonthday-multiple@regression
SUMMARY:Monthly Multi-BYMONTHDAY Test
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.ok(event.rrule, 'RRULE should be defined');

    const recurrences = event.rrule.all();

    // 9 occurrences: Feb(24,28), Mar(10,24,28), Apr(10,24,28), May(10)
    assert.strictEqual(recurrences.length, 9, 'Should have 9 occurrences');

    // First: Feb 24 (DTSTART itself must be included)
    const r0 = new Date(recurrences[0]);
    assert.strictEqual(r0.getUTCFullYear(), 2026);
    assert.strictEqual(r0.getUTCMonth(), 1, 'First occurrence: February');
    assert.strictEqual(r0.getUTCDate(), 24);

    // Second: Feb 28 (still in start month — was missing before the fix)
    const r1 = new Date(recurrences[1]);
    assert.strictEqual(r1.getUTCFullYear(), 2026);
    assert.strictEqual(r1.getUTCMonth(), 1, 'Second occurrence: still February (start month must not be skipped)');
    assert.strictEqual(r1.getUTCDate(), 28);

    // Third: Mar 10 (BYMONTHDAY=10 only appears from the second month onward since 10 < DTSTART day)
    const r2 = new Date(recurrences[2]);
    assert.strictEqual(r2.getUTCFullYear(), 2026);
    assert.strictEqual(r2.getUTCMonth(), 2, 'Third occurrence: March');
    assert.strictEqual(r2.getUTCDate(), 10);
  });

  it('should not include BYMONTHDAY occurrences before DTSTART within the start month', function () {
    // DTSTART is on the 24th. BYMONTHDAY=10,24,28 — day 10 must NOT appear in Feb
    // (it is before DTSTART), but must appear from Mar onward.
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20260224T090000Z
DTEND:20260224T100000Z
RRULE:FREQ=MONTHLY;COUNT=9;BYMONTHDAY=10,24,28
DTSTAMP:20260304T000000Z
UID:test-monthly-bymonthday-no-before-dtstart@regression
SUMMARY:Monthly Multi-BYMONTHDAY No Pre-DTSTART
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.ok(event.rrule, 'RRULE should be defined');

    const recurrences = event.rrule.all();

    assert.strictEqual(recurrences.length, 9, 'Should have 9 occurrences');

    // Feb 10 must NOT be first — it is before DTSTART
    const r0 = new Date(recurrences[0]);
    assert.strictEqual(r0.getUTCDate(), 24, 'First occurrence must be Feb 24, not Feb 10');

    // All occurrences must be >= DTSTART
    const dtstart = new Date('2026-02-24T09:00:00Z');
    for (const [index, rec] of recurrences.entries()) {
      assert.ok(
        new Date(rec) >= dtstart,
        `Occurrence ${index} (${new Date(rec).toISOString()}) must not be before DTSTART`,
      );
    }
  });

  it('should produce correct instances via expandRecurringEvent (end-to-end through all helpers)', function () {
    // Same scenario as the first test, but exercised through the full
    // expandRecurringEvent pipeline so that isExcludedByExdate,
    // buildRecurringInstance, adjustSearchRange etc. are all covered.
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20260224T090000Z
DTEND:20260224T100000Z
RRULE:FREQ=MONTHLY;COUNT=9;BYMONTHDAY=24,28,10
DTSTAMP:20260304T000000Z
UID:test-monthly-bymonthday-expand@regression
SUMMARY:Monthly Multi-BYMONTHDAY Expand Test
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');

    const instances = ical.expandRecurringEvent(event, {
      from: new Date('2026-02-24T00:00:00Z'),
      to: new Date('2026-05-31T23:59:59Z'),
    });

    // 9 occurrences within range: Feb(24,28), Mar(10,24,28), Apr(10,24,28), May(10)
    assert.strictEqual(instances.length, 9, 'Should have 9 instances');

    // First instance: Feb 24 (DTSTART — start month must not be skipped)
    assert.strictEqual(instances[0].start.getUTCMonth(), 1, 'First instance: February');
    assert.strictEqual(instances[0].start.getUTCDate(), 24);

    // Second instance: Feb 28 (was missing before the fix)
    assert.strictEqual(instances[1].start.getUTCMonth(), 1, 'Second instance: still February');
    assert.strictEqual(instances[1].start.getUTCDate(), 28);

    // Third instance: Mar 10
    assert.strictEqual(instances[2].start.getUTCMonth(), 2, 'Third instance: March');
    assert.strictEqual(instances[2].start.getUTCDate(), 10);

    // Each instance must carry the expected metadata
    for (const instance of instances) {
      assert.strictEqual(instance.isRecurring, true, 'All instances should be recurring');
      assert.strictEqual(instance.isFullDay, false, 'All instances should be timed (not full-day)');
    }
  });
});
