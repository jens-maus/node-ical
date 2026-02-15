/* eslint-env mocha */
/* eslint-disable prefer-arrow-callback */

const assert = require('node:assert/strict');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

/**
 * Regression tests for Google Calendar's UNTIL format bug (#435, rrule-temporal#104).
 *
 * Google Calendar sometimes produces RRULE with DATE-only UNTIL when DTSTART is DATE-TIME:
 *   DTSTART;TZID=Europe/Oslo:20211216T180000
 *   RRULE:FREQ=WEEKLY;UNTIL=20211216  ← Missing time component
 *
 * Since rrule-temporal 1.4.6, this normalization is handled upstream by the library.
 * These tests verify that the library correctly interprets UNTIL in the event's timezone.
 */
describe('Google Calendar UNTIL format bug (regression test for #435 and rrule-temporal #104)', function () {
  it('should parse DATE-TIME event with TZID when UNTIL has no time component', function () {
    // Google Calendar sometimes produces RRULE with UNTIL that has no time part
    // even though DTSTART is a DATE-TIME with TZID
    // Example: DTSTART;TZID=Europe/Oslo:20211216T180000
    //          RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20211216
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
DTSTART;TZID=Europe/Oslo:20211216T180000
DTEND;TZID=Europe/Oslo:20211216T210000
RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20211216
DTSTAMP:20260131T133352Z
UID:test-google-until-bug-1@google.com
CREATED:20210806T102732Z
LAST-MODIFIED:20211027T181221Z
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Weekly Meeting (Google Calendar bug)
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.summary, 'Weekly Meeting (Google Calendar bug)');
    assert.ok(event.rrule, 'RRULE should be defined');

    // Should not throw when accessing rrule
    assert.doesNotThrow(() => event.rrule.toString());

    // Generate recurrences - should work without throwing
    const recurrences = event.rrule.all();

    // UNTIL=20211216 with DTSTART on 20211216 should yield exactly 1 occurrence
    assert.strictEqual(recurrences.length, 1, 'Should have exactly 1 occurrence');

    // The occurrence should be on Dec 16, 2021
    const firstDate = new Date(recurrences[0]);
    assert.strictEqual(firstDate.getUTCFullYear(), 2021);
    assert.strictEqual(firstDate.getUTCMonth(), 11); // December (0-indexed)
    assert.strictEqual(firstDate.getUTCDate(), 16);
  });

  it('should parse DATE-TIME event with UTC when UNTIL has no time component', function () {
    // Google Calendar can also produce this with UTC times
    // Example: DTSTART:20110106T000000Z
    //          RRULE:FREQ=YEARLY;WKST=MO;UNTIL=20361231;BYMONTHDAY=6;BYMONTH=1
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
DTSTART:20110106T000000Z
DTEND:20110106T010000Z
RRULE:FREQ=YEARLY;WKST=MO;UNTIL=20361231;BYMONTHDAY=6;BYMONTH=1
DTSTAMP:20260131T164213Z
UID:test-google-until-bug-2@google.com
CREATED:20110102T173217Z
LAST-MODIFIED:20230130T133441Z
SEQUENCE:2
STATUS:TENTATIVE
SUMMARY:Annual Event (Google Calendar bug)
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.summary, 'Annual Event (Google Calendar bug)');
    assert.ok(event.rrule, 'RRULE should be defined');

    // Should not throw when accessing rrule
    assert.doesNotThrow(() => event.rrule.toString());

    // Generate recurrences
    const recurrences = event.rrule.all();

    // Should span 2011 to 2036 (26 years)
    assert.strictEqual(recurrences.length, 26, 'Should have exactly 26 yearly occurrences');

    // First occurrence should be on 2011-01-06
    const firstDate = new Date(recurrences[0]);
    assert.strictEqual(firstDate.getUTCFullYear(), 2011);
    assert.strictEqual(firstDate.getUTCMonth(), 0); // January (0-indexed)
    assert.strictEqual(firstDate.getUTCDate(), 6);

    // Last occurrence should be on 2036-01-06
    const lastDate = new Date(recurrences.at(-1));
    assert.strictEqual(lastDate.getUTCFullYear(), 2036);
    assert.strictEqual(lastDate.getUTCMonth(), 0);
    assert.strictEqual(lastDate.getUTCDate(), 6);
  });

  it('should correctly interpret UNTIL in event timezone (Pacific/Auckland edge case)', function () {
    // Critical edge case: Pacific/Auckland is UTC+13 in summer
    // If we naively use T235959Z (UTC), events on the next day in Auckland could be included
    //
    // Event: 10:00 Auckland on Dec 16 (= Dec 15 21:00 UTC)
    // UNTIL=20211216 should mean "until end of Dec 16 in Auckland timezone"
    // End of Dec 16 Auckland = Dec 16 23:59:59 NZDT = Dec 16 10:59:59 UTC
    //
    // If we wrongly used T235959Z, UNTIL would be Dec 16 23:59:59 UTC = Dec 17 12:59:59 Auckland
    // This would incorrectly include Dec 17 Auckland events!
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;TZID=Pacific/Auckland:20211215T100000
DTEND;TZID=Pacific/Auckland:20211215T110000
RRULE:FREQ=DAILY;UNTIL=20211216
DTSTAMP:20260131T180000Z
UID:test-auckland-timezone@test.com
SUMMARY:Auckland Daily Event
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.ok(event.rrule, 'RRULE should be defined');

    const recurrences = event.rrule.all();

    // Should have exactly 2 occurrences: Dec 15 and Dec 16 (Auckland time)
    // NOT Dec 17, even though Dec 17 10:00 Auckland = Dec 16 21:00 UTC < Dec 16 23:59:59 UTC
    assert.strictEqual(recurrences.length, 2, 'Should have exactly 2 occurrences (Dec 15 and Dec 16 Auckland)');

    // Verify the dates are Dec 15 and Dec 16 in UTC (which is Dec 14/15 21:00 UTC)
    const dates = recurrences.map(r => new Date(r));

    // Dec 15 10:00 Auckland = Dec 14 21:00 UTC
    assert.strictEqual(dates[0].getUTCDate(), 14);
    assert.strictEqual(dates[0].getUTCHours(), 21);

    // Dec 16 10:00 Auckland = Dec 15 21:00 UTC
    assert.strictEqual(dates[1].getUTCDate(), 15);
    assert.strictEqual(dates[1].getUTCHours(), 21);
  });

  it('should handle UNTIL without time for daily events spanning multiple days', function () {
    // Simple case: daily event from Jan 1-3
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
RRULE:FREQ=DAILY;UNTIL=20240103
DTSTAMP:20260131T180000Z
UID:test-until-normalization@test.com
SUMMARY:Daily until Jan 3rd
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.ok(event.rrule, 'RRULE should be defined');

    const recurrences = event.rrule.all();

    // Should include Jan 1st, 2nd, and 3rd (3 occurrences)
    assert.strictEqual(recurrences.length, 3, 'Should have exactly 3 occurrences');

    // Verify dates
    const dates = recurrences.map(r => new Date(r).getUTCDate());
    assert.deepStrictEqual(dates, [1, 2, 3], 'Should be Jan 1, 2, 3');
  });

  it('should handle UNTIL without time for Europe/Berlin timezone', function () {
    // Europe/Berlin is UTC+1 in winter, UTC+2 in summer
    // Event at 22:00 Berlin time on Jan 15
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20240115T220000
DTEND;TZID=Europe/Berlin:20240115T230000
RRULE:FREQ=DAILY;UNTIL=20240117
DTSTAMP:20260131T180000Z
UID:test-berlin-late-evening@test.com
SUMMARY:Late evening Berlin event
END:VEVENT
END:VCALENDAR`;

    const parsed = ical.parseICS(icsData);
    const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

    assert.ok(event, 'Event should be defined');
    assert.ok(event.rrule, 'RRULE should be defined');

    const recurrences = event.rrule.all();

    // Should have 3 occurrences: Jan 15, 16, 17 (Berlin time)
    assert.strictEqual(recurrences.length, 3, 'Should have exactly 3 occurrences');

    // Jan 15 22:00 Berlin = Jan 15 21:00 UTC (winter time, UTC+1)
    const dates = recurrences.map(r => {
      const d = new Date(r);
      return {date: d.getUTCDate(), hour: d.getUTCHours()};
    });

    assert.strictEqual(dates[0].date, 15);
    assert.strictEqual(dates[0].hour, 21);
    assert.strictEqual(dates[1].date, 16);
    assert.strictEqual(dates[2].date, 17);
  });
});
