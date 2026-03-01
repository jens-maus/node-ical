const assert = require('node:assert/strict');
const {describe, it, before} = require('mocha');
const tz = require('../tz-utils.js');
const ical = require('../node-ical.js');

// Map 'Etc/Unknown' TZID used in fixtures to a concrete zone
tz.linkAlias('Etc/Unknown', 'Etc/GMT');

// Tests 12–14 cover recurrence overrides, EXDATE handling, and ordering edge cases after the timezone refactor.
describe('parser: advanced cases', () => {
  // Recurrence and exceptions remain intact with Intl-backed date parsing
  describe('Recurrence and exceptions', () => {
    let biweeklyData;
    before(() => {
      biweeklyData = ical.parseFile('./test/fixtures/biweekly-exdate-until.ics');
    });

    it('handles RRULE + EXDATEs + RECURRENCE-ID override (daily-count-exdate-recurrence-id.ics)', function () {
      // Windows CI occasionally takes longer to initialise Intl time zone data on Node 20.
      // Give this parsing-heavy regression test extra breathing room to avoid spurious timeouts.
      this.timeout(20_000);
      const data = ical.parseFile('./test/fixtures/daily-count-exdate-recurrence-id.ics');
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

      // Dual-key RECURRENCE-ID: DATE-TIME values should be accessible by both date-only and full ISO keys
      const recurrenceDate = new Date(Date.UTC(2015, 6, 7, 19, 0, 0));
      const dateOnlyKey = recurrenceDate.toISOString().slice(0, 10);
      const fullIsoKey = recurrenceDate.toISOString();
      assert.strictEqual(event.recurrences[dateOnlyKey], event.recurrences[fullIsoKey], 'DATE-TIME RECURRENCE-ID should be accessible by both date-only and full ISO keys');
    });

    // Google-calendar-kiev-tz.ics – RECURRENCE-ID appears before RRULE and must still bind correctly
    it('handles RECURRENCE-ID before RRULE (google-calendar-kiev-tz.ics)', () => {
      const data = ical.parseFile('./test/fixtures/google-calendar-kiev-tz.ics');
      const event = Object.values(data).find(x => x.uid === '6m2q7kb2l02798oagemrcgm6pk@google.com' && x.summary === 'repeated');
      assert.ok(event.rrule);
      assert.equal(event.summary, 'repeated');
      const key = new Date(Date.UTC(2016, 7, 26, 11, 0, 0)).toISOString().slice(0, 10);
      assert.ok(event.recurrences[key]);
      assert.equal(event.recurrences[key].summary, 'bla bla');

      // Dual-key RECURRENCE-ID: DATE-TIME values should be accessible by both date-only and full ISO keys
      const recurrenceDate = new Date(Date.UTC(2016, 7, 26, 11, 0, 0));
      const dateOnlyKey = recurrenceDate.toISOString().slice(0, 10);
      const fullIsoKey = recurrenceDate.toISOString();
      assert.strictEqual(event.recurrences[dateOnlyKey], event.recurrences[fullIsoKey], 'DATE-TIME RECURRENCE-ID should be accessible by both date-only and full ISO keys');
    });

    // RECURRENCE-ID with SEQUENCE: newer versions should win over older ones (RFC 5545)
    it('applies SEQUENCE logic to RECURRENCE-ID overrides', () => {
      const data = ical.parseFile('./test/fixtures/recurrence-sequence.ics');
      const event = data['sequence-test@node-ical.test'];

      assert.ok(event, 'Event should exist');
      assert.ok(event.recurrences, 'Should have recurrences');

      // Test case 1: SEQUENCE 3 appears first, then SEQUENCE 1
      // The higher SEQUENCE (3) should be kept, SEQUENCE 1 should be ignored
      const key1 = '2024-01-02';
      assert.ok(event.recurrences[key1], 'Recurrence for 2024-01-02 should exist');
      assert.equal(event.recurrences[key1].summary, 'Moved to afternoon (SEQUENCE 3)', 'Higher SEQUENCE should be kept');
      assert.strictEqual(event.recurrences[key1].sequence, 3, 'SEQUENCE should be number 3');

      // Test case 2: SEQUENCE 2 appears first, then SEQUENCE 5
      // The higher SEQUENCE (5) should win
      const key2 = '2024-01-03';
      assert.ok(event.recurrences[key2], 'Recurrence for 2024-01-03 should exist');
      assert.equal(event.recurrences[key2].summary, 'Newer override (SEQUENCE 5) - should win', 'Higher SEQUENCE should replace lower');
      assert.strictEqual(event.recurrences[key2].sequence, 5, 'SEQUENCE should be number 5');

      // Test case 3: Multiple overrides on same day with different times
      // Both should exist independently (dual-key: ISO and date-only)
      const isoKey1 = '2024-01-04T09:00:00.000Z';
      const isoKey2 = '2024-01-04T15:00:00.000Z';
      assert.ok(event.recurrences[isoKey1], 'Morning override should exist with ISO key');
      assert.equal(event.recurrences[isoKey1].summary, 'Morning slot (SEQUENCE 2)', 'Morning override should be correct');
      assert.ok(event.recurrences[isoKey2], 'Afternoon override should exist with ISO key');
      assert.equal(event.recurrences[isoKey2].summary, 'Afternoon slot (SEQUENCE 4) - different time same day', 'Afternoon override should be correct');

      // Both should also be accessible via date-only key (dual-key strategy)
      // Note: With multiple overrides per day, date-only key points to the last one stored
      const dateKey = '2024-01-04';
      assert.ok(event.recurrences[dateKey], 'Date-only key should exist for 2024-01-04');
    });

    // Duplicate UIDs without RECURRENCE-ID: SEQUENCE determines which version wins
    it('applies SEQUENCE logic to duplicate UIDs without RECURRENCE-ID', () => {
      const data = ical.parseFile('./test/fixtures/duplicate-uid-sequence.ics');

      // Test case 1: SEQUENCE 2 appears first, then SEQUENCE 0
      // The higher SEQUENCE (2) should be kept
      const event1 = data['duplicate-sequence-test@node-ical.test'];
      assert.ok(event1, 'Event should exist');
      assert.equal(event1.summary, 'Team Meeting (SEQUENCE 2)', 'Higher SEQUENCE should be kept');
      assert.strictEqual(event1.sequence, 2, 'SEQUENCE should be 2');
      assert.equal(event1.start.getUTCHours(), 10, 'Start time should be 10:00 (from SEQUENCE 2)');

      // Test case 2: SEQUENCE 1 appears first, then SEQUENCE 3
      // The higher SEQUENCE (3) should win
      const event2 = data['newer-wins-test@node-ical.test'];
      assert.ok(event2, 'Event should exist');
      assert.equal(event2.summary, 'Updated version (SEQUENCE 3) - should win', 'Higher SEQUENCE should replace lower');
      assert.strictEqual(event2.sequence, 3, 'SEQUENCE should be 3');
      assert.equal(event2.start.getUTCHours(), 14, 'Start time should be 14:00 (from SEQUENCE 3)');
    });

    // Issue #450: RECURRENCE-ID with higher SEQUENCE appearing before base series with lower SEQUENCE
    // The base series (RRULE) should still be accepted even though it has lower SEQUENCE
    it('accepts base series (RRULE) even when RECURRENCE-ID with higher SEQUENCE comes first (issue #450)', () => {
      const data = ical.parseFile('./test/fixtures/google-recurrence-order.ics');
      const event = data['aaaaaaaaaa888se1rr0b24sm4p@google.com'];

      assert.ok(event, 'Event should exist');
      assert.ok(event.rrule, 'Base series should have RRULE');
      assert.equal(event.summary, 'TEST RECURR 3', 'Base series summary should be preserved');
      assert.strictEqual(event.sequence, 0, 'Base series should have SEQUENCE 0');

      // The modified occurrence should be in recurrences array
      assert.ok(event.recurrences, 'Should have recurrences array');
      const recurrenceKeys = Object.keys(event.recurrences);
      assert.ok(recurrenceKeys.length > 0, 'Should have at least one recurrence override');

      // Find the modified occurrence
      const modifiedOccurrence = Object.values(event.recurrences).find(r => r.summary === 'TEST RECURR 3 - MODIFIED');
      assert.ok(modifiedOccurrence, 'Modified occurrence should exist in recurrences');
      assert.strictEqual(modifiedOccurrence.sequence, 1, 'Modified occurrence should have SEQUENCE 1');
    });

    // Duplicate UIDs with RRULE: SEQUENCE logic should apply to recurring events too
    it('applies SEQUENCE logic to duplicate RRULE events', () => {
      const data = ical.parseFile('./test/fixtures/duplicate-rrule-sequence.ics');
      const event = data['rrule-sequence-test@node-ical.test'];

      assert.ok(event, 'Event should exist');
      assert.ok(event.rrule, 'Event should have RRULE');
      assert.equal(event.summary, 'Daily Meeting (SEQUENCE 2)', 'Higher SEQUENCE should be kept');
      assert.strictEqual(event.sequence, 2, 'SEQUENCE should be 2');
      assert.equal(event.start.getUTCHours(), 10, 'Start time should be 10:00 (from SEQUENCE 2)');

      // Lower SEQUENCE version should be ignored
      assert.notEqual(event.start.getUTCHours(), 14, 'Start time should not be 14:00 (from lower SEQUENCE)');
    });

    // Biweekly-exdate-until.ics – comma-separated EXDATEs plus EXDATEs with malformed times stay resilient
    it('parses comma-separated EXDATEs (biweekly-exdate-until.ics)', () => {
      const event = Object.values(biweeklyData).find(x => x.uid === '98765432-ABCD-DCBB-999A-987765432123');
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

    it('tolerates EXDATEs with bad times (biweekly-exdate-until.ics)', () => {
      const event = Object.values(biweeklyData).find(x => x.uid === '1234567-ABCD-ABCD-ABCD-123456789012');
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

    it('exdate is a plain object, not an array (biweekly-exdate-until.ics)', () => {
      const event = Object.values(biweeklyData).find(x => x.uid === '98765432-ABCD-DCBB-999A-987765432123');
      assert.ok(event.exdate);

      // Should be a plain object, not an array
      assert.equal(typeof event.exdate, 'object');
      assert.equal(Array.isArray(event.exdate), false);

      // Should have both date-only keys and full ISO keys (dual-key approach)
      // 4 DATE-TIME entries × 2 keys each = 8 total keys
      const keys = Object.keys(event.exdate);
      assert.equal(keys.length, 8);

      // Verify dual-key structure programmatically by deriving from actual parsed data
      // Expected date-only keys based on test data (EXDATE;TZID=US/Central:20170706T090000,...)
      const expectedDateOnlyKeys = ['2017-07-06', '2017-07-17', '2017-07-20', '2017-08-03'];

      for (const dateOnlyKey of expectedDateOnlyKeys) {
        const actualDateObject = event.exdate[dateOnlyKey];

        assert.ok(actualDateObject, `Date-only key ${dateOnlyKey} should exist`);
        assert.ok(actualDateObject instanceof Date, `${dateOnlyKey} should be a Date object`);

        // Derive the full ISO key from the actual stored Date
        const fullIsoKey = actualDateObject.toISOString();
        assert.ok(event.exdate[fullIsoKey], `Full ISO key ${fullIsoKey} should exist`);

        // Both keys should reference the same Date instance (no memory overhead)
        assert.strictEqual(
          event.exdate[dateOnlyKey],
          event.exdate[fullIsoKey],
          `Both keys for ${dateOnlyKey} should reference the same Date object`,
        );
      }

      // Should be serializable with JSON.stringify
      const serialized = JSON.stringify(event.exdate);
      assert.ok(serialized.includes('2017-07-06'));
      assert.ok(serialized.includes('2017-07-17'));
      assert.notEqual(serialized, '[]'); // Should not be an empty array

      // Should work with Object.values()
      const values = Object.values(event.exdate);
      assert.equal(values.length, 8);
      for (const value of values) {
        assert.ok(value instanceof Date);
      }
    });

    // Regression test for issue #167: "Exdate showing blank array when EXDATE parameters exist"
    // https://github.com/jens-maus/node-ical/issues/167
    it('exdate is not shown as blank/empty array (regression for #167)', () => {
      const event = Object.values(biweeklyData).find(x => x.uid === '98765432-ABCD-DCBB-999A-987765432123');

      // The bug was: JSON.stringify showed [] even though data existed
      const stringified = JSON.stringify(event.exdate);
      assert.notEqual(stringified, '[]', 'exdate should not stringify to empty array');

      // The bug was: .length was 0 even though dates existed
      // With the fix, we use Object.keys().length
      // We have 8 keys (4 date-only + 4 full ISO) due to dual-key approach
      assert.equal(Object.keys(event.exdate).length, 8, 'should have 8 keys (4 dates × 2 keys each)');

      // Verify the workaround from the issue (Object.values) returns correct data
      const exdateArray = Object.values(event.exdate);
      assert.equal(exdateArray.length, 8, 'Object.values should return 8 date references');

      // Verify shared reference (same as main test)
      assert.strictEqual(
        event.exdate['2017-07-06'],
        event.exdate['2017-07-06T14:00:00.000Z'],
        'Both keys should reference the same Date object',
      );
    });

    // Regression test for issue #360: "Recurring events with exclusions are not handled"
    // https://github.com/jens-maus/node-ical/issues/360
    it('recurring events with EXDATE exclusions are properly parsed (regression for #360)', () => {
      const event = Object.values(biweeklyData).find(x => x.uid === '98765432-ABCD-DCBB-999A-987765432123');

      // The bug was: parseIcs ignored exceptions and created exdate: []
      assert.ok(event.exdate, 'exdate should exist');
      assert.notEqual(Object.keys(event.exdate).length, 0, 'exdate should not be empty');

      // Verify lookup pattern from issue comments works: event.exdate[dateKey]
      const dateLookupKey = '2017-07-06';
      assert.ok(event.exdate[dateLookupKey], 'Lookup pattern event.exdate[dateKey] should work');
      assert.ok(event.exdate[dateLookupKey] instanceof Date, 'Lookup should return Date object');
    });
  });

  // Exchange-custom-tz.ics – Microsoft Exchange timezone naming
  // Moved under the consolidated 'Microsoft time zones' section below to reduce nesting.

  // windows-quoted-tz-rrule.ics – quoted parameter values survive the parameter parser rewrite
  describe('Metadata and parsing robustness', () => {
    it('parses quoted parameter values (windows-quoted-tz-rrule.ics)', () => {
      const data = ical.parseFile('./test/fixtures/windows-quoted-tz-rrule.ics');
      const event = Object.values(data)[0];
      assert.ok(event.start.tz);
    });

    // Sabredav-school-holidays.ics – start/end should surface as Date objects, not serialized strings
    it('produces Date objects (non-strings) (sabredav-school-holidays.ics)', () => {
      const data = ical.parseFile('./test/fixtures/sabredav-school-holidays.ics');
      const event = Object.values(data)[0];
      assert.notEqual(typeof event.start, 'string');
      assert.notEqual(typeof event.end, 'string');
    });
  });

  // Mixed-timezone-handling.ics – timezone detection scenarios exercise resolveTZID fallbacks
  describe('Timezone detection', () => {
    it('infers/retains timezone per event (mixed-timezone-handling.ics)', () => {
      const data = ical.parseFile('./test/fixtures/mixed-timezone-handling.ics');
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

    // Synthetic TZID with minute offset should resolve to a canonical IANA zone via Intl hints
    it('parses TZID with minute offset (synthetic)', () => {
      const offsetLabel = '"(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi"';
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:offset-minutes
DTSTART;TZID=${offsetLabel}:20260325T000000
RRULE:FREQ=DAILY;COUNT=2
SUMMARY:Offset example
END:VEVENT
END:VCALENDAR`;

      const data = ical.parseICS(ics);
      const event = Object.values(data).find(x => x.uid === 'offset-minutes');
      assert.ok(event, 'Expected to find the synthetic event by UID');

      const {start, rrule} = event;
      assert.equal(start.toISOString(), '2026-03-24T18:30:00.000Z');
      assert.equal(start.tz, 'Asia/Calcutta');

      assert.ok(rrule, 'Expected the RRULE to be parsed');
      assert.equal(rrule.options.count, 2);
      assert.equal(rrule.options.tzid, 'Asia/Calcutta');
    });
  });

  // Event-organizer-cn.ics – organizer params must propagate untouched
  describe('Organizer and status', () => {
    it('preserves organizer params (event-organizer-cn.ics)', () => {
      const data = ical.parseFile('./test/fixtures/event-organizer-cn.ics');
      const event = Object.values(data)[0];
      assert.equal(event.organizer.params.CN, 'stomlinson@mozilla.com');
      assert.equal(event.organizer.val, 'mailto:stomlinson@mozilla.com');
    });

    // Tentative-apple-calendar.ics – VEVENT status values remain intact across parsing
    it('parses VEVENT status values (tentative-apple-calendar.ics)', () => {
      const data = ical.parseFile('./test/fixtures/tentative-apple-calendar.ics');
      const getByUid = uid => Object.values(data).find(x => x.uid === uid);
      assert.equal(getByUid('31a1ffc9-9b76-465b-ae4a-cadb694c9d37').status, 'TENTATIVE');
      assert.equal(getByUid('F00F3710-BF4D-46D3-9A2C-1037AB24C6AC').status, 'CONFIRMED');
      assert.equal(getByUid('8CAB46C5-669F-4249-B1AD-52BFA72F4E0A').status, 'CANCELLED');
      assert.equal(getByUid('99F615DE-82C6-4CEF-97B8-CD0D3E1EE0D3').status, undefined);
    });
  });

  // Dst-transition-rules.ics – VTIMEZONE entries apply to floating DTSTART values with Intl helpers
  describe('Floating DTSTART with VTIMEZONE', () => {
    it('applies VTIMEZONE to floating DTSTART (dst-transition-rules.ics)', () => {
      const data = ical.parseFile('./test/fixtures/dst-transition-rules.ics');
      const event = Object.values(data).find(x => x.uid === 'f683404f-aede-43eb-8774-27f62bb27c92');
      assert.equal(event.start.toJSON(), '2022-10-09T08:00:00.000Z');
      assert.equal(event.end.toJSON(), '2022-10-09T09:00:00.000Z');
    });
  });

  // Attendee-with-url.ics – quoted attendee parameters + X-RESPONSE-COMMENT retain metadata
  describe('Attendee params', () => {
    it('parses attendee params incl. X-RESPONSE-COMMENT (attendee-with-url.ics)', () => {
      const data = ical.parseFile('./test/fixtures/attendee-with-url.ics');
      const event = Object.values(data)[0];
      assert.equal(event.attendee.params['X-RESPONSE-COMMENT'], 'Test link: https://example.com/test');
      assert.equal(event.attendee.params.CUTYPE, 'INDIVIDUAL');
      assert.equal(event.attendee.val, 'mailto:test@example.com');
    });
  });

  // Yearly-party.ics – RRULE with timezone DTSTART carries tzid through rrule options
  describe('RRULE with timezone DTSTART', () => {
    it('handles RRULE with timezone DTSTART (yearly-party.ics)', () => {
      const data = ical.parseFile('./test/fixtures/yearly-party.ics');
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

    it('produces valid RRULE string with proper DTSTART;TZID format', () => {
      // Regression test: when building the RRULE string internally, node-ical must
      // filter out orphaned segments (like TZID=...) that result from splitting
      // DTSTART;TZID=... on semicolons. The output should have clean RFC5545 format.
      const data = ical.parseFile('./test/fixtures/yearly-party.ics');
      const first = Object.values(data).find(x => x.uid === '000021a');

      // RRULE must be successfully parsed (would fail if string was malformed)
      assert.ok(first.rrule, 'RRULE should be parsed');
      assert.ok(first.rrule.options.tzid, 'RRULE should have timezone');

      // String representation should follow RFC5545 format
      const rruleString = first.rrule.toString();
      assert.ok(/DTSTART;TZID=/.test(rruleString), 'DTSTART should include TZID parameter');
      assert.ok(!/RRULE:.*TZID=/.test(rruleString), 'RRULE line should not contain TZID');
    });
  });

  // Ms_timezones.ics – Microsoft Windows zone mapping and custom tz handling flow through tz-utils
  describe('Microsoft time zones', () => {
    it('maps Exchange tz to IANA (exchange-custom-tz.ics)', () => {
      const data = ical.parseFile('./test/fixtures/exchange-custom-tz.ics');
      const event = Object.values(data).find(x => x.uid === '040000008200E00074C5B7101A82E00800000000C9AB6E5A6AFED401000000000000000010000000C55132227F0F0948A7D58F6190A3AEF9');
      assert.equal(event.start.tz, 'Asia/Bangkok');
      assert.equal(event.end.tz, 'Asia/Bangkok');
    });
    describe('Windows mapping and custom tz', () => {
      let officeData;
      before(() => {
        officeData = ical.parseFile('./test/fixtures/Office-2012-owa.ics');
      });

      it('maps Windows zones to times (ms_timezones.ics)', () => {
        const data = ical.parseFile('./test/fixtures/ms_timezones.ics');
        const event = Object.values(data).find(x => x.summary === 'Log Yesterday\'s Jira time');
        assert.strictEqual(event.start.getUTCFullYear(), 2020);
        assert.strictEqual(event.start.getUTCMonth(), 5);
        assert.strictEqual(event.start.getUTCHours(), 7);
        assert.strictEqual(event.end.getUTCMinutes(), 30);
      });

      // Bad_ms_tz.ics – unexpected ms timezone (should not use Customized Time Zone)
      it('ignores "Customized Time Zone" (bad_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/fixtures/bad_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '[private]');
        assert.notEqual(event.start.tz, 'Customized Time Zone');
      });

      it('rejects invalid custom tz (bad_custom_ms_tz2.ics)', () => {
        const data = ical.parseFile('./test/fixtures/bad_custom_ms_tz2.ics');
        const event = Object.values(data).find(x => x.summary === '[private]');
        assert.notEqual(event.start.tz, 'Customized Time Zone 1');
      });

      it('applies old MS tz before DST (Office-2012-owa.ics)', () => {
        const event = Object.values(officeData).find(x => x.summary === ' TEST');
        assert.equal(event.end.toISOString().slice(0, 10), new Date(Date.UTC(2020, 9, 28, 15, 0, 0)).toISOString().slice(0, 10));
      });

      it('applies old MS tz after DST (Office-2012-owa.ics)', () => {
        const event = Object.values(officeData).find(x => x.summary === ' TEST 3');
        assert.equal(event.end.toISOString().slice(0, 10), new Date(Date.UTC(2020, 10, 2, 20, 0, 0)).toISOString().slice(0, 10));
      });

      it('handles custom tz recurrence (bad_custom_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/fixtures/bad_custom_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '[private]');
        assert.equal(event.start.toISOString().slice(0, 10), new Date(Date.UTC(2021, 2, 25, 10, 35, 0)).toISOString().slice(0, 10));
      });

      it('uses start as end when missing (bad_custom_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/fixtures/bad_custom_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '*masked-away*');
        assert.equal(event.end.toISOString().slice(0, 10), event.start.toISOString().slice(0, 10));
      });

      it('handles negative duration (bad_custom_ms_tz.ics)', () => {
        const data = ical.parseFile('./test/fixtures/bad_custom_ms_tz.ics');
        const event = Object.values(data).find(x => x.summary === '*masked-away2*');
        assert.equal(event.end.toISOString().slice(0, 10), new Date(Date.UTC(2021, 2, 23, 21, 56, 56)).toISOString().slice(0, 10));
      });
    });
  });

  // BadRRULE.ics – invalid date still keeps time portion
  describe('Invalid RRULE handling', () => {
    it('retains start time on invalid RRULE date (badRRULE.ics)', () => {
      const data = ical.parseFile('./test/fixtures/badRRULE.ics');
      const event = Object.values(data).find(x => x.summary === 'Academic Time');
      assert.equal(event.start.toISOString().slice(11), '15:50:00.000Z');
    });
  });

  // Test_with_forward_TZ.ics – full day forward of UTC
  describe('Forward TZ behavior', () => {
    it('preserves midnight in forward TZ (test_with_forward_TZ.ics)', () => {
      const data = ical.parseFile('./test/fixtures/test_with_forward_TZ.ics');
      const event = Object.values(data).find(x => x.summary === 'Fear TWD');
      assert.equal(event.datetype, 'date');
      // Date-only event must preserve its calendar-day boundaries
      assert.equal(event.start.toDateString(), new Date(2020, 9, 17).toDateString());
      assert.equal(event.end.toDateString(), new Date(2020, 9, 18).toDateString());

      // If a timezone is exposed, also ensure both boundaries are local midnight and exactly one local day apart
      const zone = (event.start && event.start.tz) || (event.end && event.end.tz);
      if (zone) {
        const startLocalYMD = event.start.toLocaleDateString('sv-SE', {timeZone: zone});
        const endLocalYMD = event.end.toLocaleDateString('sv-SE', {timeZone: zone});
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
      const data = ical.parseFile('./test/fixtures/test_with_tz_list.ics');
      const event = Object.values(data).find(x => x.uid === 'E689AEB8C02C4E2CADD8C7D3D303CEAD0');
      assert.equal(event.start.tz, 'Europe/Berlin');
    });

    // Test_with_multiple_tzids_in_vtimezone.ics – select correct tz across multiple components
    it('chooses correct tz across components (test_with_multiple_tzids_in_vtimezone.ics)', () => {
      const data = ical.parseFile('./test/fixtures/test_with_multiple_tzids_in_vtimezone.ics');
      const event = Object.values(data).find(x => x.uid === '1891-1709856000-1709942399@www.washougal.k12.wa.us');
      assert.equal(event.start.toJSON(), '2024-06-27T07:00:00.000Z');
      assert.equal(event.end.toJSON(), '2024-06-28T06:00:00.000Z');
    });
  });

  // Test_date_time_duration.ics – duration with date-time DTSTART
  describe('Durations', () => {
    it('applies DURATION to datetime DTSTART (test_date_time_duration.ics)', () => {
      const data = ical.parseFile('./test/fixtures/test_date_time_duration.ics');
      const event = Object.values(data).find(x => x.summary === 'period test2');
      assert.equal(event.start.toJSON(), '2024-02-15T09:00:00.000Z');
      assert.equal(event.end.toJSON(), '2024-02-15T10:15:00.000Z');
    });

    // Test_date_duration.ics – duration with date DTSTART
    it('applies DURATION to date DTSTART (test_date_duration.ics)', () => {
      const data = ical.parseFile('./test/fixtures/test_date_duration.ics');
      const event = Object.values(data).find(x => x.summary === 'period test2');
      assert.equal(event.start.toDateString(), new Date(2024, 1, 15).toDateString());
      assert.equal(event.end.toDateString(), new Date(2024, 1, 22).toDateString());
    });

    // Test parameterized DURATION (shape-safety)
    it('handles parameterized DURATION values', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:parameterized-duration-test
DTSTART:20250101T120000Z
DURATION;X-CUSTOM=foo:P1D
SUMMARY:Test Parameterized Duration
END:VEVENT
END:VCALENDAR`;

      const data = ical.parseICS(ics);
      const event = Object.values(data).find(x => x.type === 'VEVENT');

      assert.ok(event, 'Event should be parsed');
      assert.ok(event.start instanceof Date, 'Start should be a Date');
      assert.ok(event.end instanceof Date, 'End should be a Date');

      // Should add 1 day despite having parameters
      const expectedEnd = new Date(event.start.getTime() + (24 * 60 * 60 * 1000));
      assert.equal(event.end.toISOString(), expectedEnd.toISOString());
    });

    // Issue #381 – empty DURATION:P should not crash
    it('handles empty duration DURATION:P gracefully (issue #381)', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:empty-duration-test
DTSTART:20250706T160000Z
DURATION:P
SUMMARY:Travels
STATUS:CONFIRMED
DTSTAMP:20250525T092115Z
END:VEVENT
END:VCALENDAR`;

      // Ideal behavior: Parser should NOT crash or throw for malformed DURATION
      // Instead: treat empty/invalid duration as zero duration (end = start)
      // This follows Postel's Law: "be liberal in what you accept"

      // Stub console.warn to keep test output clean
      const originalWarn = console.warn;
      console.warn = () => {};

      const data = ical.parseICS(ics);
      const event = Object.values(data).find(x => x.type === 'VEVENT');

      assert.ok(event, 'Event should be parsed despite invalid DURATION:P');
      assert.equal(event.summary, 'Travels');
      assert.ok(event.start instanceof Date, 'Start should be a Date');
      assert.ok(event.end instanceof Date, 'End should be a Date');

      // Invalid/empty duration should be treated as zero duration
      assert.equal(
        event.end.toISOString(),
        event.start.toISOString(),
        'End should equal start for invalid DURATION:P (zero duration)',
      );

      // Restore console.warn
      console.warn = originalWarn;
    });

    // Additional test: Multiple invalid duration formats should be handled
    it('handles various malformed DURATION values gracefully', () => {
      // Stub console.warn to keep test output clean
      const originalWarn = console.warn;
      console.warn = () => {};

      const testCases = [
        // Malformed / invalid durations → should be treated as zero duration
        {duration: 'P', summary: 'Empty P', expected: 'zero'},
        {duration: 'PT', summary: 'Empty PT', expected: 'zero'},
        {duration: 'INVALID', summary: 'Invalid text', expected: 'zero'},
        {duration: '', summary: 'Empty string', expected: 'zero'},
        // Valid durations
        {duration: 'PT0S', summary: 'Zero duration', expected: 'zero'}, // Valid zero
        {duration: 'P0D', summary: 'Zero days', expected: 'zero'}, // Valid zero (days)
        {duration: 'P1D', summary: 'One day', expected: 'oneday'}, // Valid one day
        {duration: '-P1D', summary: 'Negative one day', expected: 'negoneday'}, // Negative duration
        {duration: 'PT1H30M', summary: 'One hour thirty minutes', expected: '1h30m'}, // Combined
        {duration: 'P1DT2H', summary: 'One day two hours', expected: '1d2h'}, // Day + hours
      ];

      for (const [i, testCase] of testCases.entries()) {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:malformed-${i}
DTSTART:20250706T160000Z
DURATION:${testCase.duration}
SUMMARY:${testCase.summary}
END:VEVENT
END:VCALENDAR`;

        // All durations should parse without throwing
        const data = ical.parseICS(ics);
        const event = Object.values(data).find(x => x.type === 'VEVENT');

        assert.ok(event, `Event should be parsed for DURATION:${testCase.duration}`);
        assert.ok(event.start instanceof Date, 'Start should be a Date');
        assert.ok(event.end instanceof Date, 'End should be a Date');

        switch (testCase.expected) {
          case 'zero': {
            // Invalid or zero durations: end should equal start
            assert.equal(
              event.end.toISOString(),
              event.start.toISOString(),
              `DURATION:${testCase.duration} should result in zero duration (end = start)`,
            );
            break;
          }

          case 'oneday': {
            // P1D should add 1 day
            const expectedEnd = new Date(event.start.getTime() + (24 * 60 * 60 * 1000));
            assert.equal(
              event.end.toISOString(),
              expectedEnd.toISOString(),
              `DURATION:${testCase.duration} should add 1 day`,
            );
            break;
          }

          case 'negoneday': {
            // -P1D should subtract 1 day
            const expectedEnd = new Date(event.start.getTime() - (24 * 60 * 60 * 1000));
            assert.equal(
              event.end.toISOString(),
              expectedEnd.toISOString(),
              `DURATION:${testCase.duration} should subtract 1 day`,
            );
            break;
          }

          case '1h30m': {
            // PT1H30M should add 1 hour 30 minutes
            const expectedEnd = new Date(event.start.getTime() + (90 * 60 * 1000));
            assert.equal(
              event.end.toISOString(),
              expectedEnd.toISOString(),
              `DURATION:${testCase.duration} should add 1h30m`,
            );
            break;
          }

          case '1d2h': {
            // P1DT2H should add 1 day + 2 hours
            const expectedEnd = new Date(event.start.getTime() + (26 * 60 * 60 * 1000));
            assert.equal(
              event.end.toISOString(),
              expectedEnd.toISOString(),
              `DURATION:${testCase.duration} should add 1 day + 2 hours`,
            );
            break;
          }

          default: {
            assert.fail(`Unexpected test case: ${testCase.expected}`);
          }
        }
      }

      // Restore console.warn
      console.warn = originalWarn;
    });
  });

  // Test_with_int_tzid.ics – integer-like tzid preserved
  describe('TZID preservation', () => {
    it('preserves integer-like TZID (test_with_int_tzid.ics)', () => {
      const data = ical.parseFile('./test/fixtures/test_with_int_tzid.ics');
      const event = Object.values(data)[0];
      assert.equal(event.summary, 'test export import');
    });
  });

  // Germany_at_end_of_day_repeating.ics – moved recurrence across DST
  describe('DST and recurrence edge cases', () => {
    it('keeps end-of-day recurrence across DST (germany_at_end_of_day_repeating.ics)', () => {
      const data = ical.parseFile('./test/fixtures/germany_at_end_of_day_repeating.ics');
      const event = Object.values(data).find(x => x.uid === '2m6mt1p89l2anl74915ur3hsgm@google.com');
      assert.equal(event.start.toDateString(), new Date(2024, 9, 22, 23, 0, 0).toDateString());
    });

    // Whole_day_moved_over_dst_change_berlin.ics – recurrence shift over DST
    it('keeps whole-day recurrence across DST (whole_day_moved_over_dst_change_berlin.ics)', () => {
      const data = ical.parseFile('./test/fixtures/whole_day_moved_over_dst_change_berlin.ics');
      const moved = Object.values(data).find(x => x.uid === '14nv8jl8d6dvdbl477lod4fftf@google.com');
      assert.ok(moved && moved.recurrences, 'Missing recurrence map');
      // Find the expected recurrence by local calendar date rather than by map key
      const rec = Object.values(moved.recurrences).find(r => r.start.toDateString() === new Date(2024, 9, 30).toDateString());
      assert.ok(rec, 'Expected a recurrence on local 2024-10-30');
      assert.equal(rec.datetype, 'date');

      // If a timezone is exposed on the recurrence dates, also ensure local midnight boundaries and one-day span
      const zone2 = (rec.start && rec.start.tz) || (rec.end && rec.end.tz);
      if (zone2 && rec.end) {
        const startLocalYMD = rec.start.toLocaleDateString('sv-SE', {timeZone: zone2});
        const endLocalYMD = rec.end.toLocaleDateString('sv-SE', {timeZone: zone2});
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
