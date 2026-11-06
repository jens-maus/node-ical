/* eslint-disable import-x/order */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const assert = require('node:assert/strict');
const {describe, it} = require('mocha');
const nodeIcal = require('node-ical');

const ICS_FIXTURE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//node-ical//CJS compatibility test//EN',
  'BEGIN:VEVENT',
  'UID:cjs-compat-1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260101T100000Z',
  'DTEND:20260101T110000Z',
  'SUMMARY:CommonJS Compatibility Event',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function findFirstVevent(data) {
  return Object.values(data).find(component => component?.type === 'VEVENT');
}

describe('CommonJS compatibility', () => {
  it('loads the package through require() and parses a VEVENT', () => {
    const expectedUid = 'cjs-compat-1';
    const expectedSummary = 'CommonJS Compatibility Event';

    assert.equal(typeof nodeIcal.parseICS, 'function');
    const parsedCalendar = nodeIcal.parseICS(ICS_FIXTURE);
    const parsedEvent = findFirstVevent(parsedCalendar);

    assert.ok(parsedEvent, 'Expected at least one VEVENT in parsed output');
    assert.equal(parsedEvent.uid, expectedUid);
    assert.equal(parsedEvent.summary, expectedSummary);
  });

  it('expands a recurring event with maxIterations through require()', () => {
    const parsedEvent = findFirstVevent(nodeIcal.parseICS(ICS_FIXTURE.replace(
      'SUMMARY:CommonJS Compatibility Event',
      'RRULE:FREQ=DAILY',
    )));
    const range = {from: new Date('2026-01-01T00:00:00Z'), to: new Date('2054-01-01T00:00:00Z')};

    assert.throws(() => nodeIcal.expandRecurringEvent(parsedEvent, range), /Maximum iterations/v);
    assert.equal(nodeIcal.expandRecurringEvent(parsedEvent, {...range, maxIterations: 20_000}).length, 10_227);
  });
});
