import assert from 'node:assert/strict';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// Merge model for components sharing a UID, see lib/uid-revision-merge.js (issue #526)

const UID = 'uid-revision-merge@node-ical-test';

function vevent(...properties) {
  return ['BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20260101T000000Z', ...properties, 'END:VEVENT'];
}

function parse(components, {method} = {}) {
  return ical.parseICS([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//uid-revision-merge//EN',
    ...(method ? [`METHOD:${method}`] : []),
    ...components.flat(),
    'END:VCALENDAR',
  ].join('\r\n'));
}

function withWarnings(callback) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => {
    warnings.push(message);
  };

  try {
    return {result: callback(), warnings};
  } finally {
    console.warn = originalWarn;
  }
}

const series = (sequence, ...extra) => vevent(
  `SEQUENCE:${sequence}`,
  'DTSTART:20260105T100000Z',
  'SUMMARY:Weekly series',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  ...extra,
);
const override = (sequence, summary) => vevent(
  `SEQUENCE:${sequence}`,
  'RECURRENCE-ID:20260112T100000Z',
  'DTSTART:20260112T120000Z',
  `SUMMARY:${summary}`,
);

describe('UID revision merge', () => {
  describe('base series and overrides', () => {
    it('gives the same result whether the override comes before or after the series', () => {
      for (const order of [[series(0), override(0, 'Moved')], [override(0, 'Moved'), series(0)]]) {
        const event = parse(order)[UID];

        assert.equal(event.summary, 'Weekly series');
        assert.ok(event.rrule);
        assert.equal(event.recurrenceid, undefined);
        assert.deepEqual(Object.keys(event.recurrences).toSorted((a, b) => a.localeCompare(b)), ['2026-01-12', '2026-01-12T10:00:00.000Z']);
        assert.equal(event.recurrences['2026-01-12'].summary, 'Moved');
      }
    });

    it('accepts a base component after an override with a higher SEQUENCE, with RRULE, RDATE or neither', () => {
      for (const base of [
        series(0),
        vevent('SEQUENCE:0', 'DTSTART:20260105T100000Z', 'SUMMARY:Weekly series', 'RDATE:20260112T100000Z'),
        vevent('SEQUENCE:0', 'DTSTART:20260105T100000Z', 'SUMMARY:Weekly series'),
      ]) {
        const {result, warnings} = withWarnings(() => parse([override(5, 'Moved'), base])[UID]);

        assert.equal(result.summary, 'Weekly series');
        assert.equal(result.sequence, 0);
        assert.equal(result.recurrenceid, undefined);
        assert.equal(result.recurrences['2026-01-12'].summary, 'Moved');
        assert.deepEqual(warnings, []);
      }
    });

    it('keeps the first override as the entry while no base series is present', () => {
      const event = parse([
        override(0, 'First'),
        vevent('SEQUENCE:0', 'RECURRENCE-ID:20260119T100000Z', 'DTSTART:20260119T120000Z', 'SUMMARY:Second'),
      ])[UID];

      assert.equal(event.summary, 'First');
      assert.equal(event.recurrenceid.toISOString(), '2026-01-12T10:00:00.000Z');
      assert.equal(event.recurrences['2026-01-12'].summary, 'First');
      assert.equal(event.recurrences['2026-01-19'].summary, 'Second');
    });

    it('drops the RECURRENCE-ID of an entry that carries an RRULE', () => {
      const event = parse([vevent(
        'RECURRENCE-ID:20260112T100000Z',
        'DTSTART:20260112T120000Z',
        'SUMMARY:This and future',
        'RRULE:FREQ=DAILY;COUNT=2',
      )])[UID];

      assert.equal(event.recurrenceid, undefined);
      assert.ok(event.rrule);
      assert.equal(event.recurrences['2026-01-12'].summary, 'This and future');
    });
  });

  describe('override without its base series', () => {
    const revisedOverride = (sequence, summary, start) => vevent(
      `SEQUENCE:${sequence}`,
      'RECURRENCE-ID:20260112T100000Z',
      `DTSTART:${start}`,
      `SUMMARY:${summary}`,
    );

    it('updates the entry with a newer revision of the same occurrence', () => {
      const event = parse([
        revisedOverride(0, 'Version 1', '20260112T120000Z'),
        revisedOverride(1, 'Version 2', '20260112T150000Z'),
      ])[UID];

      assert.equal(event.summary, 'Version 2');
      assert.equal(event.sequence, 1);
      assert.equal(event.start.toISOString(), '2026-01-12T15:00:00.000Z');
      assert.equal(event.recurrences['2026-01-12'].summary, 'Version 2');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date('2026-01-01T00:00:00Z'),
        to: new Date('2026-02-01T00:00:00Z'),
      });
      assert.deepEqual(
        instances.map(instance => `${instance.summary} ${instance.start.toISOString()}`),
        ['Version 2 2026-01-12T15:00:00.000Z'],
      );
    });

    it('keeps the entry when an older revision of the same occurrence follows', () => {
      const {result, warnings} = withWarnings(() => parse([
        revisedOverride(2, 'Version 2', '20260112T150000Z'),
        revisedOverride(1, 'Version 1', '20260112T120000Z'),
      ])[UID]);

      assert.equal(result.summary, 'Version 2');
      assert.equal(result.start.toISOString(), '2026-01-12T15:00:00.000Z');
      assert.equal(warnings.length, 1);
    });

    it('leaves the base series alone when an override revision follows it', () => {
      const event = parse([
        revisedOverride(0, 'Version 1', '20260112T120000Z'),
        series(0),
        revisedOverride(1, 'Version 2', '20260112T150000Z'),
      ])[UID];

      assert.equal(event.summary, 'Weekly series');
      assert.ok(event.rrule);
      assert.equal(event.recurrenceid, undefined);
      assert.equal(event.recurrences['2026-01-12'].summary, 'Version 2');
    });
  });

  describe('SEQUENCE precedence', () => {
    it('replaces the entry with a higher SEQUENCE revision', () => {
      const event = parse([series(1), vevent('SEQUENCE:2', 'DTSTART:20260105T140000Z', 'SUMMARY:Rescheduled')])[UID];

      assert.equal(event.summary, 'Rescheduled');
      assert.equal(event.sequence, 2);
      assert.equal(event.start.toISOString(), '2026-01-05T14:00:00.000Z');
    });

    it('lets the later revision win when SEQUENCE is equal', () => {
      const event = parse([series(1), vevent('SEQUENCE:1', 'DTSTART:20260105T140000Z', 'SUMMARY:Same sequence, later')])[UID];

      assert.equal(event.summary, 'Same sequence, later');
    });

    it('ignores an older revision with a warning and leaves the entry untouched', () => {
      const {result, warnings} = withWarnings(() => parse([
        series(2, 'LOCATION:Room 1'),
        vevent('SEQUENCE:1', 'DTSTART:20260105T140000Z', 'SUMMARY:Outdated'),
      ])[UID]);

      assert.equal(result.summary, 'Weekly series');
      assert.equal(result.location, 'Room 1');
      assert.ok(result.rrule);
      assert.deepEqual(warnings, [`[node-ical] Ignoring older event version (SEQUENCE 1 < 2) for UID ${UID}`]);
    });

    it('treats a missing SEQUENCE as 0', () => {
      const replaced = parse([
        vevent('DTSTART:20260105T100000Z', 'SUMMARY:Without sequence'),
        vevent('SEQUENCE:0', 'DTSTART:20260105T100000Z', 'SUMMARY:Sequence 0'),
      ])[UID];
      assert.equal(replaced.summary, 'Sequence 0');

      const {result: kept} = withWarnings(() => parse([
        vevent('SEQUENCE:1', 'DTSTART:20260105T100000Z', 'SUMMARY:Sequence 1'),
        vevent('DTSTART:20260105T100000Z', 'SUMMARY:Without sequence'),
      ])[UID]);
      assert.equal(kept.summary, 'Sequence 1');
    });

    it('applies SEQUENCE per occurrence to overrides', () => {
      const {result, warnings} = withWarnings(() => parse([series(0), override(2, 'Newer'), override(1, 'Older')])[UID]);

      assert.equal(result.recurrences['2026-01-12'].summary, 'Newer');
      assert.equal(result.recurrences['2026-01-12T10:00:00.000Z'].summary, 'Newer');
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Ignoring older RECURRENCE-ID override \(SEQUENCE 1 < 2\)/v);
    });

    it('keeps timed overrides of different occurrences on the same day apart', () => {
      const {result, warnings} = withWarnings(() => parse([
        vevent('DTSTART:20260105T100000Z', 'SUMMARY:Every four hours', 'RRULE:FREQ=HOURLY;INTERVAL=4;COUNT=12'),
        vevent('SEQUENCE:2', 'RECURRENCE-ID:20260106T100000Z', 'DTSTART:20260106T110000Z', 'SUMMARY:Moved 10:00'),
        vevent('SEQUENCE:1', 'RECURRENCE-ID:20260106T140000Z', 'DTSTART:20260106T150000Z', 'SUMMARY:Moved 14:00'),
      ])[UID]);

      assert.deepEqual(warnings, []);
      assert.equal(result.recurrences['2026-01-06T10:00:00.000Z'].summary, 'Moved 10:00');
      assert.equal(result.recurrences['2026-01-06T14:00:00.000Z'].summary, 'Moved 14:00');

      const instances = ical.expandRecurringEvent(result, {
        from: new Date('2026-01-06T08:00:00Z'),
        to: new Date('2026-01-06T16:00:00Z'),
      });
      assert.deepEqual(
        instances.map(instance => `${instance.summary} ${instance.start.toISOString()}`),
        ['Moved 10:00 2026-01-06T11:00:00.000Z', 'Moved 14:00 2026-01-06T15:00:00.000Z'],
      );
    });

    it('applies SEQUENCE to date-only overrides of the same day', () => {
      const {result, warnings} = withWarnings(() => parse([
        vevent('DTSTART;VALUE=DATE:20260105', 'SUMMARY:Daily', 'RRULE:FREQ=DAILY;COUNT=5'),
        vevent('SEQUENCE:2', 'RECURRENCE-ID;VALUE=DATE:20260106', 'DTSTART;VALUE=DATE:20260106', 'SUMMARY:Newer'),
        vevent('SEQUENCE:1', 'RECURRENCE-ID;VALUE=DATE:20260106', 'DTSTART;VALUE=DATE:20260106', 'SUMMARY:Older'),
      ])[UID]);

      assert.equal(result.recurrences['2026-01-06'].summary, 'Newer');
      assert.equal(warnings.length, 1);
    });
  });

  describe('replacing a revision', () => {
    it('removes fields that the accepted revision no longer has', () => {
      const event = parse([
        series(0, 'LOCATION:Room 1', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT5M', 'END:VALARM'),
        vevent('SEQUENCE:1', 'DTSTART:20260105T100000Z', 'SUMMARY:Single now'),
      ])[UID];

      assert.equal(event.summary, 'Single now');
      assert.equal(event.rrule, undefined);
      assert.equal(event.location, undefined);
      assert.equal(event.alarms, undefined);
    });

    it('keeps the inherited METHOD and the collected overrides', () => {
      const event = parse([
        override(0, 'Moved'),
        series(0),
        vevent('SEQUENCE:1', 'DTSTART:20260105T100000Z', 'SUMMARY:Revised series', 'RRULE:FREQ=WEEKLY;COUNT=4'),
      ], {method: 'REQUEST'})[UID];

      assert.equal(event.summary, 'Revised series');
      assert.equal(event.method, 'REQUEST');
      assert.equal(event.recurrences['2026-01-12'].summary, 'Moved');
    });

    it('stores a UID of __proto__ as an own entry without touching the prototype', () => {
      const parsed = ical.parseICS([
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:__proto__',
        'SEQUENCE:0',
        'DTSTART:20260105T100000Z',
        'SUMMARY:First',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:__proto__',
        'SEQUENCE:1',
        'DTSTART:20260105T100000Z',
        'SUMMARY:Second',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'));

      assert.ok(Object.hasOwn(parsed, '__proto__'));
      assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
      assert.equal(Object.getOwnPropertyDescriptor(parsed, '__proto__').value.summary, 'Second');
      assert.equal(Object.hasOwn(Object.prototype, 'summary'), false);
    });
  });
});
