const assert = require('node:assert/strict');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

describe('parser: metadata preservation', () => {
  it('preserves tz/dateOnly metadata when normalizing all-day DTSTART for RRULE', () => {
    const ics = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//node-ical//test//EN
BEGIN:VEVENT
UID:meta-preserve@example.com
DTSTART;TZID=Europe/Berlin;VALUE=DATE:20240325
RRULE:FREQ=DAILY;COUNT=2
SUMMARY:All-day zone test
END:VEVENT
END:VCALENDAR
    `.trim();

    const parsed = ical.parseICS(ics);
    const event = parsed['meta-preserve@example.com'];

    assert.ok(event, 'event should be parsed');
    assert.equal(event.type, 'VEVENT');
    assert.ok(event.rrule, 'rrule should be present');

    // The helper should keep metadata on the Date object we emit to consumers.
    assert.equal(event.start.dateOnly, true);
    assert.ok(Object.hasOwn(event.start, 'dateOnly'));
  });
});
