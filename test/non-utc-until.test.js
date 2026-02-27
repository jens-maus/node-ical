/* eslint-env mocha */
/* eslint-disable prefer-arrow-callback */

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

describe('Non-UTC UNTIL in RRULE', function () {
  describe('when DTSTART has TZID=Europe/Berlin', function () {
    it('should convert non-UTC UNTIL to UTC', function () {
      const data = readFileSync(path.join(__dirname, 'fixtures', 'non-utc-until.ics'), 'utf8');
      const parsed = ical.parseICS(data);

      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      assert.ok(event, 'Event should be defined');
      assert.strictEqual(event.summary, 'Weekly Meeting (Non-UTC UNTIL)');
      assert.ok(event.rrule, 'RRULE should be defined');

      // The RRULE should not throw an error
      assert.doesNotThrow(() => event.rrule.toString());

      // Verify UNTIL was converted to UTC
      const {until} = event.rrule.options;
      assert.ok(until, 'UNTIL should be defined');

      // UNTIL should be a Date object
      assert.ok(until instanceof Date, 'UNTIL should be a Date object');

      // Original: 20241231T100000 in Europe/Berlin (CET = UTC+1 in winter)
      // Expected UTC: 20241231T090000Z
      const expectedUtc = new Date('2024-12-31T09:00:00.000Z');
      assert.strictEqual(until.getTime(), expectedUtc.getTime());
    });

    it('should generate recurrences correctly with converted UNTIL', function () {
      const data = readFileSync(path.join(__dirname, 'fixtures', 'non-utc-until.ics'), 'utf8');
      const parsed = ical.parseICS(data);

      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      // Generate all recurrences
      const recurrences = event.rrule.all();

      // Should have recurrences
      assert.ok(recurrences.length > 0, 'Should have recurrences');

      // Last recurrence should be before or at UNTIL
      const lastRecurrence = recurrences.at(-1);
      const untilUtc = new Date('2024-12-31T09:00:00.000Z');

      assert.ok(lastRecurrence.getTime() <= untilUtc.getTime(), 'Last recurrence should be before or at UNTIL');
    });
  });

  describe('when DTSTART has TZID=America/New_York', function () {
    it('should convert non-UTC UNTIL to UTC for different timezone', function () {
      const data = readFileSync(path.join(__dirname, 'fixtures', 'non-utc-until-ny.ics'), 'utf8');
      const parsed = ical.parseICS(data);

      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      assert.ok(event, 'Event should be defined');
      assert.ok(event.rrule, 'RRULE should be defined');

      const {until} = event.rrule.options;
      assert.ok(until, 'UNTIL should be defined');

      // Original: 20240315T140000 in America/New_York (EDT = UTC-4, DST started March 10, 2024)
      // Expected UTC: 20240315T180000Z
      const expectedUtc = new Date('2024-03-15T18:00:00.000Z');
      assert.strictEqual(until.getTime(), expectedUtc.getTime());
    });
  });

  describe('when UNTIL is already in UTC format', function () {
    it('should not modify UTC UNTIL values', function () {
      const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-utc-until@example.com
DTSTART;TZID=Europe/Berlin:20240101T100000
RRULE:FREQ=WEEKLY;UNTIL=20241231T090000Z
SUMMARY:Test Event with UTC UNTIL
END:VEVENT
END:VCALENDAR`;

      const parsed = ical.parseICS(icsData);
      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      assert.ok(event, 'Event should be defined');
      assert.ok(event.rrule, 'RRULE should be defined');

      const {until} = event.rrule.options;
      const expectedUtc = new Date('2024-12-31T09:00:00.000Z');
      assert.strictEqual(until.getTime(), expectedUtc.getTime());
    });
  });

  describe('when DTSTART has no TZID (floating time)', function () {
    it('should not attempt to convert UNTIL', function () {
      const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-floating-until@example.com
DTSTART:20240101T100000
RRULE:FREQ=WEEKLY;UNTIL=20241231T100000Z
SUMMARY:Floating time event
END:VEVENT
END:VCALENDAR`;

      const parsed = ical.parseICS(icsData);
      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      // Should parse without errors
      assert.ok(event, 'Event should be defined');
      assert.ok(event.rrule, 'RRULE should be defined');
      assert.doesNotThrow(() => event.rrule.toString());
    });
  });

  describe('edge cases', function () {
    it('should handle DST transitions correctly', function () {
      // Test with a date that crosses DST boundary
      const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-dst-until@example.com
DTSTART;TZID=Europe/Berlin:20240101T100000
RRULE:FREQ=DAILY;UNTIL=20240401T100000
SUMMARY:Event crossing DST
DESCRIPTION:Europe/Berlin switches from CET (UTC+1) to CEST (UTC+2) on 2024-03-31
END:VEVENT
END:VCALENDAR`;

      const parsed = ical.parseICS(icsData);
      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      assert.ok(event, 'Event should be defined');
      assert.ok(event.rrule, 'RRULE should be defined');

      const {until} = event.rrule.options;
      assert.ok(until, 'UNTIL should be defined');

      // April 1, 2024 10:00 CEST = April 1, 2024 08:00 UTC
      const expectedUtc = new Date('2024-04-01T08:00:00.000Z');
      assert.strictEqual(until.getTime(), expectedUtc.getTime());
    });

    it('should gracefully handle invalid timezone IDs', function () {
      const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-invalid-tz@example.com
DTSTART;TZID=Invalid/Timezone:20240101T100000
RRULE:FREQ=WEEKLY;UNTIL=20241231T100000
SUMMARY:Event with invalid timezone
END:VEVENT
END:VCALENDAR`;

      // Should not throw, even if timezone conversion fails
      const parsed = ical.parseICS(icsData);
      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');
      if (event?.rrule) {
        assert.doesNotThrow(() => event.rrule.toString());
      }
    });

    it('should handle DATE-only UNTIL without modification', function () {
      // DATE-only UNTIL (without time component) should be left as-is
      const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-date-only-until@example.com
DTSTART;VALUE=DATE:20240101
RRULE:FREQ=WEEKLY;UNTIL=20241231
SUMMARY:Weekly all-day event
END:VEVENT
END:VCALENDAR`;

      const parsed = ical.parseICS(icsData);
      const event = Object.values(parsed).find(event_ => event_.type === 'VEVENT');

      // Should parse without errors
      assert.ok(event, 'Event should be defined');
      assert.ok(event.rrule, 'RRULE should be defined');
      assert.doesNotThrow(() => event.rrule.toString());

      // Should have recurrences
      const recurrences = event.rrule.all();
      assert.ok(recurrences.length > 0, 'Should have recurrences');
    });
  });
});
