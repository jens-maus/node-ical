import assert from 'node:assert/strict';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// Parameter values are kept as written unless they are a plain number

function parseEvent(...lines) {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:parameter-values@node-ical.test',
    'DTSTART:20260101T100000Z',
    ...lines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return ical.sync.parseICS(ics)['parameter-values@node-ical.test'];
}

describe('parameter values', () => {
  it('keeps a property with an empty parameter value', () => {
    const event = parseEvent('ATTENDEE;CN=;ROLE=REQ-PARTICIPANT:mailto:a@example.com');
    assert.deepEqual(event.attendee.params, {CN: '', ROLE: 'REQ-PARTICIPANT'});
    assert.equal(event.attendee.val, 'mailto:a@example.com');
  });

  it('keeps an empty parameter value at the end of the parameters', () => {
    const event = parseEvent('SUMMARY;LANGUAGE=en;X-NOTE=:Meeting');
    assert.deepEqual(event.summary.params, {LANGUAGE: 'en', 'X-NOTE': ''});
    assert.equal(event.summary.val, 'Meeting');
  });

  it('keeps an empty parameter value on a line with a TZID', () => {
    const event = parseEvent('DTEND;TZID=Europe/Berlin;X-NOTE=:20260101T120000');
    assert.equal(event.end.toISOString(), '2026-01-01T11:00:00.000Z');
  });

  it('keeps leading zeros, a plus sign and long digit strings', () => {
    const event = parseEvent(
      'ORGANIZER;CN=007:mailto:bond@example.com',
      'ATTENDEE;CN=+491701234567;X-ID=0042;X-BIG=12345678901234567890:mailto:a@example.com',
    );
    assert.deepEqual(event.organizer.params, {CN: '007'});
    assert.deepEqual(event.attendee.params, {CN: '+491701234567', 'X-ID': '0042', 'X-BIG': '12345678901234567890'});
  });

  it('does not read hex, exponent or Infinity as a number', () => {
    const event = parseEvent('ATTENDEE;CN=0x1F;X-A=1e3;X-B=Infinity;X-C=NaN:mailto:a@example.com');
    assert.deepEqual(event.attendee.params, {
      CN: '0x1F', 'X-A': '1e3', 'X-B': 'Infinity', 'X-C': 'NaN',
    });
  });

  it('still reads plain numbers as numbers', () => {
    const event = parseEvent('ATTENDEE;X-NUM-GUESTS=0;X-A=12;X-B=-3;X-C=1.5:mailto:a@example.com');
    assert.deepEqual(event.attendee.params, {
      'X-NUM-GUESTS': 0, 'X-A': 12, 'X-B': -3, 'X-C': 1.5,
    });
  });

  it('still reads SEQUENCE as a number', () => {
    assert.equal(parseEvent('SEQUENCE:02').sequence, 2);
    assert.equal(parseEvent('SEQUENCE:3').sequence, 3);
  });
});
