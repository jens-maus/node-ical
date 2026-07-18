import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';
import * as icalCore from '../ical.js';
import * as packageEntry from '../node-ical.js';
import ical from 'node-ical';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICS_SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//TEST//regression fixes//EN',
  'BEGIN:VEVENT',
  'UID:regression-1',
  'DTSTAMP:20250101T000000Z',
  'DTSTART:20250101T100000Z',
  'DTEND:20250101T110000Z',
  'SUMMARY:Regression Event',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function findFirstVevent(data) {
  return Object.values(data).find(component => component?.type === 'VEVENT');
}

describe('regression fixes', () => {
  it('keeps internal named parser exports callable without an object receiver', () => {
    const coreParsed = icalCore.parseICS(ICS_SAMPLE);
    const entryParsed = packageEntry.parseLines(ICS_SAMPLE.split(/\r?\n/v));

    assert.equal(findFirstVevent(coreParsed)?.uid, 'regression-1');
    assert.equal(findFirstVevent(entryParsed)?.uid, 'regression-1');

    const coreCtx = icalCore.handleObject('UID', 'bound-core', [], {}, []);
    const entryCtx = packageEntry.handleObject('UID', 'bound-entry', [], {}, []);

    assert.equal(coreCtx.uid, 'bound-core');
    assert.equal(entryCtx.uid, 'bound-entry');
  });

  it('treats full-day recurring duration as calendar days instead of fixed milliseconds', () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = 'Etc/UTC';

    try {
      const event = {
        type: 'VEVENT',
        uid: 'full-day-dst-duration@test',
        summary: 'Full Day Event',
        start: new Date('2025-03-30T00:00:00.000Z'),
        end: new Date('2025-03-30T23:00:00.000Z'),
        datetype: 'date',
        rrule: {
          between() {
            return [new Date('2025-04-02T00:00:00.000Z')];
          },
        },
      };

      const [instance] = ical.expandRecurringEvent(event, {
        from: new Date('2025-04-02T00:00:00.000Z'),
        to: new Date('2025-04-02T23:59:59.999Z'),
      });

      assert.ok(instance);
      assert.equal(instance.start.getFullYear(), 2025);
      assert.equal(instance.start.getMonth(), 3);
      assert.equal(instance.start.getDate(), 2);
      assert.equal(instance.start.getHours(), 0);
      assert.equal(instance.end.getFullYear(), 2025);
      assert.equal(instance.end.getMonth(), 3);
      assert.equal(instance.end.getDate(), 3);
      assert.equal(instance.end.getHours(), 0);
    } finally {
      if (previousTZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTZ;
      }
    }
  });

  it('resolves a floating DTSTART using the single VTIMEZONE present in the file (node-ical #305/#307)', () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = 'Etc/UTC';

    try {
      const parsed = ical.parseICS([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TEST//floating-no-tzid//EN',
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Berlin',
        'BEGIN:STANDARD',
        'DTSTART:19700101T030000',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:19700101T020000',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'END:DAYLIGHT',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:floating-no-tzid@test',
        'DTSTAMP:20250101T000000Z',
        'DTSTART:20250101T120000',
        'DTEND:20250101T130000',
        'SUMMARY:Floating time event',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'));

      const event = findFirstVevent(parsed);
      assert.ok(event);
      // 2025-01-01 is in CET (+01:00) in Europe/Berlin, so 12:00 wall → 11:00 UTC.
      assert.equal(event.start.toISOString(), '2025-01-01T11:00:00.000Z');
      assert.equal(event.end.toISOString(), '2025-01-01T12:00:00.000Z');
    } finally {
      if (previousTZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTZ;
      }
    }
  });

  it('includes moved overrides whose effective start falls inside the requested range', () => {
    const overrideEvent = {
      type: 'VEVENT',
      uid: 'moved-override@test',
      recurrenceid: new Date('2025-01-05T09:00:00.000Z'),
      summary: 'Moved Override',
      start: new Date('2025-01-10T12:00:00.000Z'),
      end: new Date('2025-01-10T13:00:00.000Z'),
    };

    const event = {
      type: 'VEVENT',
      uid: 'moved-override@test',
      summary: 'Base Event',
      start: new Date('2025-01-01T09:00:00.000Z'),
      end: new Date('2025-01-01T10:00:00.000Z'),
      rrule: {
        between(start, end) {
          return [new Date('2025-01-05T09:00:00.000Z')].filter(date => date >= start && date <= end);
        },
      },
      recurrences: {
        '2025-01-05T09:00:00.000Z': overrideEvent,
        '2025-01-05': overrideEvent,
      },
    };

    const instances = ical.expandRecurringEvent(event, {
      from: new Date('2025-01-10T00:00:00.000Z'),
      to: new Date('2025-01-10T23:59:59.999Z'),
      includeOverrides: true,
    });

    assert.equal(instances.length, 1);
    assert.equal(instances[0].isOverride, true);
    assert.equal(instances[0].summary, 'Moved Override');
    assert.equal(instances[0].start.toISOString(), '2025-01-10T12:00:00.000Z');
  });

  it('stores VFREEBUSY raw values and parameters on each busy period', () => {
    const data = ical.parseFile(path.join(__dirname, 'fixtures', 'vfreebusy-zimbra.ics'));
    const vfreebusy = Object.values(data).find(component => component?.type === 'VFREEBUSY');
    const period = vfreebusy.freebusy[0];

    assert.deepEqual(period.freebusy.params, {FBTYPE: 'BUSY'});
    assert.match(period.freebusy.val, /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/v);
  });

  it('parses FREEBUSY start/end and start/duration periods', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//freebusy-periods//EN',
      'BEGIN:VFREEBUSY',
      'UID:freebusy-periods@test',
      'DTSTAMP:20250101T000000Z',
      'FREEBUSY;FBTYPE=BUSY:20250101T100000Z/20250101T103000Z',
      'FREEBUSY;FBTYPE=BUSY-TENTATIVE:20250101T110000Z/PT45M',
      'END:VFREEBUSY',
      'END:VCALENDAR',
    ].join('\r\n'));

    const vfreebusy = Object.values(parsed).find(component => component?.type === 'VFREEBUSY');
    assert.ok(vfreebusy);
    assert.equal(vfreebusy.freebusy.length, 2);

    const explicitEndPeriod = vfreebusy.freebusy[0];
    assert.equal(explicitEndPeriod.start.toISOString(), '2025-01-01T10:00:00.000Z');
    assert.equal(explicitEndPeriod.end.toISOString(), '2025-01-01T10:30:00.000Z');

    const durationPeriod = vfreebusy.freebusy[1];
    assert.equal(durationPeriod.start.toISOString(), '2025-01-01T11:00:00.000Z');
    assert.equal(durationPeriod.end.toISOString(), '2025-01-01T11:45:00.000Z');
    assert.deepEqual(durationPeriod.freebusy.params, {FBTYPE: 'BUSY-TENTATIVE'});
    assert.equal(durationPeriod.freebusy.val, '20250101T110000Z/PT45M');
  });

  it('accepts FREEBUSY durations with a leading plus sign and lowercase unit letters', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//freebusy-plus-lowercase-duration//EN',
      'BEGIN:VFREEBUSY',
      'UID:freebusy-plus-lowercase-duration@test',
      'DTSTAMP:20250101T000000Z',
      'FREEBUSY;FBTYPE=BUSY:20250101T110000Z/+pt45m',
      'END:VFREEBUSY',
      'END:VCALENDAR',
    ].join('\r\n'));

    const vfreebusy = Object.values(parsed).find(component => component?.type === 'VFREEBUSY');
    const period = vfreebusy.freebusy[0];

    assert.equal(period.start.toISOString(), '2025-01-01T11:00:00.000Z');
    assert.equal(period.end.toISOString(), '2025-01-01T11:45:00.000Z');
  });

  it('leaves FREEBUSY end unset when the duration value is malformed', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//freebusy-malformed-duration//EN',
      'BEGIN:VFREEBUSY',
      'UID:freebusy-malformed-duration@test',
      'DTSTAMP:20250101T000000Z',
      'FREEBUSY;FBTYPE=BUSY:20250101T100000Z/PXYZ',
      'END:VFREEBUSY',
      'END:VCALENDAR',
    ].join('\r\n'));

    const vfreebusy = Object.values(parsed).find(component => component?.type === 'VFREEBUSY');
    const period = vfreebusy.freebusy[0];

    assert.equal(period.start.toISOString(), '2025-01-01T10:00:00.000Z');
    assert.equal(period.end, undefined, 'Malformed duration should not produce a fabricated end date');
  });

  it('parses every comma-separated FREEBUSY period on a single property line', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//freebusy-comma-separated//EN',
      'BEGIN:VFREEBUSY',
      'UID:freebusy-comma-separated@test',
      'DTSTAMP:20250101T000000Z',
      'FREEBUSY;FBTYPE=BUSY:20250101T100000Z/20250101T103000Z,20250101T110000Z/PT30M',
      'END:VFREEBUSY',
      'END:VCALENDAR',
    ].join('\r\n'));

    const vfreebusy = Object.values(parsed).find(component => component?.type === 'VFREEBUSY');
    assert.equal(vfreebusy.freebusy.length, 2);

    const [first, second] = vfreebusy.freebusy;
    assert.equal(first.start.toISOString(), '2025-01-01T10:00:00.000Z');
    assert.equal(first.end.toISOString(), '2025-01-01T10:30:00.000Z');
    assert.equal(second.start.toISOString(), '2025-01-01T11:00:00.000Z');
    assert.equal(second.end.toISOString(), '2025-01-01T11:30:00.000Z');
  });

  it('handles parameter names and enumerated values case-insensitively', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//case-insensitive-parameters//EN',
      'BEGIN:VEVENT',
      'UID:case-insensitive-parameters@test',
      'DTSTAMP:20250101T000000Z',
      'DTSTART;value=date:20250101',
      'DTEND;value=date:20250102',
      'ATTENDEE;rsvp=true;partstat=accepted:mailto:test@example.com',
      'SUMMARY:Case Insensitive Parameters',
      'END:VEVENT',
      'BEGIN:VFREEBUSY',
      'UID:case-insensitive-freebusy@test',
      'DTSTAMP:20250101T000000Z',
      'FREEBUSY;fbtype=busy:20250101T100000Z/20250101T103000Z',
      'END:VFREEBUSY',
      'END:VCALENDAR',
    ].join('\r\n'));

    const event = Object.values(parsed).find(component => component?.type === 'VEVENT');
    assert.equal(event.datetype, 'date', 'lowercase value=date should still be treated as a date-only DTSTART');

    assert.equal(event.attendee.params.RSVP, true, 'lowercase rsvp=true should parse as boolean true');
    assert.equal(event.attendee.params.PARTSTAT, 'accepted', 'lowercase parameter name PARTSTAT should still be readable via its uppercase key');

    const vfreebusy = Object.values(parsed).find(component => component?.type === 'VFREEBUSY');
    assert.equal(vfreebusy.freebusy[0].type, 'BUSY', 'lowercase fbtype=busy should normalize to uppercase BUSY');
  });

  it('drops a property removed by a higher-SEQUENCE revision of the same UID instead of leaving it stale', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//sequence-removes-property//EN',
      'BEGIN:VEVENT',
      'UID:sequence-removes-rrule@test',
      'SEQUENCE:0',
      'DTSTAMP:20250101T000000Z',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'RRULE:FREQ=DAILY;COUNT=5',
      'SUMMARY:Recurring Meeting',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:sequence-removes-rrule@test',
      'SEQUENCE:1',
      'DTSTAMP:20250102T000000Z',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'SUMMARY:No Longer Recurring',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    const event = Object.values(parsed).find(component => component?.type === 'VEVENT');
    assert.equal(event.summary, 'No Longer Recurring');
    assert.equal(event.rrule, undefined, 'RRULE removed by the higher-SEQUENCE revision should not persist from the older revision');
  });

  it('fully replaces an override with a higher-SEQUENCE base series without leaving override-only fields behind', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//override-to-base-series-merge//EN',
      'BEGIN:VEVENT',
      'UID:override-to-base-series@test',
      'SEQUENCE:2',
      'RECURRENCE-ID:20250102T100000Z',
      'DTSTAMP:20250102T000000Z',
      'DTSTART:20250102T120000Z',
      'DTEND:20250102T130000Z',
      'LOCATION:Override Room',
      'SUMMARY:Override Instance',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:override-to-base-series@test',
      'SEQUENCE:3',
      'DTSTAMP:20250103T000000Z',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'RRULE:FREQ=DAILY;COUNT=2',
      'SUMMARY:Base Series',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    const event = Object.values(parsed).find(component => component?.type === 'VEVENT');
    assert.equal(event.summary, 'Base Series');
    assert.equal(event.location, undefined, 'override-only fields should not persist after the higher-SEQUENCE base series replaces the override');
    assert.equal(event.recurrenceid, undefined, 'base series should not retain the old override recurrence id');
    assert.ok(event.rrule, 'base series should still keep its RRULE');
  });

  it('does not derive an implicit end date for VJOURNAL components', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//journal-no-implicit-end//EN',
      'BEGIN:VJOURNAL',
      'UID:journal-no-implicit-end@test',
      'DTSTAMP:20250101T000000Z',
      'DTSTART:20250101T100000Z',
      'SUMMARY:Journal Entry',
      'END:VJOURNAL',
      'END:VCALENDAR',
    ].join('\r\n'));

    const journal = Object.values(parsed).find(component => component?.type === 'VJOURNAL');
    assert.equal(journal.end, undefined, 'VJOURNAL should not receive an implicit end date');
  });

  it('treats __proto__ UIDs as data instead of mutating the result prototype', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//proto UID//EN',
      'BEGIN:VEVENT',
      'UID:__proto__',
      'DTSTAMP:20250101T000000Z',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'SUMMARY:Prototype Safety',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
    assert.equal(Object.hasOwn(parsed, '__proto__'), true);
    assert.equal(Object.getOwnPropertyDescriptor(parsed, '__proto__')?.value?.uid, '__proto__');
    assert.equal('uid' in {}, false);
  });

  it('rejects DURATION values that look valid but have the wrong shape', () => {
    const originalWarn = console.warn;
    console.warn = () => {
      // No-op
    };

    try {
      // 'M' outside a T-time part means "months", which RFC 5545 DURATION does
      // not support - this must not be silently treated as minutes.
      const monthsLike = ical.parseICS([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TEST//duration-p1m//EN',
        'BEGIN:VEVENT',
        'UID:duration-p1m@test',
        'DTSTAMP:20250101T000000Z',
        'DTSTART:20250101T100000Z',
        'DURATION:P1M',
        'SUMMARY:Ambiguous duration',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'));
      const monthsEvent = findFirstVevent(monthsLike);
      assert.equal(monthsEvent.end.toISOString(), monthsEvent.start.toISOString(), 'P1M must not be treated as 1 minute');

      // A valid-looking fragment with trailing garbage must be rejected outright,
      // not partially matched.
      const trailingGarbage = ical.parseICS([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TEST//duration-trailing-garbage//EN',
        'BEGIN:VEVENT',
        'UID:duration-trailing-garbage@test',
        'DTSTAMP:20250101T000000Z',
        'DTSTART:20250101T100000Z',
        'DURATION:P1DXYZ',
        'SUMMARY:Trailing garbage duration',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'));
      const garbageEvent = findFirstVevent(trailingGarbage);
      assert.equal(garbageEvent.end.toISOString(), garbageEvent.start.toISOString(), 'P1DXYZ must not be treated as 1 day');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('preserves an RDATE-only base series that arrives after its RECURRENCE-ID override', () => {
    const parsed = ical.parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TEST//rdate-base-after-override//EN',
      'BEGIN:VEVENT',
      'UID:rdate-base-after-override@test',
      'DTSTAMP:20250101T000000Z',
      'RECURRENCE-ID:20250110T100000Z',
      'SEQUENCE:1',
      'DTSTART:20250110T120000Z',
      'DTEND:20250110T130000Z',
      'SUMMARY:Moved Override',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:rdate-base-after-override@test',
      'DTSTAMP:20250101T000000Z',
      'SEQUENCE:0',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'RDATE:20250101T100000Z,20250110T100000Z,20250120T100000Z',
      'SUMMARY:Base Series (RDATE only)',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    const event = Object.values(parsed).find(component => component?.type === 'VEVENT');
    assert.equal(event.summary, 'Base Series (RDATE only)', 'RDATE-only base series must not be discarded as a stale duplicate');
    assert.ok(event.rdate, 'base series should keep its RDATE');
    assert.ok(event.recurrences, 'the RECURRENCE-ID override should still be recorded');
  });
});
