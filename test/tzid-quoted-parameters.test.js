import assert from 'node:assert/strict';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// The quotes around a TZID value are removed, but other quoted parameters on the same line keep
// theirs, so a colon inside them does not end the parameters

function start(dateLine) {
  const event = ical.sync.parseICS([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:tzid-quoted-parameters@test',
    'DTSTAMP:20260101T000000Z',
    dateLine,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'))['tzid-quoted-parameters@test'];

  return event.start;
}

describe('TZID next to other quoted parameters', () => {
  it('keeps a colon inside another quoted parameter', () => {
    for (const line of [
      'DTSTART;TZID=America/New_York;X-NOTE="a:b":20260101T100000',
      'DTSTART;TZID="America/New_York";X-NOTE="a:b":20260101T100000',
      'DTSTART;X-NOTE="a:b";TZID="America/New_York":20260101T100000',
    ]) {
      const date = start(line);
      assert.ok(date instanceof Date, line);
      assert.equal(date.toISOString(), '2026-01-01T15:00:00.000Z', line);
      assert.equal(date.tz, 'America/New_York', line);
    }
  });

  it('still reads a quoted TZID and quotes around the value', () => {
    assert.equal(start('DTSTART;TZID="Europe/Berlin":20260101T100000').toISOString(), '2026-01-01T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=Europe/Berlin:"20260101T100000"').toISOString(), '2026-01-01T09:00:00.000Z');
  });

  it('still reads a quoted Windows zone with a UTC offset', () => {
    const date = start('DTSTART;TZID="(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna":20260101T100000');
    assert.equal(date.toISOString(), '2026-01-01T09:00:00.000Z');
  });
});
