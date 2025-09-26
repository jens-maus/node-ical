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
    it('parses basic VEVENTs (test1.ics)', () => {
      const data = ical.parseFile('./test/test1.ics');
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

    it('parses tvcountdown event (test3.ics)', () => {
      const data = ical.parseFile('./test/test3.ics');
      const ev = findItem(values(data), x => x.uid === '20110505T220000Z-83@tvcountdown.com');
      assert_.equal(ev.start.getUTCFullYear(), 2011);
      assert_.equal(ev.start.getUTCMonth(), 4);
      assert_.equal(ev.end.getUTCMonth(), 4);
      assert_.equal(ev.datetype, 'date-time');
    });

    it('parses TripIt event (test4.ics)', () => {
      const data = ical.parseFile('./test/test4.ics');
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

    it('parses Meetup event with tz (test5.ics)', () => {
      const data = ical.parseFile('./test/test5.ics');
      const ev = findItem(values(data), x => x.uid === 'event_nsmxnyppbfc@meetup.com');
      assert_.equal(ev.start.tz, 'America/Phoenix');
      assert_.equal(ev.start.toISOString(), new Date(Date.UTC(2011, 10, 10, 2, 0, 0)).toISOString());
      assert_.equal(ev.method, 'PUBLISH');
    });
  });

  describe('VTODO and VFREEBUSY', () => {
    it('parses VTODO and VFREEBUSY (test2.ics)', () => {
      const data = ical.parseFile('./test/test2.ics');
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
    it('handles RRULE with summaries (test6.ics)', () => {
      const data = ical.parseFile('./test/test6.ics');
      const first = findItem(values(data), x => x.summary === 'foobar Summer 2011 starts!');
      assert_.equal(first.start.toISOString(), new Date(2011, 7, 4, 0, 0, 0).toISOString());
      const recur = findItem(values(data), x => x.summary === 'foobarTV broadcast starts');
      assert_.ok(recur.rrule);
      assert_.equal(recur.rrule.toText(), 'every 5 weeks on Monday, Friday until January 30, 2013');
    });

    it('handles RRULE with DTSTART (test7.ics)', () => {
      const data = ical.parseFile('./test/test7.ics');
      const ev = values(data)[0];
      const dates = ev.rrule.between(new Date(2013, 0, 1), new Date(2014, 0, 1));
      assert_.equal(dates[0].toDateString(), new Date(2013, 6, 14).toDateString());
    });
  });

  describe('VTODO', () => {
    it('parses VTODO completion (test8.ics)', () => {
      const data = ical.parseFile('./test/test8.ics');
      const task = values(data)[0];
      assert_.equal(Number(task.completion), 100);
      // Monaco is UTC+2 in July, so completed time should be 08:57:45Z
      assert_.equal(task.completed.toISOString(), '2013-07-16T08:57:45.000Z');
    });
  });

  describe('Alarms', () => {
    it('parses single VALARM (DISPLAY, -PT5M) (test9.ics)', () => {
      const data = ical.parseFile('./test/test9.ics');
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
    it('parses categories variants (test10.ics)', () => {
      const data = ical.parseFile('./test/test10.ics');
      const list = values(data);
      assert_.deepEqual(list[0].categories, ['cat1', 'cat2', 'cat3']);
      assert_.deepEqual(list[1].categories, ['cat1', 'cat2', 'cat3']);
      assert_.deepEqual(list[2].categories, []);
      assert_.deepEqual(list[3].categories, ['lonely-cat']);
      assert_.deepEqual(list[4].categories, ['cat1', 'cat2', 'cat3']);
    });
  });

  describe('Freebusy', () => {
    it('parses Zimbra freebusy (test11.ics)', () => {
      const data = ical.parseFile('./test/test11.ics');
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
