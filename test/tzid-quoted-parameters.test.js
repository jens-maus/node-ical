import assert from 'node:assert/strict';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// The quotes around a TZID value are removed, but other quoted parameters on the same line keep
// theirs, so a colon inside them does not end the parameters

function parseEvent(line) {
  return ical.sync.parseICS([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:tzid-quoted-parameters@test',
    'DTSTAMP:20260101T000000Z',
    line.startsWith('DTSTART') ? line : 'DTSTART:20260101T100000Z',
    ...(line.startsWith('DTSTART') ? [] : [line]),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'))['tzid-quoted-parameters@test'];
}

function start(dateLine) {
  return parseEvent(dateLine).start;
}

describe('TZID next to other quoted parameters', () => {
  it('keeps a colon inside another quoted parameter', () => {
    for (const line of [
      'DTSTART;TZID=America/New_York;X-NOTE="a:b":20260101T100000',
      'DTSTART;TZID="America/New_York";X-NOTE="a:b":20260101T100000',
      'DTSTART;X-NOTE="a:b";TZID="America/New_York":20260101T100000',
      'DTSTART;X-NOTE="foo;TZID=";TZID="America/New_York":20260101T100000',
    ]) {
      const date = start(line);
      assert.ok(date instanceof Date, line);
      assert.equal(date.toISOString(), '2026-01-01T15:00:00.000Z', line);
      assert.equal(date.tz, 'America/New_York', line);
    }
  });

  it('keeps a quoted parameter that contains a colon and TZID= on other properties', () => {
    const event = parseEvent('SUMMARY;X-NOTE="a:b;TZID=foo":Meeting');
    assert.deepEqual(event.summary, {params: {'X-NOTE': 'a:b;TZID=foo'}, val: 'Meeting'});
  });

  it('reads quoted parameter values like on a line without TZID text', () => {
    const withTzidText = parseEvent('ATTENDEE;CN="123";X-NOTE="note;TZID=note":mailto:a@example.com');
    const withoutTzidText = parseEvent('ATTENDEE;CN="123";X-NOTE="note":mailto:a@example.com');

    assert.equal(withTzidText.attendee.params.CN, withoutTzidText.attendee.params.CN);
    assert.equal(withTzidText.attendee.params['X-NOTE'], 'note;TZID=note');
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
