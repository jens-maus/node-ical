const assert = require('node:assert/strict');
const {describe, it} = require('mocha');
const tz = require('../tz-utils.js');
const ical = require('../node-ical.js');

// Map 'Etc/Unknown' TZID used in fixtures to a concrete zone
tz.linkAlias('Etc/Unknown', 'Etc/GMT');

// Test12.ics – RRULE + EXDATE + RECURRENCE-ID override
describe('parser: advanced cases', () => {
  // Recurrence and exceptions
  describe('Recurrence and exceptions', () => {
    it('handles RRULE + EXDATEs + RECURRENCE-ID override (test12.ics)', () => {
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
    it('handles RECURRENCE-ID before RRULE (test13.ics)', () => {
      const data = ical.parseFile('./test/test13.ics');
      const event = Object.values(data).find(x => x.uid === '6m2q7kb2l02798oagemrcgm6pk@google.com' && x.summary === 'repeated');
      assert.ok(event.rrule);
      assert.equal(event.summary, 'repeated');
      const key = new Date(Date.UTC(2016, 7, 26, 11, 0, 0)).toISOString().slice(0, 10);
      assert.ok(event.recurrences[key]);
      assert.equal(event.recurrences[key].summary, 'bla bla');
    });

    // Test14.ics – comma-separated EXDATEs + bad times EXDATEs
    it('parses comma-separated EXDATEs (test14.ics)', () => {
      const data = ical.parseFile('./test/test14.ics');
      const event = Object.values(data).find(x => x.uid === '98765432-ABCD-DCBB-999A-987765432123');
      assert.equal(event.summary, 'Example of comma-separated exdates');
      assert.ok(event.exdate);
      const checks = [
        new Date(Date.UTC(2017, 6, 6, 12)),
        new Date(Date.UTC(2017, 6, 17, 12)),
        new Date(Date.UTC(2017, 6, 20, 12)),
        new Date(Date.UTC(2017, 7, 3, 12)),
      ];
      for (const d of checks) {
        assert.ok(event.exdate[d.toISOString().slice(0, 10)]);
      }

      assert.equal(event.exdate[new Date(Date.UTC(2017, 4, 5, 12)).toISOString().slice(0, 10)], undefined);
    });

    it('tolerates EXDATEs with bad times (test14.ics)', () => {
      const data = ical.parseFile('./test/test14.ics');
      const event = Object.values(data).find(x => x.uid === '1234567-ABCD-ABCD-ABCD-123456789012');
      assert.equal(event.summary, 'Example of exdate with bad times');
      assert.ok(event.exdate);
      const bads = [
        new Date(Date.UTC(2017, 11, 18, 12)),
        new Date(Date.UTC(2017, 11, 19, 12)),
      ];
      for (const d of bads) {
        assert.ok(event.exdate[d.toISOString().slice(0, 10)]);
      }
    });
  });

  // Test15.ics – Microsoft Exchange timezone naming
  // Moved under the consolidated 'Microsoft time zones' section below to reduce nesting.

  // Test16.ics – quoted parameter values
  describe('Metadata and parsing robustness', () => {
    it('parses quoted parameter values (test16.ics)', () => {
      const data = ical.parseFile('./test/test16.ics');
      const event = Object.values(data)[0];
      assert.ok(event.start.tz);
    });

    // Test17.ics – non-stringified start/end
    it('produces Date objects (non-strings) (test17.ics)', () => {
      const data = ical.parseFile('./test/test17.ics');
      const event = Object.values(data)[0];
      assert.notEqual(typeof event.start, 'string');
      assert.notEqual(typeof event.end, 'string');
    });
  });

  // Test18.ics – timezone detection scenarios
  describe('Timezone detection', () => {
    it('infers/retains timezone per event (test18.ics)', () => {
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
  });

  // Test19.ics – organizer params
  describe('Organizer and status', () => {
    it('preserves organizer params (test19.ics)', () => {
      const data = ical.parseFile('./test/test19.ics');
      const event = Object.values(data)[0];
      assert.equal(event.organizer.params.CN, 'stomlinson@mozilla.com');
      assert.equal(event.organizer.val, 'mailto:stomlinson@mozilla.com');
    });

    // Test20.ics – VEVENT status values
    it('parses VEVENT status values (test20.ics)', () => {
      const data = ical.parseFile('./test/test20.ics');
      const getByUid = uid => Object.values(data).find(x => x.uid === uid);
      assert.equal(getByUid('31a1ffc9-9b76-465b-ae4a-cadb694c9d37').status, 'TENTATIVE');
      assert.equal(getByUid('F00F3710-BF4D-46D3-9A2C-1037AB24C6AC').status, 'CONFIRMED');
      assert.equal(getByUid('8CAB46C5-669F-4249-B1AD-52BFA72F4E0A').status, 'CANCELLED');
      assert.equal(getByUid('99F615DE-82C6-4CEF-97B8-CD0D3E1EE0D3').status, undefined);
    });
  });

  // Test21.ics – VTIMEZONE usage for floating DTSTART
  describe('Floating DTSTART with VTIMEZONE', () => {
    it('applies VTIMEZONE to floating DTSTART (test21.ics)', () => {
      const data = ical.parseFile('./test/test21.ics');
      const event = Object.values(data).find(x => x.uid === 'f683404f-aede-43eb-8774-27f62bb27c92');
      assert.equal(event.start.toJSON(), '2022-10-09T08:00:00.000Z');
      assert.equal(event.end.toJSON(), '2022-10-09T09:00:00.000Z');
    });
  });

  // Test22.ics – quoted attendee parameters + X-RESPONSE-COMMENT
  describe('Attendee params', () => {
    it('parses attendee params incl. X-RESPONSE-COMMENT (test22.ics)', () => {
      const data = ical.parseFile('./test/test22.ics');
      const event = Object.values(data)[0];
      assert.equal(event.attendee.params['X-RESPONSE-COMMENT'], 'Test link: https://example.com/test');
      assert.equal(event.attendee.params.CUTYPE, 'INDIVIDUAL');
      assert.equal(event.attendee.val, 'mailto:test@example.com');
    });
  });

  // Test23.ics – RRULE with timezone dtstart
  describe('RRULE with timezone DTSTART', () => {
    it('handles RRULE with timezone DTSTART (test23.ics)', () => {
      const data = ical.parseFile('./test/test23.ics');
      const first = Object.values(data).find(x => x.uid === '000021a');
      assert.equal(first.datetype, 'date-time');
      assert.equal(first.start.tz, 'Europe/Berlin');
      assert.equal(first.start.toISOString(), '2022-07-14T12:00:00.000Z');
      // RRULE must carry the DTSTART timezone identifier
      assert.ok(first.rrule && first.rrule.options && first.rrule.options.tzid);
      assert.equal(first.rrule.options.tzid, 'Europe/Berlin');

      const second = Object.values(data).find(x => x.uid === '000021b');
      assert.equal(second.datetype, 'date-time');
      assert.equal(second.start.tz, 'Etc/GMT-2');
      assert.equal(second.start.toISOString(), '2022-07-15T12:00:00.000Z');
      assert.ok(second.rrule && second.rrule.options.tzid);
      assert.equal(second.rrule.options.tzid, 'Etc/GMT-2');
    });
  });

  // Ms_timezones.ics – Microsoft windows zone mapping and custom tz handling
  describe('Microsoft time zones', () => {
    it('maps Exchange tz to IANA (test15.ics)', () => {
      const data = ical.parseFile('./test/test15.ics');
      const event = Object.values(data).find(x => x.uid === '040000008200E00074C5B7101A82E00800000000C9AB6E5A6AFED401000000000000000010000000C55132227F0F0948A7D58F6190A3AEF9');
      assert.equal(event.start.tz, 'Asia/Bangkok');
      assert.equal(event.end.tz, 'Asia/Bangkok');
    });
    describe('Windows mapping and custom tz', () => {
      it('maps Windows zones to times (ms_timezones.ics)', () => {
        const data = ical.parseFile('./test/ms_timezones.ics');
        const event = Object.values(data).find(x => x.summary === 'Log Yesterday\'s Jira time');
        assert.strictEqual(event.start.getUTCFullYear(), 2020);
        assert.strictEqual(event.start.getUTCMonth(), 5);
        assert.strictEqual(event.start.getUTCHours(), 7);
        assert.strictEqual(event.end.getUTCMinutes(), 30);
      });

      // Bad_ms_tz.ics – unexpected ms timezone (should not use Customized Time Zone)
      it('ignores "Customized Time Zone" (bad_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/bad_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '[private]');
        assert.notEqual(event.start.tz, 'Customized Time Zone');
      });

      it('rejects invalid custom tz (bad_custom_ms_tz2.ics)', () => {
        const data = ical.parseFile('./test/bad_custom_ms_tz2.ics');
        const event = Object.values(data).find(x => x.summary === '[private]');
        assert.notEqual(event.start.tz, 'Customized Time Zone 1');
      });

      it('applies old MS tz before DST (Office-2012-owa.ics)', () => {
        const data = ical.parseFile('./test/Office-2012-owa.ics');
        const event = Object.values(data).find(x => x.summary === ' TEST');
        assert.equal(event.end.toISOString().slice(0, 10), new Date(Date.UTC(2020, 9, 28, 15, 0, 0)).toISOString().slice(0, 10));
      });

      it('applies old MS tz after DST (Office-2012-owa.ics)', () => {
        const data = ical.parseFile('./test/Office-2012-owa.ics');
        const event = Object.values(data).find(x => x.summary === ' TEST 3');
        assert.equal(event.end.toISOString().slice(0, 10), new Date(Date.UTC(2020, 10, 2, 20, 0, 0)).toISOString().slice(0, 10));
      });

      it('handles custom tz recurrence (bad_custom_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/bad_custom_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '[private]');
        assert.equal(event.start.toISOString().slice(0, 10), new Date(Date.UTC(2021, 2, 25, 10, 35, 0)).toISOString().slice(0, 10));
      });

      it('uses start as end when missing (bad_custom_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/bad_custom_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '*masked-away*');
        assert.equal(event.end.toISOString().slice(0, 10), event.start.toISOString().slice(0, 10));
      });

      it('handles negative duration (bad_custom_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/bad_custom_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '*masked-away2*');
        assert.equal(event.end.toISOString().slice(0, 10), new Date(Date.UTC(2021, 2, 23, 21, 56, 56)).toISOString().slice(0, 10));
      });
    });
  });

  // BadRRULE.ics – invalid date still keeps time portion
  describe('Invalid RRULE handling', () => {
    it('retains start time on invalid RRULE date (badRRULE.ics)', () => {
      const data = ical.parseFile('./test/badRRULE.ics');
      const event = Object.values(data).find(x => x.summary === 'Academic Time');
      assert.equal(event.start.toISOString().slice(11), '15:50:00.000Z');
    });
  });

  // Test_with_forward_TZ.ics – full day forward of UTC
  describe('Forward TZ behavior', () => {
    it('preserves midnight in forward TZ (test_with_forward_TZ.ics)', () => {
      const data = ical.parseFile('./test/test_with_forward_TZ.ics');
      const event = Object.values(data).find(x => x.summary === 'Fear TWD');
      assert.equal(event.datetype, 'date');
      // Date-only event must preserve its calendar-day boundaries
      assert.equal(event.start.toDateString(), new Date(2020, 9, 17).toDateString());
      assert.equal(event.end.toDateString(), new Date(2020, 9, 18).toDateString());

      // If a timezone is exposed, also ensure both boundaries are local midnight and exactly one local day apart
      const zone = (event.start && event.start.tz) || (event.end && event.end.tz);
      if (zone) {
        const startLocalYMD = event.start.toLocaleString('sv-SE', {timeZone: zone}).slice(0, 10);
        const endLocalYMD = event.end.toLocaleString('sv-SE', {timeZone: zone}).slice(0, 10);
        assert.ok(/\d{4}-\d{2}-\d{2}/.test(startLocalYMD));
        assert.ok(/\d{4}-\d{2}-\d{2}/.test(endLocalYMD));
        assert.notEqual(startLocalYMD, endLocalYMD);
        // Confirm exactly one day apart by constructing local midnights
        const [sy, sm, sd] = startLocalYMD.split('-').map(Number);
        const [ey, em, ed] = endLocalYMD.split('-').map(Number);
        const startLocalMid = new Date(Date.UTC(sy, sm - 1, sd));
        const endLocalMid = new Date(Date.UTC(ey, em - 1, ed));
        const diffDays = Math.round((endLocalMid - startLocalMid) / 86_400_000);
        assert.equal(diffDays, 1);
      }
    });
  });

  // Test_with_tz_list.ics – tzid list selects correct tz
  describe('Timezone lists', () => {
    it('selects first valid tz from list (test_with_tz_list.ics)', () => {
      const data = ical.parseFile('./test/test_with_tz_list.ics');
      const event = Object.values(data).find(x => x.uid === 'E689AEB8C02C4E2CADD8C7D3D303CEAD0');
      assert.equal(event.start.tz, 'Europe/Berlin');
    });

    // Test_with_multiple_tzids_in_vtimezone.ics – select correct tz across multiple components
    it('chooses correct tz across components (test_with_multiple_tzids_in_vtimezone.ics)', () => {
      const data = ical.parseFile('./test/test_with_multiple_tzids_in_vtimezone.ics');
      const event = Object.values(data).find(x => x.uid === '1891-1709856000-1709942399@www.washougal.k12.wa.us');
      assert.equal(event.start.toJSON(), '2024-06-27T07:00:00.000Z');
      assert.equal(event.end.toJSON(), '2024-06-28T06:00:00.000Z');
    });
  });

  // Test_date_time_duration.ics – duration with date-time DTSTART
  describe('Durations', () => {
    it('applies DURATION to datetime DTSTART (test_date_time_duration.ics)', () => {
      const data = ical.parseFile('./test/test_date_time_duration.ics');
      const event = Object.values(data).find(x => x.summary === 'period test2');
      assert.equal(event.start.toJSON(), '2024-02-15T09:00:00.000Z');
      assert.equal(event.end.toJSON(), '2024-02-15T10:15:00.000Z');
    });

    // Test_date_duration.ics – duration with date DTSTART
    it('applies DURATION to date DTSTART (test_date_duration.ics)', () => {
      const data = ical.parseFile('./test/test_date_duration.ics');
      const event = Object.values(data).find(x => x.summary === 'period test2');
      assert.equal(event.start.toDateString(), new Date(2024, 1, 15).toDateString());
      assert.equal(event.end.toDateString(), new Date(2024, 1, 22).toDateString());
    });
  });

  // Test_with_int_tzid.ics – integer-like tzid preserved
  describe('TZID preservation', () => {
    it('preserves integer-like TZID (test_with_int_tzid.ics)', () => {
      const data = ical.parseFile('./test/test_with_int_tzid.ics');
      const event = Object.values(data)[0];
      assert.equal(event.summary, 'test export import');
    });
  });

  // Germany_at_end_of_day_repeating.ics – moved recurrence across DST
  describe('DST and recurrence edge cases', () => {
    it('keeps end-of-day recurrence across DST (germany_at_end_of_day_repeating.ics)', () => {
      const data = ical.parseFile('./test/germany_at_end_of_day_repeating.ics');
      const event = Object.values(data).find(x => x.uid === '2m6mt1p89l2anl74915ur3hsgm@google.com');
      assert.equal(event.start.toDateString(), new Date(2024, 9, 22, 23, 0, 0).toDateString());
    });

    // Whole_day_moved_over_dst_change_berlin.ics – recurrence shift over DST
    it('keeps whole-day recurrence across DST (whole_day_moved_over_dst_change_berlin.ics)', () => {
      const data = ical.parseFile('./test/whole_day_moved_over_dst_change_berlin.ics');
      const moved = Object.values(data).find(x => x.uid === '14nv8jl8d6dvdbl477lod4fftf@google.com');
      assert.ok(moved && moved.recurrences, 'Missing recurrence map');
      // Find the expected recurrence by local calendar date rather than by map key
      const rec = Object.values(moved.recurrences).find(r => r.start.toDateString() === new Date(2024, 9, 30).toDateString());
      assert.ok(rec, 'Expected a recurrence on local 2024-10-30');
      assert.equal(rec.datetype, 'date');

      // If a timezone is exposed on the recurrence dates, also ensure local midnight boundaries and one-day span
      const zone2 = (rec.start && rec.start.tz) || (rec.end && rec.end.tz);
      if (zone2 && rec.end) {
        const startLocalYMD = rec.start.toLocaleString('sv-SE', {timeZone: zone2}).slice(0, 10);
        const endLocalYMD = rec.end.toLocaleString('sv-SE', {timeZone: zone2}).slice(0, 10);
        const [sy, sm, sd] = startLocalYMD.split('-').map(Number);
        const [ey, em, ed] = endLocalYMD.split('-').map(Number);
        const startLocalMid = new Date(Date.UTC(sy, sm - 1, sd));
        const endLocalMid = new Date(Date.UTC(ey, em - 1, ed));
        const diffDays = Math.round((endLocalMid - startLocalMid) / 86_400_000);
        assert.equal(diffDays, 1);
      }
    });
  });
});
