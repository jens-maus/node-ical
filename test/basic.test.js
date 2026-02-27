const assert_ = require('node:assert/strict');
const {describe, it} = require('mocha');
const tz = require('../tz-utils.js');
const ical = require('../node-ical.js');

// Map 'Etc/Unknown' TZID used in fixtures to a concrete zone
tz.linkAlias('Etc/Unknown', 'Etc/GMT');

function values(object) {
  return Object.values(object);
}

function filterItems(array, predicate) {
  return array.filter(item => predicate(item));
}

function findItem(array, predicate) {
  return array.find(item => predicate(item));
}

describe('parser: basic cases', () => {
  describe('VEVENT basics', () => {
    it('parses basic VEVENTs (multi-event-basic.ics)', () => {
      const data = ical.parseFile('./test/fixtures/multi-event-basic.ics');
      const events = filterItems(values(data), x => x.type === 'VEVENT');
      assert_.equal(events.length, 9);

      const ev47 = findItem(events, x => x.uid === '47f6ea3f28af2986a2192fa39a91fa7d60d26b76');
      assert_.equal(ev47.location, 'Fort Lauderdale, United States');
      assert_.equal(ev47.start.toDateString(), new Date(2011, 10, 29).toDateString());
      assert_.equal(ev47.datetype, 'date');
      assert_.equal(ev47.method, 'PUBLISH');

      const ev480a = findItem(events, x => x.uid === '480a3ad48af5ed8965241f14920f90524f533c18');
      assert_.equal(ev480a.summary, '[Async]: Everything Express');
      assert_.equal(ev480a.start.dateOnly, true);
      assert_.equal(ev480a.end.dateOnly, true);

      const evD4 = findItem(events, x => x.uid === 'd4c826dfb701f611416d69b4df81caf9ff80b03a');
      assert_.equal(evD4.start.toDateString(), new Date(Date.UTC(2011, 2, 12, 20, 0, 0)).toDateString());
      assert_.equal(evD4.datetype, 'date-time');

      const invalid = findItem(events, x => x.uid === 'sdfkf09fsd0');
      assert_.equal(invalid.start, 'Next Year');
    });

    it('parses tvcountdown event (tv-show-episode.ics)', () => {
      const data = ical.parseFile('./test/fixtures/tv-show-episode.ics');
      const ev = findItem(values(data), x => x.uid === '20110505T220000Z-83@tvcountdown.com');
      assert_.equal(ev.start.getUTCFullYear(), 2011);
      assert_.equal(ev.start.getUTCMonth(), 4);
      assert_.equal(ev.end.getUTCMonth(), 4);
      assert_.equal(ev.datetype, 'date-time');
    });

    it('parses TripIt event (tripit-location-escaping.ics)', () => {
      const data = ical.parseFile('./test/fixtures/tripit-location-escaping.ics');
      const ev = findItem(values(data), x => x.uid === 'c32a5eaba2354bb29e012ec18da827db90550a3b@tripit.com');
      assert_.equal(ev.start.getFullYear(), 2011);
      assert_.equal(ev.start.getMonth(), 9);
      assert_.equal(ev.start.getDate(), 11);
      assert_.equal(ev.summary, 'South San Francisco, CA, October 2011;');
      assert_.ok(ev.geo);
      assert_.equal(ev.geo.lat, 37.654_656);
      assert_.equal(ev.geo.lon, -122.407_75);
      assert_.equal(ev.transparency, 'TRANSPARENT');
    });

    it('parses Meetup event with tz (meetup-timed-tz.ics)', () => {
      const data = ical.parseFile('./test/fixtures/meetup-timed-tz.ics');
      const ev = findItem(values(data), x => x.uid === 'event_nsmxnyppbfc@meetup.com');
      assert_.equal(ev.start.tz, 'America/Phoenix');
      assert_.equal(ev.start.toISOString(), new Date(Date.UTC(2011, 10, 10, 2, 0, 0)).toISOString());
      assert_.equal(ev.method, 'PUBLISH');
    });
  });

  describe('VTODO and VFREEBUSY', () => {
    it('parses VTODO and VFREEBUSY (vtodo-vfreebusy.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vtodo-vfreebusy.ics');
      const todo = findItem(values(data), item => item.uid === 'uid4@host1.com');
      assert_.equal(todo.type, 'VTODO');

      const vfb = findItem(values(data), item => item.type === 'VFREEBUSY');
      assert_.equal(vfb.url, 'http://www.host.com/calendar/busytime/jsmith.ifb');
      const first = vfb.freebusy[0];
      assert_.equal(first.type, 'BUSY');
      assert_.equal(first.start.getUTCFullYear(), 1998);
      assert_.equal(first.start.getUTCMonth(), 2);
      assert_.equal(first.end.getUTCMinutes(), 30);

      const tzEvent = findItem(values(data), item => item.uid === 'EC9439B1-FF65-11D6-9973-003065F99D04');
      assert_.ok(tz.isValidIana(tzEvent.start.tz));
      const ref = '2002-10-28T22:00:00Z';
      const isoNoMs = tzEvent.start.toISOString().replace(/\.\d{3}Z$/, 'Z');
      assert_.equal(isoNoMs, ref);
    });
  });

  describe('Recurrence and RRULE', () => {
    it('handles RRULE with summaries (festival-multiday-rrule.ics)', () => {
      const data = ical.parseFile('./test/fixtures/festival-multiday-rrule.ics');
      const first = findItem(values(data), x => x.summary === 'foobar Summer 2011 starts!');
      assert_.equal(first.start.toISOString(), new Date(2011, 7, 4, 0, 0, 0).toISOString());
      const recur = findItem(values(data), x => x.summary === 'foobarTV broadcast starts');
      assert_.ok(recur.rrule);
      assert_.equal(recur.rrule.toText(), 'every 5 weeks on Monday and Friday until January 30, 2013');
    });

    it('handles RRULE with DTSTART (yearly-recurring-unicode.ics)', () => {
      const data = ical.parseFile('./test/fixtures/yearly-recurring-unicode.ics');
      const ev = values(data)[0];
      const dates = ev.rrule.between(new Date(2013, 0, 1), new Date(2014, 0, 1));
      assert_.equal(dates[0].toDateString(), new Date(2013, 6, 14).toDateString());
    });

    const adelaideRecurringICS = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-TIMEZONE:Australia/Adelaide
BEGIN:VTIMEZONE
TZID:Australia/Adelaide
X-LIC-LOCATION:Australia/Adelaide
BEGIN:STANDARD
TZOFFSETFROM:+1030
TZOFFSETTO:+0930
TZNAME:ACST
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
END:STANDARD
BEGIN:DAYLIGHT
TZOFFSETFROM:+0930
TZOFFSETTO:+1030
TZNAME:ACDT
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Australia/Adelaide:20210401T093000
DTEND;TZID=Australia/Adelaide:20210401T120000
RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20220506T142959Z;BYDAY=TH
DTSTAMP:20210402T040825Z
UID:7c0kkru5hanmevkt92q9cgu9ik@google.com
CREATED:20210218T020324Z
SUMMARY:clear space
END:VEVENT
END:VCALENDAR`;

    const parseAdelaideRecurringEvent = () => {
      const data = ical.parseICS(adelaideRecurringICS);
      const event = findItem(values(data), item => item.type === 'VEVENT');

      return {data, event};
    };

    it('parses DTSTART correctly for DST recurring events', () => {
      const {event} = parseAdelaideRecurringEvent();

      assert_.ok(event, 'Event should be parsed');
      assert_.ok(event.start, 'Event should have start date');

      // DTSTART is 2021-04-01 09:30 in Adelaide
      // Adelaide is UTC+10:30 (daylight time) before DST change on April 4, 2021
      // So 09:30 Adelaide = 23:00 UTC (previous day)
      assert_.equal(
        event.start.toISOString(),
        '2021-03-31T23:00:00.000Z',
        'DTSTART should be correctly parsed as UTC',
      );
      assert_.equal(event.start.tz, 'Australia/Adelaide', 'Timezone should be preserved');
    });

    it('expands RRULE with correct times across DST change', () => {
      const {event} = parseAdelaideRecurringEvent();

      assert_.ok(event.rrule, 'Event should have RRULE');

      const occurrences = event.rrule.between(
        new Date('2021-03-01T00:00:00Z'),
        new Date('2021-05-01T00:00:00Z'),
        true,
      );

      assert_.ok(occurrences.length >= 4, 'Should have at least 4 occurrences');

      // Expected times in UTC:
      // - 2021-04-01 09:30 Adelaide = 2021-03-31 23:00 UTC (before DST, Adelaide is UTC+10:30)
      // - 2021-04-08 09:30 Adelaide = 2021-04-08 00:00 UTC (after DST, Adelaide is UTC+9:30)
      // - 2021-04-15 09:30 Adelaide = 2021-04-15 00:00 UTC (after DST)
      // - 2021-04-22 09:30 Adelaide = 2021-04-22 00:00 UTC (after DST)

      // Note: DST change in Adelaide 2021 was on April 4 at 3:00 AM → 2:00 AM (clocks back)
      // This transitions from UTC+10:30 (daylight) to UTC+9:30 (standard)

      assert_.equal(
        occurrences[0].toISOString(),
        '2021-03-31T23:00:00.000Z',
        'First occurrence (before DST) should be at correct UTC time',
      );

      assert_.equal(
        occurrences[1].toISOString(),
        '2021-04-08T00:00:00.000Z',
        'Second occurrence (after DST) should be at correct UTC time',
      );

      assert_.equal(
        occurrences[2].toISOString(),
        '2021-04-15T00:00:00.000Z',
        'Third occurrence (after DST) should be at correct UTC time',
      );

      assert_.equal(
        occurrences[3].toISOString(),
        '2021-04-22T00:00:00.000Z',
        'Fourth occurrence (after DST) should be at correct UTC time',
      );
    });

    it('maintains consistent local time across DST change', () => {
      // Test that recurrence times maintain local wall-clock time (09:30) across DST changes
      const {event} = parseAdelaideRecurringEvent();

      const occurrences = event.rrule.between(
        new Date('2021-03-01T00:00:00Z'),
        new Date('2021-05-01T00:00:00Z'),
        true,
      );

      // All occurrences should be at 09:30 Adelaide local time
      for (const [index, occurrence] of occurrences.slice(0, 5).entries()) {
        const adelaideTime = occurrence.toLocaleString('en-US', {
          timeZone: 'Australia/Adelaide',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        assert_.equal(
          adelaideTime,
          '09:30',
          `Occurrence ${index + 1} should be at 09:30 Adelaide time, got ${adelaideTime}`,
        );
      }
    });

    it('parses RRULE with inline DTSTART and preserves BYDAY/COUNT', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//rrule-inline-dtstart//EN
BEGIN:VEVENT
UID:rrule-inline-dtstart@test
DTSTART:20240101T100000Z
RRULE:FREQ=WEEKLY;DTSTART=20240101T100000Z;BYDAY=MO,FR;COUNT=4
SUMMARY:Inline DTSTART in RRULE
END:VEVENT
END:VCALENDAR`;

      const data = ical.parseICS(ics);
      const event = findItem(values(data), item => item.type === 'VEVENT');

      assert_.ok(event && event.rrule, 'Event should have an RRULE');

      // BYDAY should still apply (Monday and Friday), COUNT should be kept at 4
      const occurrences = event.rrule.all();
      assert_.equal(occurrences.length, 4, 'RRULE COUNT=4 should produce 4 occurrences');

      const isoDates = occurrences.map(d => d.toISOString());
      assert_.deepEqual(
        isoDates,
        [
          '2024-01-01T10:00:00.000Z', // Monday
          '2024-01-05T10:00:00.000Z', // Friday
          '2024-01-08T10:00:00.000Z', // Monday
          '2024-01-12T10:00:00.000Z', // Friday
        ],
        'BYDAY MO,FR should be preserved when DTSTART is inline in RRULE',
      );

      // Wrapper should surface count in options for compatibility
      assert_.equal(event.rrule.options.count, 4, 'options.count should be preserved');
      assert_.deepEqual(event.rrule.options.byweekday, ['MO', 'FR'], 'BYDAY should be preserved');
    });
  });

  describe('VTODO', () => {
    it('parses VTODO completion (utf8-french-calendar.ics)', () => {
      const data = ical.parseFile('./test/fixtures/utf8-french-calendar.ics');
      const task = values(data)[0];
      assert_.equal(Number(task.completion), 100);
      // Monaco is UTC+2 in July, so completed time should be 08:57:45Z
      assert_.equal(task.completed.toISOString(), '2013-07-16T08:57:45.000Z');
    });
  });

  describe('Alarms', () => {
    it('parses single VALARM (DISPLAY, -PT5M) (event-with-valarm.ics)', () => {
      const data = ical.parseFile('./test/fixtures/event-with-valarm.ics');
      const task = values(data)[0];
      assert_.equal(task.summary, 'Event with an alarm');
      assert_.equal(task.alarms?.length, 1);
      const alarm = task.alarms[0];
      assert_.equal(alarm.description, 'Reminder');
      assert_.equal(alarm.action, 'DISPLAY');
      assert_.equal(alarm.trigger.val, '-PT5M');
    });
  });

  describe('Categories', () => {
    it('parses categories variants (event-with-category.ics)', () => {
      const data = ical.parseFile('./test/fixtures/event-with-category.ics');
      const list = values(data);
      assert_.deepEqual(list[0].categories, ['cat1', 'cat2', 'cat3']);
      assert_.deepEqual(list[1].categories, ['cat1', 'cat2', 'cat3']);
      assert_.deepEqual(list[2].categories, []);
      assert_.deepEqual(list[3].categories, ['lonely-cat']);
      assert_.deepEqual(list[4].categories, ['cat1', 'cat2', 'cat3']);
    });
  });

  describe('Freebusy', () => {
    it('parses Zimbra freebusy (vfreebusy-zimbra.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vfreebusy-zimbra.ics');
      const fb = values(data)[0];
      assert_.equal(fb.url, 'http://mail.example.com/yvr-2a@example.com/20140416');
      assert_.equal(fb.organizer, 'mailto:yvr-2a@example.com');
      assert_.equal(fb.start.getUTCFullYear(), 2014);
      assert_.equal(fb.start.getUTCMonth(), 3);
      assert_.equal(fb.end.getUTCMonth(), 6);
      const busy = fb.freebusy.find(x => x.type === 'BUSY');
      assert_.equal(busy.start.getUTCFullYear(), 2014);
      assert_.equal(busy.start.getUTCMonth(), 3);
    });
  });
});
