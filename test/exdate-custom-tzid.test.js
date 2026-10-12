import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';
import ical from '../node-ical.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'outlook-custom-tz-exdate.ics');

describe('EXDATE with a custom Microsoft TZID', () => {
  const data = ical.sync.parseFile(fixture);
  const event = Object.values(data).find(c => c.type === 'VEVENT');

  it('resolves EXDATE through the VTIMEZONE block like DTSTART', () => {
    // 08:00 local, Pacific rules from the VTIMEZONE block
    assert.equal(event.start.toISOString(), '2026-10-14T15:00:00.000Z');

    const exdates = [...new Set(Object.values(event.exdate))];
    assert.equal(exdates.length, 1);
    assert.equal(exdates[0].toISOString(), '2026-10-21T15:00:00.000Z');
    assert.equal(exdates[0].tz, event.start.tz);
  });

  it('excludes the EXDATE occurrence when expanding', () => {
    const occurrences = ical.expandRecurringEvent(event, {
      from: new Date(Date.UTC(2026, 9, 1)),
      to: new Date(Date.UTC(2026, 11, 1)),
    });

    assert.deepEqual(occurrences.map(o => o.start.toISOString()), [
      '2026-10-14T15:00:00.000Z',
      '2026-10-28T15:00:00.000Z',
      '2026-11-04T16:00:00.000Z',
      '2026-11-11T16:00:00.000Z',
      '2026-11-18T16:00:00.000Z',
    ]);
  });
});
