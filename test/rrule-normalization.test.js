import assert from 'node:assert/strict';
import {describe, it} from 'mocha';
import {normalizeRruleValue} from '../lib/ical-parser-utils.js';
import ical from 'node-ical';

// Turning the raw RRULE content line into the rule value (follow-up to #595)

function occurrences(rruleLine) {
  const event = ical.parseICS([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:rrule-normalization@test',
    'DTSTAMP:20270101T000000Z',
    'DTSTART:20270104T090000Z',
    rruleLine,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'))['rrule-normalization@test'];

  return ical.expandRecurringEvent(event, {
    from: new Date('2027-01-01T00:00:00Z'),
    to: new Date('2027-04-01T00:00:00Z'),
  }).map(instance => instance.start.toISOString().slice(0, 10));
}

describe('normalizeRruleValue()', () => {
  it('turns RRULE content lines into rule values', () => {
    for (const [line, expected] of [
      ['RRULE:FREQ=DAILY;COUNT=3', 'FREQ=DAILY;COUNT=3'],
      // Rule parts in any order (RFC 5545 §3.3.10)
      ['RRULE:COUNT=3;FREQ=DAILY', 'COUNT=3;FREQ=DAILY'],
      ['RRULE:freq=daily;count=3', 'freq=daily;count=3'],
      // Property parameters are no rule parts, also with a colon inside quotes
      ['RRULE;X-FOO=BAR:COUNT=3;FREQ=DAILY', 'COUNT=3;FREQ=DAILY'],
      ['RRULE;COUNT=2:FREQ=DAILY', 'FREQ=DAILY'],
      ['RRULE;X-FOO="a:b":COUNT=3;freq=daily', 'COUNT=3;freq=daily'],
      ['RRULE;X-FOO="a","b:c":FREQ=DAILY;COUNT=2', 'FREQ=DAILY;COUNT=2'],
      // Stray text before the rule
      ['RRULE:RRULE:FREQ=DAILY;COUNT=2', 'FREQ=DAILY;COUNT=2'],
      ['RRULE:X-FOO:COUNT=2;FREQ=DAILY', 'COUNT=2;FREQ=DAILY'],
      ['RRULE:AnythingRandom;FREQ=WEEKLY;BYDAY=MO', 'FREQ=WEEKLY;BYDAY=MO'],
      // A colon inside a value is no stray prefix
      ['RRULE:UNTIL=2027-01-05T00:00:00Z;FREQ=DAILY', 'UNTIL=2027-01-05T00:00:00Z;FREQ=DAILY'],
      ['RRULE:AnythingRandom;UNTIL=2027-01-05T00:00:00Z;FREQ=DAILY', 'UNTIL=2027-01-05T00:00:00Z;FREQ=DAILY'],
      // X-FREQ is not FREQ
      ['RRULE:FREQ=DAILY;COUNT=2;X-FREQ=WEEKLY', 'FREQ=DAILY;COUNT=2;X-FREQ=WEEKLY'],
      ['RRULE:X-FREQ=WEEKLY;COUNT=2;FREQ=DAILY', 'X-FREQ=WEEKLY;COUNT=2;FREQ=DAILY'],
      // Of glued rules, only the last one counts
      ['RRULE:FREQ=WEEKLY;COUNT=2;RRULE:FREQ=DAILY', 'FREQ=DAILY'],
      ['RRULE:FREQ=WEEKLY;COUNT=2;freq=DAILY', 'freq=DAILY'],
      // Without FREQ the value is passed on as it is, so the invalid rule gets reported
      ['RRULE:BYDAY=MO', 'BYDAY=MO'],
      ['RRULE;X-FOO=BAR:BYDAY=MO', 'BYDAY=MO'],
    ]) {
      assert.equal(normalizeRruleValue(line), expected, line);
    }
  });
});

describe('RRULE normalization when parsing', () => {
  it('does not read X-FREQ as the start of another rule', () => {
    assert.deepEqual(occurrences('RRULE:FREQ=DAILY;COUNT=2;X-FREQ=WEEKLY'), ['2027-01-04', '2027-01-05']);
  });

  it('reads a lowercase rule after property parameters', () => {
    assert.deepEqual(occurrences('RRULE;X-FOO=BAR:freq=daily;count=3'), ['2027-01-04', '2027-01-05', '2027-01-06']);
    assert.deepEqual(occurrences('RRULE;X-FOO=BAR:COUNT=3;freq=daily'), ['2027-01-04', '2027-01-05', '2027-01-06']);
  });

  it('reads a rule after a parameter with a list of quoted values', () => {
    assert.deepEqual(occurrences('RRULE;X-FOO="a","b":FREQ=DAILY;COUNT=2'), ['2027-01-04', '2027-01-05']);
  });

  it('keeps no part of an earlier glued rule, whatever the case of FREQ', () => {
    assert.deepEqual(occurrences('RRULE:FREQ=WEEKLY;COUNT=2;freq=DAILY'), occurrences('RRULE:FREQ=DAILY'));
    assert.deepEqual(occurrences('RRULE:freq=WEEKLY;COUNT=2;FREQ=DAILY'), occurrences('RRULE:FREQ=DAILY'));
  });
});
