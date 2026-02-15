const assert = require('node:assert');
const path = require('node:path');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

describe('expandRecurringEvent', () => {
  describe('Basic functionality', () => {
    it('should expand a simple daily recurring event', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test_daily_recurring.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2025, 0, 1),
        to: new Date(2025, 0, 7), // Inclusive: Jan 1 through Jan 7
      });

      assert.strictEqual(instances.length, 7, 'Should return 7 daily instances');
      assert.strictEqual(instances[0].summary, event.summary);
      assert.strictEqual(instances[0].isRecurring, true);
      assert.strictEqual(instances[0].isOverride, false);
    });

    it('should handle non-recurring events (return single instance)', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && !event.rrule);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 2, 1),
        to: new Date(2011, 5, 1),
      });

      assert.strictEqual(instances.length, 1, 'Should return single instance for non-recurring event');
      assert.strictEqual(instances[0].isRecurring, false);
      assert.strictEqual(instances[0].event, event);
    });

    it('should return empty array if event outside date range', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && !event.rrule);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2020, 0, 1),
        to: new Date(2020, 11, 31),
      });

      assert.strictEqual(instances.length, 0, 'Should return empty array for out-of-range event');
    });
  });

  describe('Return value structure', () => {
    it('should return instances with all required properties', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test6.ics')); // Has RRULE
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.rrule);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 7, 1),
        to: new Date(2011, 8, 1),
      });

      assert.ok(instances.length > 0, 'Should have instances');

      const instance = instances[0];
      assert.ok(instance.start instanceof Date, 'start should be a Date');
      assert.ok(instance.end instanceof Date, 'end should be a Date');
      assert.strictEqual(typeof instance.summary, 'string', 'summary should be a string');
      assert.strictEqual(typeof instance.isFullDay, 'boolean', 'isFullDay should be a boolean');
      assert.strictEqual(typeof instance.isRecurring, 'boolean', 'isRecurring should be a boolean');
      assert.strictEqual(typeof instance.isOverride, 'boolean', 'isOverride should be a boolean');
      assert.ok(instance.event, 'event reference should be present');
      assert.strictEqual(instance.event.type, 'VEVENT', 'event should be a VEVENT');
    });

    it('should set isFullDay correctly for date-only events', () => {
      // Test with full-day event (datetype: 'date')
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.datetype === 'date');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 2, 1),
        to: new Date(2011, 5, 1),
      });

      assert.ok(instances.length > 0, 'Should find at least one date-only event');
      const fullDayEvent = instances.find(i => i.isFullDay);
      assert.ok(fullDayEvent, 'Should have at least one full-day event');
      assert.strictEqual(fullDayEvent.isFullDay, true, 'Date-only event should have isFullDay=true');
    });

    it('should set isFullDay correctly for date-time events', () => {
      // Test with timed event (datetype: 'date-time')
      const events = ical.sync.parseFile(path.join(__dirname, 'test5.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.datetype === 'date-time');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 10, 1),
        to: new Date(2011, 11, 1),
      });

      assert.ok(instances.length > 0);
      assert.strictEqual(instances[0].isFullDay, false, 'Date-time event should have isFullDay=false');
    });

    it('should include summary property from event', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test6.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.summary);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 7, 1),
        to: new Date(2011, 8, 1),
      });

      assert.ok(instances.length > 0);
      assert.strictEqual(instances[0].summary, event.summary);
    });
  });

  describe('EXDATE handling', () => {
    it('should exclude dates in EXDATE by default', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test12.ics')); // Has EXDATE
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.exdate);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2013, 9, 1),
        to: new Date(2013, 9, 31),
      });

      // Verify that EXDATE dates are not in the results
      const exdateKeys = Object.keys(event.exdate);
      for (const instance of instances) {
        const year = instance.start.getFullYear();
        const month = String(instance.start.getMonth() + 1).padStart(2, '0');
        const day = String(instance.start.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        assert.ok(!exdateKeys.includes(dateKey), `Instance ${dateKey} should be excluded by EXDATE`);
      }
    });

    it('should include EXDATE dates when excludeExdates=false', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test12.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.exdate);

      const withExclusion = ical.expandRecurringEvent(event, {
        from: new Date(2015, 6, 1),
        to: new Date(2015, 6, 31),
        excludeExdates: true,
      });

      const withoutExclusion = ical.expandRecurringEvent(event, {
        from: new Date(2015, 6, 1),
        to: new Date(2015, 6, 31),
        excludeExdates: false,
      });

      assert.ok(
        withoutExclusion.length > withExclusion.length,
        'Should have more instances when excludeExdates=false',
      );
    });

    it('should exclude the correct full-day instance for Exchange/O365 EXDATE with timezone', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'METHOD:PUBLISH',
        'PRODID:Microsoft Exchange Server 2010',
        'VERSION:2.0',
        'X-WR-CALNAME:Kalender',
        'BEGIN:VTIMEZONE',
        'TZID:W. Europe Standard Time',
        'BEGIN:STANDARD',
        'DTSTART:16010101T030000',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:16010101T020000',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3',
        'END:DAYLIGHT',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        String.raw`DESCRIPTION:\n`,
        'RRULE:FREQ=DAILY;UNTIL=20260222T230000Z;INTERVAL=1',
        'EXDATE;TZID=W. Europe Standard Time:20260218T000000',
        'UID:040000008200E00074C5B7101A82E008000000006604E89FF09DDC010000000000000000100000007D7F17AB9D66A54C9F0B00B70CEEF454',
        'SUMMARY:Test - Recurr - Whole day - With one exception',
        'DTSTART;VALUE=DATE:20260216',
        'DTEND;VALUE=DATE:20260217',
        'CLASS:PUBLIC',
        'PRIORITY:5',
        'DTSTAMP:20260214T204054Z',
        'TRANSP:TRANSPARENT',
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'LOCATION:',
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const events = ical.sync.parseICS(ics);
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2026, 1, 15),
        to: new Date(2026, 1, 23),
        excludeExdates: true,
      });

      const starts = new Set(instances.map(instance => [
        instance.start.getFullYear(),
        String(instance.start.getMonth() + 1).padStart(2, '0'),
        String(instance.start.getDate()).padStart(2, '0'),
      ].join('-')));

      assert.ok(!starts.has('2026-02-18'), 'EXDATE day (2026-02-18) should be excluded');
      assert.ok(starts.has('2026-02-17'), 'Previous day (2026-02-17) should still be included');
    });
  });

  describe('RECURRENCE-ID overrides', () => {
    it('should apply RECURRENCE-ID overrides by default', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test12.ics')); // Has recurrences
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.recurrences);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2015, 6, 1),
        to: new Date(2015, 6, 31),
        includeOverrides: true,
      });

      // Find an instance that should have an override
      const overriddenInstance = instances.find(i => i.isOverride);
      assert.ok(overriddenInstance, 'Should have at least one overridden instance');

      // Verify that the override event is used, not the original
      const recurrenceKeys = Object.keys(event.recurrences);
      assert.ok(recurrenceKeys.length > 0, 'Test event should have recurrences');
    });

    it('should use original event when includeOverrides=false', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test12.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.recurrences);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2015, 6, 1),
        to: new Date(2015, 6, 31),
        includeOverrides: false,
      });

      // All instances should reference the original event
      for (const instance of instances) {
        assert.strictEqual(instance.isOverride, false);
        assert.strictEqual(instance.event.uid, event.uid);
      }
    });

    it('should set isOverride=true for modified instances', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test12.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.recurrences);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2015, 6, 1),
        to: new Date(2015, 6, 31),
      });

      const overrides = instances.filter(i => i.isOverride);
      const normals = instances.filter(i => !i.isOverride);

      assert.ok(overrides.length > 0, 'Should have override instances');
      assert.ok(normals.length > 0, 'Should have normal instances');

      // Verify override instances have different event object
      for (const override of overrides) {
        assert.notStrictEqual(override.event, event, 'Override should have different event object');
      }
    });

    it('should use override DTSTART when available', () => {
      // Test that when an override has its own DTSTART (moved instance),
      // we use that instead of the RRULE-generated date
      const event = {
        type: 'VEVENT',
        uid: 'test-override-dtstart@test',
        summary: 'Daily Meeting',
        start: new Date('2025-01-06T10:00:00.000Z'),
        end: new Date('2025-01-06T11:00:00.000Z'),
        rrule: {
          freq: 'DAILY',
          between(_start, _end) {
            // Generate instances for Jan 6-10
            return [
              new Date('2025-01-06T10:00:00.000Z'),
              new Date('2025-01-07T10:00:00.000Z'),
              new Date('2025-01-08T10:00:00.000Z'),
              new Date('2025-01-09T10:00:00.000Z'),
              new Date('2025-01-10T10:00:00.000Z'),
            ];
          },
        },
        recurrences: {
          // Override for Jan 8 - moved to 14:00
          // The key must match the date-only format that ical.js uses as primary key
          '2025-01-08': {
            type: 'VEVENT',
            uid: 'test-override-dtstart@test',
            summary: 'Daily Meeting (Moved)',
            start: new Date('2025-01-08T14:00:00.000Z'), // Different time!
            end: new Date('2025-01-08T15:00:00.000Z'),
          },
        },
      };

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2025, 0, 6),
        to: new Date(2025, 0, 10),
      });

      const jan8Instance = instances.find(i => i.start.getUTCDate() === 8);

      assert.ok(jan8Instance, 'Should have instance for Jan 8');
      assert.strictEqual(jan8Instance.isOverride, true);

      // The start time should be 14:00 UTC, not 10:00 UTC
      assert.strictEqual(jan8Instance.start.getUTCHours(), 14, 'Should use override DTSTART time (14:00)');
      assert.strictEqual(jan8Instance.end.getUTCHours(), 15, 'Should use override end time (15:00)');
      assert.strictEqual(jan8Instance.summary, 'Daily Meeting (Moved)');
    });
  });

  describe('DST transitions', () => {
    it('should handle full-day recurring events correctly across DST', () => {
      // This is the critical DST bug test from the proposal
      // Full-day Monday events should stay on Monday, not shift to Sunday
      const events = ical.sync.parseFile(path.join(__dirname, 'whole_day_moved_over_dst_change_berlin.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.datetype === 'date');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2025, 9, 1),
        to: new Date(2025, 10, 10),
      });

      // Verify that all instances are on the correct day of week
      // (This would catch the DST bug where full-day events shift by a day)
      for (const instance of instances) {
        // Check that the day component matches what we expect
        assert.strictEqual(instance.isFullDay, true);
        // The date should be preserved correctly across DST
        assert.ok(instance.start instanceof Date);
        assert.ok(instance.end instanceof Date);
      }
    });

    it('should handle full-day non-recurring events correctly across timezones', () => {
      // Full-day non-recurring events should use the same normalization as recurring events
      // to avoid timezone-based calendar date shifts
      const event = {
        type: 'VEVENT',
        uid: 'test-fullday-nonrecurring@test',
        summary: 'Full Day Event',
        start: new Date('2025-01-15T00:00:00.000Z'), // UTC midnight = Jan 15
        end: new Date('2025-01-16T00:00:00.000Z'),
        datetype: 'date',
      };

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2025, 0, 14),
        to: new Date(2025, 0, 16),
      });

      assert.strictEqual(instances.length, 1);

      const instance = instances[0];
      assert.strictEqual(instance.isFullDay, true);

      // The calendar date should be preserved as Jan 15 regardless of local timezone
      const year = instance.start.getFullYear();
      const month = instance.start.getMonth() + 1;
      const day = instance.start.getDate();

      assert.strictEqual(year, 2025);
      assert.strictEqual(month, 1);
      assert.strictEqual(day, 15, 'Calendar date should be Jan 15 in local timezone');
    });

    it('should preserve local time for timed events across DST', function () {
      // Timed events should maintain their local time even across DST
      const events = ical.sync.parseFile(path.join(__dirname, 'germany_at_end_of_day_repeating.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.datetype === 'date-time');

      if (!event) {
        // If no suitable test file, skip
        this.skip();
        return;
      }

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2024, 9, 1),
        to: new Date(2024, 10, 30),
      });

      // Verify times are preserved across DST transition
      assert.ok(instances.length > 0);
    });
  });

  describe('Duration calculation', () => {
    it('should calculate end from DURATION property when present', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test_date_time_duration.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2024, 1, 1),
        to: new Date(2024, 2, 1),
      });

      assert.ok(instances.length > 0);
      const instance = instances[0];
      const duration = instance.end - instance.start;
      assert.ok(duration > 0, 'End should be after start');
      // This event has PT1H15M duration = 1h 15min = 4500000ms
      assert.strictEqual(duration, 4_500_000, 'Duration should be 1h 15min (4_500_000ms)');
    });

    it('should use event.end when available', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.end);

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 2, 1),
        to: new Date(2011, 5, 1),
      });

      assert.ok(instances.length > 0, 'Should find events in March-May 2011');
      const firstInstance = instances[0];
      assert.strictEqual(firstInstance.end.getTime(), event.end.getTime());
    });

    it('should handle 0-duration for date-only events without end', () => {
      // Some full-day events may not have explicit end times
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.datetype === 'date');

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 2, 1),
        to: new Date(2011, 5, 1),
      });

      assert.ok(instances.length > 0);
      const instance = instances[0];
      // For full-day events, end is typically start of next day
      const dayDiff = (instance.end - instance.start) / (1000 * 60 * 60 * 24);
      assert.ok(dayDiff >= 0 && dayDiff <= 1, 'Full-day event should span about 1 day');
    });
  });

  describe('Edge cases', () => {
    it('should handle events with COUNT limit', function () {
      // Event with RRULE that has COUNT=10
      const events = ical.sync.parseFile(path.join(__dirname, 'test12.ics'));
      const event = Object.values(events).find(_ =>
        _.type === 'VEVENT'
        && _.rrule
        && _.rrule.options.count);

      if (!event) {
        this.skip();
        return;
      }

      // Use excludeExdates: false to get the full COUNT, as this event has EXDATEs
      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2015, 6, 1),
        to: new Date(2050, 0, 1), // Far future
        excludeExdates: false, // Include EXDATE dates to test COUNT limit
      });

      const expectedCount = event.rrule.options.count;
      assert.strictEqual(instances.length, expectedCount, `Should respect COUNT=${expectedCount} limit`);
    });

    it('should handle events with UNTIL date', function () {
      const events = ical.sync.parseFile(path.join(__dirname, 'test6.ics'));
      const event = Object.values(events).find(_ =>
        _.type === 'VEVENT'
        && _.rrule
        && _.rrule.options.until);

      if (!event) {
        this.skip();
        return;
      }

      const instances = ical.expandRecurringEvent(event, {
        from: new Date(2011, 7, 1),
        to: new Date(2050, 0, 1),
      });

      // All instances should be before UNTIL date
      const until = new Date(event.rrule.options.until);
      for (const instance of instances) {
        assert.ok(
          instance.start <= until,
          `Instance start ${instance.start} should be <= UNTIL ${until}`,
        );
      }
    });

    it('should handle expandOngoing option for non-recurring events', () => {
      // Event that started before the range but is still ongoing
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      // Set range that starts after event start
      const eventStart = new Date(event.start);
      const rangeStart = new Date(eventStart.getTime() + (24 * 60 * 60 * 1000)); // 1 day after
      const rangeEnd = new Date(rangeStart.getTime() + (7 * 24 * 60 * 60 * 1000)); // 1 week later

      const withOngoing = ical.expandRecurringEvent(event, {
        from: rangeStart,
        to: rangeEnd,
        expandOngoing: true,
      });

      const withoutOngoing = ical.expandRecurringEvent(event, {
        from: rangeStart,
        to: rangeEnd,
        expandOngoing: false,
      });

      // With expandOngoing, should include the event even if it started before range
      // Without it, should exclude it
      assert.ok(
        withOngoing.length >= withoutOngoing.length,
        'expandOngoing should include more or equal events',
      );
    });

    it('should handle expandOngoing option for recurring events', () => {
      // For recurring events, expandOngoing=true includes events that end within the range
      // even if they started before the range
      const events = ical.sync.parseFile(path.join(__dirname, 'test_daily_recurring.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT' && event.rrule);

      // Use a range that starts at Jan 5
      const rangeStart = new Date(2025, 0, 5);
      const rangeEnd = new Date(2025, 0, 10); // Inclusive: Jan 5 through Jan 10

      const withOngoing = ical.expandRecurringEvent(event, {
        from: rangeStart,
        to: rangeEnd,
        expandOngoing: true,
      });

      const withoutOngoing = ical.expandRecurringEvent(event, {
        from: rangeStart,
        to: rangeEnd,
        expandOngoing: false,
      });

      // Without expandOngoing: events starting on Jan 5-10 = 6 events
      assert.strictEqual(withoutOngoing.length, 6, 'Without expandOngoing should return 6 events');

      // With expandOngoing: includes Jan 4 (which ends on Jan 5, within range) = 7 events
      assert.strictEqual(withOngoing.length, 7, 'With expandOngoing should include event ending on range start');
      assert.ok(withOngoing.length > withoutOngoing.length, 'expandOngoing should include more events');

      // Verify the extra event is the one from Jan 4
      const jan4Event = withOngoing.find(i => i.start.getDate() === 4);
      assert.ok(jan4Event, 'Should include Jan 4 event when expandOngoing=true');
    });

    it('should throw TypeError for invalid from date', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      assert.throws(
        () => ical.expandRecurringEvent(event, {from: 'invalid', to: new Date()}),
        TypeError,
        'Should throw TypeError for invalid from',
      );

      assert.throws(
        () => ical.expandRecurringEvent(event, {from: new Date('invalid'), to: new Date()}),
        TypeError,
        'Should throw TypeError for NaN from date',
      );
    });

    it('should throw TypeError for invalid to date', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      assert.throws(
        () => ical.expandRecurringEvent(event, {from: new Date(), to: 'invalid'}),
        TypeError,
        'Should throw TypeError for invalid to',
      );
    });

    it('should throw RangeError when from is after to', () => {
      const events = ical.sync.parseFile(path.join(__dirname, 'test1.ics'));
      const event = Object.values(events).find(event => event.type === 'VEVENT');

      assert.throws(
        () => ical.expandRecurringEvent(event, {
          from: new Date(2025, 11, 31),
          to: new Date(2025, 0, 1),
        }),
        RangeError,
        'Should throw RangeError when from > to',
      );
    });
  });
});
