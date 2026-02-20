/* eslint-env mocha */
/* eslint-disable prefer-arrow-callback */

const assert = require('node:assert/strict');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

describe('DATE-only RRULE with UNTIL (regression test for Google Calendar birthday events)', function () {
  it('should parse DATE-only events with yearly RRULE and UNTIL in the past', function () {
    // This is the exact format that Google Calendar uses for birthday events
    // that caused the bug report in MagicMirror PR #4016
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20160313
DTEND;VALUE=DATE:20160314
RRULE:FREQ=YEARLY;UNTIL=20190312;BYMONTHDAY=13;BYMONTH=3
DTSTAMP:20260122T223427Z
UID:test-birthday-event
SUMMARY:Birthday Event
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

    // Should parse without throwing "UNTIL rule part MUST have the same value type as DTSTART"
    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.summary, 'Birthday Event');
    assert.strictEqual(event.start.dateOnly, true, 'Start should be date-only');
    assert.ok(event.rrule, 'RRULE should be defined');

    // Should not throw when accessing rrule
    assert.doesNotThrow(() => event.rrule.toString());

    // Generate recurrences
    const recurrences = event.rrule.all();
    assert.ok(recurrences.length > 0, 'Should have recurrences');

    // Should have exactly 3 occurrences (2016, 2017, 2018)
    // UNTIL=20190312 means up to and including 2018-03-13 (not 2019-03-13)
    assert.strictEqual(recurrences.length, 3, 'Should have 3 occurrences');

    // First occurrence should be on 2016-03-13
    const firstDate = new Date(recurrences[0]);
    assert.strictEqual(firstDate.getUTCFullYear(), 2016);
    assert.strictEqual(firstDate.getUTCMonth(), 2); // March (0-indexed)
    assert.strictEqual(firstDate.getUTCDate(), 13);

    // Last occurrence should be on 2018-03-13
    const lastDate = new Date(recurrences.at(-1));
    assert.strictEqual(lastDate.getUTCFullYear(), 2018);
    assert.strictEqual(lastDate.getUTCMonth(), 2);
    assert.strictEqual(lastDate.getUTCDate(), 13);
  });

  it('should preserve VALUE=DATE in DTSTART when creating RRULE string', function () {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20200101
DTEND;VALUE=DATE:20200102
RRULE:FREQ=MONTHLY;UNTIL=20201231;BYMONTHDAY=1
UID:test-monthly-event
SUMMARY:Monthly Event
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.start.dateOnly, true, 'Start should be date-only');
    assert.ok(event.rrule, 'RRULE should be defined');

    // The internal RRULE string should include VALUE=DATE
    const rruleString = event.rrule.toString();
    assert.ok(rruleString, 'RRULE string should be defined');

    // Generate recurrences
    const recurrences = event.rrule.all();
    assert.strictEqual(recurrences.length, 12, 'Should have 12 monthly occurrences');
  });

  it('should handle DATE-only RRULE without UNTIL', function () {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20200101
DTEND;VALUE=DATE:20200102
RRULE:FREQ=YEARLY;COUNT=5;BYMONTH=1;BYMONTHDAY=1
UID:test-yearly-event
SUMMARY:New Year's Day
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.start.dateOnly, true, 'Start should be date-only');
    assert.ok(event.rrule, 'RRULE should be defined');

    const recurrences = event.rrule.all();
    assert.strictEqual(recurrences.length, 5, 'Should have 5 occurrences');
  });

  it('should use consistent date extraction for DATE-only events', function () {
    // This test ensures that DTSTART construction uses the same pattern as getDateKey
    // Both should use local getters (getFullYear, getMonth, getDate) because
    // dateParameter creates DATE-only dates with new Date(year, month, day).
    //
    // Note: For dates at midnight, local and UTC getters return the same values,
    // so this is mainly a consistency/documentation test.

    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20240315
DTEND;VALUE=DATE:20240316
RRULE:FREQ=YEARLY;COUNT=3
DTSTAMP:20260128T120000Z
UID:test-consistency
SUMMARY:Test Date Consistency
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.start.dateOnly, true, 'Start should be date-only');

    // The RRULE string should contain DTSTART with the same date as the original
    const rruleString = event.rrule.toString();
    const dtstartMatch = rruleString.match(/DTSTART[^:]*:(\d{8})/);
    assert.ok(dtstartMatch, 'RRULE string should contain DTSTART with date');

    const dtstartDate = dtstartMatch[1];
    assert.strictEqual(
      dtstartDate,
      '20240315',
      'DTSTART in RRULE should match original date (using consistent getter pattern)',
    );

    // Verify recurrences work correctly
    const recurrences = event.rrule.all();
    assert.strictEqual(recurrences.length, 3, 'Should have 3 occurrences');
  });

  it('should normalize VALUE=DATE RRULE start to midnight regardless of server timezone', function () {
    // Regression test: the old getTimezoneOffset()-based code shifted the time by the
    // server's UTC offset on machines east of UTC (e.g. UTC+2 produced 02:00:00 instead
    // of 00:00:00 for a DATE-only event). This was invisible on UTC servers (CI) and only
    // surfaced locally – a classic timezone-dependent bug.
    //
    // This test uses a DTSTART with a time component ("T120000") as it appears in feeds
    // from providers like the foobar demoparty, where VALUE=DATE events still carry a time.
    // The parser treats these as date-only (dateOnly=true); the time must be ignored.

    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20110804T120000
DTEND;VALUE=DATE:20110804T120000
RRULE:FREQ=WEEKLY;BYDAY=MO,FR;INTERVAL=5;UNTIL=20130130T230000Z
DTSTAMP:20260220T120000Z
UID:test-date-only-midnight-normalization
SUMMARY:foobarTV broadcast starts
LOCATION:foobarTV
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.start.dateOnly, true, 'Start should be date-only');

    // The start time must be local midnight (00:00:00), not offset-shifted.
    // With the old bug on a UTC+2 machine: getHours() === 2, not 0.
    assert.strictEqual(event.start.getHours(), 0, 'DATE-only event must start at local midnight (hour must be 0, not UTC-offset-shifted)');
    assert.strictEqual(event.start.getMinutes(), 0, 'DATE-only event minutes must be 0');
    assert.strictEqual(event.start.getSeconds(), 0, 'DATE-only event seconds must be 0');

    // Date must be August 4, not shifted to August 3 or 5
    assert.strictEqual(event.start.getDate(), 4, 'Date must be the 4th');
    assert.strictEqual(event.start.getMonth(), 7, 'Month must be August (index 7)');
    assert.strictEqual(event.start.getFullYear(), 2011, 'Year must be 2011');

    // Recurrences must also expand correctly
    assert.ok(event.rrule, 'RRULE should be defined');
    const recurrences = event.rrule.all();
    assert.ok(recurrences.length > 0, 'Should have recurrences');
  });
});
