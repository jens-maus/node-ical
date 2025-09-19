const test = require('node:test');
const assert_ = require('node:assert');
const process = require('node:process');
const moment = require('moment-timezone');
const ical = require('../node-ical.js');

process.env.TZ = 'America/San_Francisco';
moment.tz.link('Etc/Unknown|Etc/GMT');
moment.tz.setDefault('America/San_Francisco');

function values(object) {
  return Object.values(object);
}

function filterItems(array, predicate) {
  return array.filter(item => predicate(item));
}

function findItem(array, predicate) {
  return array.find(item => predicate(item));
}

test('parse test1.ics basic VEVENTs', () => {
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

test('parse test2.ics VTODO + VFREEBUSY', () => {
  const data = ical.parseFile('./test/test2.ics');
  const todo = findItem(values(data), item => item.uid === 'uid4@host1.com');
  assert_.equal(todo.type, 'VTODO');

  const vfb = findItem(values(data), item => item.type === 'VFREEBUSY');
  assert_.equal(vfb.url, 'http://www.host.com/calendar/busytime/jsmith.ifb');
  const first = vfb.freebusy[0];
  assert_.equal(first.type, 'BUSY');
  assert_.equal(first.start.getFullYear(), 1998);
  assert_.equal(first.start.getUTCMonth(), 2);
  assert_.equal(first.end.getUTCMinutes(), 30);

  const tzEvent = findItem(values(data), item => item.uid === 'EC9439B1-FF65-11D6-9973-003065F99D04');
  assert_.ok(moment.tz.zone(tzEvent.start.tz));
  const ref = '2002-10-28T22:00:00Z';
  const start = moment(tzEvent.start).tz(tzEvent.start.tz);
  assert_.equal(start.utc().format(), ref);
});

test('parse test3.ics tvcountdown event', () => {
  const data = ical.parseFile('./test/test3.ics');
  const ev = findItem(values(data), x => x.uid === '20110505T220000Z-83@tvcountdown.com');
  assert_.equal(ev.start.getFullYear(), 2011);
  assert_.equal(ev.start.getMonth(), 4);
  assert_.equal(ev.end.getMonth(), 4);
  assert_.equal(ev.datetype, 'date-time');
});

test('parse test4.ics tripit', () => {
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

test('parse test5.ics meetup', () => {
  const data = ical.parseFile('./test/test5.ics');
  const ev = findItem(values(data), x => x.uid === 'event_nsmxnyppbfc@meetup.com');
  assert_.equal(ev.start.tz, 'America/Phoenix');
  assert_.equal(ev.start.toISOString(), new Date(Date.UTC(2011, 10, 10, 2, 0, 0)).toISOString());
  assert_.equal(ev.method, 'PUBLISH');
});

test('parse test6.ics recurring + summaries', () => {
  const data = ical.parseFile('./test/test6.ics');
  const first = findItem(values(data), x => x.summary === 'foobar Summer 2011 starts!');
  assert_.equal(first.start.toISOString(), new Date(2011, 7, 4, 0, 0, 0).toISOString());
  const recur = findItem(values(data), x => x.summary === 'foobarTV broadcast starts');
  assert_.ok(recur.rrule);
  assert_.equal(recur.rrule.toText(), 'every 5 weeks on Monday, Friday until January 30, 2013');
});

test('parse test7.ics rrule dtstart', () => {
  const data = ical.parseFile('./test/test7.ics');
  const ev = values(data)[0];
  const dates = ev.rrule.between(new Date(2013, 0, 1), new Date(2014, 0, 1));
  assert_.equal(dates[0].toDateString(), new Date(2013, 6, 14).toDateString());
});

test('parse test8.ics VTODO completion', () => {
  const data = ical.parseFile('./test/test8.ics');
  const task = values(data)[0];
  assert_.equal(task.completion, 100);
  assert_.equal(task.completed.toISOString(), new Date(2013, 6, 16, 10, 57, 45).toISOString());
});

test('parse test9.ics VALARM', () => {
  const data = ical.parseFile('./test/test9.ics');
  const task = values(data)[0];
  assert_.equal(task.summary, 'Event with an alarm');
  assert_.equal(task.alarms?.length, 1);
  const alarm = task.alarms[0];
  assert_.equal(alarm.description, 'Reminder');
  assert_.equal(alarm.action, 'DISPLAY');
  assert_.equal(alarm.trigger.val, '-PT5M');
});

test('parse test10.ics categories parsing variants', () => {
  const data = ical.parseFile('./test/test10.ics');
  const list = values(data);
  assert_.deepEqual(list[0].categories, ['cat1', 'cat2', 'cat3']);
  assert_.deepEqual(list[1].categories, ['cat1', 'cat2', 'cat3']);
  assert_.deepEqual(list[2].categories, []);
  assert_.deepEqual(list[3].categories, ['lonely-cat']);
  assert_.deepEqual(list[4].categories, ['cat1', 'cat2', 'cat3']);
});

test('parse test11.ics zimbra freebusy', () => {
  const data = ical.parseFile('./test/test11.ics');
  const fb = values(data)[0];
  assert_.equal(fb.url, 'http://mail.example.com/yvr-2a@example.com/20140416');
  assert_.equal(fb.organizer, 'mailto:yvr-2a@example.com');
  assert_.equal(fb.start.getFullYear(), 2014);
  assert_.equal(fb.start.getMonth(), 3);
  assert_.equal(fb.end.getMonth(), 6);
  const busy = fb.freebusy.find(x => x.type === 'BUSY');
  assert_.equal(busy.start.getFullYear(), 2014);
  assert_.equal(busy.start.getMonth(), 3);
});

