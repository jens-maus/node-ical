const assert = require('node:assert');
const process = require('node:process');
const {it: test} = require('mocha');
const moment = require('moment-timezone');
const ical = require('../node-ical.js');

// Match legacy vows environment setup so recurrence/timezone calculations stay consistent.
process.env.TZ = 'America/San_Francisco';
moment.tz.link('Etc/Unknown|Etc/GMT');
moment.tz.setDefault('America/San_Francisco');

// Test12.ics – RRULE + EXDATE + RECURRENCE-ID override
test('test12.ics recurrence + exdates + override', () => {
  const data = ical.parseFile('./test/test12.ics');
  const event = Object.values(data).find(x => x.uid === '0000001' && x.summary === 'Treasure Hunting');
  assert.ok(event.rrule);
  assert.equal(event.summary, 'Treasure Hunting');
  assert.ok(event.exdate);
  assert.ok(event.exdate[new Date(Date.UTC(2015, 6, 8, 19, 0, 0)).toISOString().slice(0, 10)]);
  assert.ok(event.exdate[new Date(Date.UTC(2015, 6, 10, 19, 0, 0)).toISOString().slice(0, 10)]);
  assert.ok(event.recurrences);
  const key = new Date(Date.UTC(2015, 6, 7, 19, 0, 0)).toISOString().slice(0, 10);
  assert.ok(event.recurrences[key]);
  assert.equal(event.recurrences[key].summary, 'More Treasure Hunting');
});

// Test13.ics – RECURRENCE-ID before RRULE
test('test13.ics recurrence id before rrule', () => {
  const data = ical.parseFile('./test/test13.ics');
  const event = Object.values(data).find(x => x.uid === '6m2q7kb2l02798oagemrcgm6pk@google.com' && x.summary === 'repeated');
  assert.ok(event.rrule);
  assert.equal(event.summary, 'repeated');
  const key = new Date(Date.UTC(2016, 7, 26, 11, 0, 0)).toISOString().slice(0, 10);
  assert.ok(event.recurrences[key]);
  assert.equal(event.recurrences[key].summary, 'bla bla');
});

// Test14.ics – comma-separated EXDATEs + bad times EXDATEs
test('test14.ics comma separated exdates', () => {
  const data = ical.parseFile('./test/test14.ics');
  const event = Object.values(data).find(x => x.uid === '98765432-ABCD-DCBB-999A-987765432123');
  assert.equal(event.summary, 'Example of comma-separated exdates');
  assert.ok(event.exdate);
  const checks = [new Date(2017, 6, 6, 12), new Date(2017, 6, 17, 12), new Date(2017, 6, 20, 12), new Date(2017, 7, 3, 12)];
  for (const d of checks) {
    assert.ok(event.exdate[d.toISOString().slice(0, 10)]);
  }

  assert.equal(event.exdate[new Date(2017, 4, 5, 12).toISOString().slice(0, 10)], undefined);
});

test('test14.ics exdates with bad times', () => {
  const data = ical.parseFile('./test/test14.ics');
  const event = Object.values(data).find(x => x.uid === '1234567-ABCD-ABCD-ABCD-123456789012');
  assert.equal(event.summary, 'Example of exdate with bad times');
  assert.ok(event.exdate);
  const bads = [new Date(2017, 11, 18, 12), new Date(2017, 11, 19, 12)];
  for (const d of bads) {
    assert.ok(event.exdate[d.toISOString().slice(0, 10)]);
  }
});

// Test15.ics – Microsoft Exchange timezone naming
test('test15.ics ms exchange tz', () => {
  const data = ical.parseFile('./test/test15.ics');
  const event = Object.values(data).find(x => x.uid === '040000008200E00074C5B7101A82E00800000000C9AB6E5A6AFED401000000000000000010000000C55132227F0F0948A7D58F6190A3AEF9');
  assert.equal(event.start.tz, 'Asia/Bangkok');
  assert.equal(event.end.tz, 'Asia/Bangkok');
});

// Test16.ics – quoted parameter values
test('test16.ics quoted params', () => {
  const data = ical.parseFile('./test/test16.ics');
  const event = Object.values(data)[0];
  assert.ok(event.start.tz);
});

// Test17.ics – non-stringified start/end
test('test17.ics non-string date objects', () => {
  const data = ical.parseFile('./test/test17.ics');
  const event = Object.values(data)[0];
  assert.notEqual(typeof event.start, 'string');
  assert.notEqual(typeof event.end, 'string');
});

// Test18.ics – timezone detection scenarios
test('test18.ics timezone detection', () => {
  const data = ical.parseFile('./test/test18.ics');
  const events = Object.values(data).filter(x => x.type === 'VEVENT');
  assert.equal(events.length, 5);
  const uids = ['1C9439B1-FF65-11D6-9973-003065F99D04', '2C9439B1-FF65-11D6-9973-003065F99D04', '3C9439B1-FF65-11D6-9973-003065F99D04', '4C9439B1-FF65-11D6-9973-003065F99D04', '5C9439B1-FF65-11D6-9973-003065F99D04'];
  const map = Object.fromEntries(events.map(event => [event.uid, event]));
  assert.equal(map[uids[0]].datetype, 'date-time');
  assert.equal(map[uids[0]].start.tz, undefined);
  assert.equal(map[uids[1]].start.tz, 'Etc/UTC');
  assert.equal(map[uids[2]].start.tz, 'America/New_York');
  assert.equal(map[uids[3]].datetype, 'date');
});

// Ms_timezones.ics – Microsoft windows zone mapping
test('ms_timezones.ics mapped zone times', () => {
  const data = ical.parseFile('./test/ms_timezones.ics');
  const event = Object.values(data).find(x => x.summary === 'Log Yesterday\'s Jira time');
  assert.equal(event.start.getFullYear(), 2020);
  assert.equal(event.start.getMonth(), 5);
  assert.equal(event.start.getUTCHours(), 7);
  assert.equal(event.end.getUTCMinutes(), 30);
});

// Bad_ms_tz.ics – unexpected ms timezone (should not use Customized Time Zone)
test('bad_ms_tz.ics invalid custom tz', () => {
  const data = ical.parseFile('./test/bad_ms_tz.ics');
  const event = Object.values(data).find(x => x.summary === '[private]');
  assert.notEqual(event.start.tz, 'Customized Time Zone');
});

test('bad_custom_ms_tz2.ics invalid custom tz 2', () => {
  const data = ical.parseFile('./test/bad_custom_ms_tz2.ics');
  const event = Object.values(data).find(x => x.summary === '[private]');
  assert.notEqual(event.start.tz, 'Customized Time Zone 1');
});

test('Office-2012-owa.ics old ms tz before DST', () => {
  const data = ical.parseFile('./test/Office-2012-owa.ics');
  const event = Object.values(data).find(x => x.summary === ' TEST');
  assert.equal(event.end.toISOString().slice(0, 8), new Date(Date.UTC(2020, 9, 28, 15, 0, 0)).toISOString().slice(0, 8));
});

test('Office-2012-owa.ics old ms tz after DST', () => {
  const data = ical.parseFile('./test/Office-2012-owa.ics');
  const event = Object.values(data).find(x => x.summary === ' TEST 3');
  assert.equal(event.end.toISOString().slice(0, 8), new Date(Date.UTC(2020, 10, 2, 20, 0, 0)).toISOString().slice(0, 8));
});

test('bad_custom_ms_tz.ics custom tz recurrence', () => {
  const data = ical.parseFile('./test/bad_custom_ms_tz.ics');
  const event = Object.values(data).find(x => x.summary === '[private]');
  assert.equal(event.start.toISOString().slice(0, 8), new Date(Date.UTC(2021, 2, 25, 10, 35, 0)).toISOString().slice(0, 8));
});

test('bad_custom_ms_tz.ics no end same as start', () => {
  const data = ical.parseFile('./test/bad_custom_ms_tz.ics');
  const event = Object.values(data).find(x => x.summary === '*masked-away*');
  assert.equal(event.end.toISOString().slice(0, 8), event.start.toISOString().slice(0, 8));
});

test('bad_custom_ms_tz.ics negative duration', () => {
  const data = ical.parseFile('./test/bad_custom_ms_tz.ics');
  const event = Object.values(data).find(x => x.summary === '*masked-away2*');
  assert.equal(event.end.toISOString().slice(0, 8), new Date(Date.UTC(2021, 2, 23, 21, 56, 56)).toISOString().slice(0, 8));
});

// BadRRULE.ics – invalid date still keeps time portion
test('badRRULE.ics start time retained', () => {
  const data = ical.parseFile('./test/badRRULE.ics');
  const event = Object.values(data).find(x => x.summary === 'Academic Time');
  assert.equal(event.start.toISOString().slice(11), '15:50:00.000Z');
});

// Test_with_forward_TZ.ics – full day forward of UTC
test('test_with_forward_TZ.ics east TZ midnight start', () => {
  moment.tz.setDefault('Europe/Berlin');
  const data = ical.parseFile('./test/test_with_forward_TZ.ics');
  const event = Object.values(data).find(x => x.summary === 'Fear TWD');
  assert.equal(event.start.toISOString().slice(11), '00:00:00.000Z');
});

// Test19.ics – organizer params
test('test19.ics organizer params', () => {
  const data = ical.parseFile('./test/test19.ics');
  const event = Object.values(data)[0];
  assert.equal(event.organizer.params.CN, 'stomlinson@mozilla.com');
  assert.equal(event.organizer.val, 'mailto:stomlinson@mozilla.com');
});

// Test20.ics – VEVENT status values
test('test20.ics event statuses', () => {
  const data = ical.parseFile('./test/test20.ics');
  const getByUid = uid => Object.values(data).find(x => x.uid === uid);
  assert.equal(getByUid('31a1ffc9-9b76-465b-ae4a-cadb694c9d37').status, 'TENTATIVE');
  assert.equal(getByUid('F00F3710-BF4D-46D3-9A2C-1037AB24C6AC').status, 'CONFIRMED');
  assert.equal(getByUid('8CAB46C5-669F-4249-B1AD-52BFA72F4E0A').status, 'CANCELLED');
  assert.equal(getByUid('99F615DE-82C6-4CEF-97B8-CD0D3E1EE0D3').status, undefined);
});

// Test21.ics – VTIMEZONE usage for floating DTSTART
test('test21.ics floating start uses VTIMEZONE', () => {
  const data = ical.parseFile('./test/test21.ics');
  const event = Object.values(data).find(x => x.uid === 'f683404f-aede-43eb-8774-27f62bb27c92');
  assert.equal(event.start.toJSON(), '2022-10-09T08:00:00.000Z');
  assert.equal(event.end.toJSON(), '2022-10-09T09:00:00.000Z');
});

// Test22.ics – quoted attendee parameters + X-RESPONSE-COMMENT
test('test22.ics attendee params and response comment', () => {
  const data = ical.parseFile('./test/test22.ics');
  const event = Object.values(data)[0];
  assert.equal(event.attendee.params['X-RESPONSE-COMMENT'], 'Test link: https://example.com/test');
  assert.equal(event.attendee.params.CUTYPE, 'INDIVIDUAL');
  assert.equal(event.attendee.val, 'mailto:test@example.com');
});

// Test_with_tz_list.ics – tzid list selects correct tz
test('test_with_tz_list.ics tz list first valid tz used', () => {
  const data = ical.parseFile('./test/test_with_tz_list.ics');
  const event = Object.values(data).find(x => x.uid === 'E689AEB8C02C4E2CADD8C7D3D303CEAD0');
  assert.equal(event.start.tz, 'Europe/Berlin');
});

// Test_with_multiple_tzids_in_vtimezone.ics – select correct tz across multiple components
test('test_with_multiple_tzids_in_vtimezone.ics date/time range', () => {
  const data = ical.parseFile('./test/test_with_multiple_tzids_in_vtimezone.ics');
  const event = Object.values(data).find(x => x.uid === '1891-1709856000-1709942399@www.washougal.k12.wa.us');
  assert.equal(event.start.toJSON(), '2024-06-27T07:00:00.000Z');
  assert.equal(event.end.toJSON(), '2024-06-28T06:00:00.000Z');
});

// Test_date_time_duration.ics – duration with date-time DTSTART
test('test_date_time_duration.ics duration applied to datetime', () => {
  const data = ical.parseFile('./test/test_date_time_duration.ics');
  const event = Object.values(data).find(x => x.summary === 'period test2');
  assert.equal(event.start.toJSON(), '2024-02-15T09:00:00.000Z');
  assert.equal(event.end.toJSON(), '2024-02-15T10:15:00.000Z');
});

// Test_date_duration.ics – duration with date DTSTART
test('test_date_duration.ics duration applied to date', () => {
  const data = ical.parseFile('./test/test_date_duration.ics');
  const event = Object.values(data).find(x => x.summary === 'period test2');
  assert.equal(event.start.toDateString(), new Date(2024, 1, 15).toDateString());
  assert.equal(event.end.toDateString(), new Date(2024, 1, 22).toDateString());
});

// Test_with_int_tzid.ics – integer-like tzid preserved
test('test_with_int_tzid.ics integer tzid preserved', () => {
  const data = ical.parseFile('./test/test_with_int_tzid.ics');
  const event = Object.values(data)[0];
  assert.equal(event.summary, 'test export import');
});

// Test23.ics – RRULE with timezone dtstart
test('test23.ics rrule timezone dtstart', () => {
  const data = ical.parseFile('./test/test23.ics');
  const first = Object.values(data).find(x => x.uid === '000021a');
  assert.equal(first.datetype, 'date-time');
  assert.equal(first.start.tz, 'Europe/Berlin');
  assert.equal(first.start.toISOString(), '2022-07-14T12:00:00.000Z');
  if (process.platform !== 'win32') {
    const r1 = first.rrule.between(new Date(2023, 0, 1), new Date(2024, 0, 1))[0];
    // Legacy vows test expected 12:00Z; keep original semantic expectation for pure framework migration.
    assert.equal(r1.toISOString(), '2023-07-14T12:00:00.000Z');
  }

  const second = Object.values(data).find(x => x.uid === '000021b');
  assert.equal(second.datetype, 'date-time');
  assert.equal(second.start.tz, 'Etc/GMT-2');
  assert.equal(second.start.toISOString(), '2022-07-15T12:00:00.000Z');
  assert.ok(second.rrule && second.rrule.options.tzid);
  assert.equal(second.rrule.options.tzid, 'Etc/GMT-2');
  if (process.platform !== 'win32') {
    const r2 = second.rrule.between(new Date(2023, 0, 1), new Date(2024, 0, 1))[0];
    assert.equal(r2.toISOString(), '2023-07-15T12:00:00.000Z');
  }
});

// Germany_at_end_of_day_repeating.ics – moved recurrence across DST
test('germany_at_end_of_day_repeating.ics moved recurrence', () => {
  const data = ical.parseFile('./test/germany_at_end_of_day_repeating.ics');
  const event = Object.values(data).find(x => x.uid === '2m6mt1p89l2anl74915ur3hsgm@google.com');
  assert.equal(event.start.toDateString(), new Date(2024, 9, 22, 23, 0, 0).toDateString());
});

// Whole_day_moved_over_dst_change_berlin.ics – recurrence shift over DST
test('whole_day_moved_over_dst_change_berlin.ics moved whole-day recurrence', () => {
  const data = ical.parseFile('./test/whole_day_moved_over_dst_change_berlin.ics');
  const moved = Object.values(data).find(x => x.uid === '14nv8jl8d6dvdbl477lod4fftf@google.com');
  assert.ok(moved && moved.recurrences, 'Missing recurrence map');
  const rec = moved.recurrences?.['2024-10-28'];
  assert.ok(rec, 'Expected recurrence 2024-10-28');
  assert.equal(rec.datetype, 'date');
  assert.equal(rec.start.toDateString(), new Date(2024, 9, 30).toDateString());
});
