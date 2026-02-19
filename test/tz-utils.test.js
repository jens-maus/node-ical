const assert = require('node:assert/strict');
const process = require('node:process');
const {describe, it} = require('mocha');
const tz = require('../tz-utils.js');

describe('unit: tz-utils', () => {
  it('validates IANA zone names', () => {
    assert.equal(tz.isValidIana('Europe/Berlin'), true);
    assert.equal(tz.isValidIana('Not/AZone'), false);
  });

  it('parses local wall time with explicit offset', () => {
    const d = tz.parseWithOffset('20240101T120000', '+02:00');
    assert.equal(d.toISOString(), '2024-01-01T10:00:00.000Z');
  });

  it('throws on malformed offset strings', () => {
    assert.throws(() => tz.parseWithOffset('20240101T120000', 'bogus'), /Invalid offset string: bogus/);
  });

  it('parses local wall time within a named zone (standard time)', () => {
    // Europe/Berlin observes UTC+1 in January, so Intl-backed parsing should subtract one hour
    const d = tz.parseDateTimeInZone('20240101T120000', 'Europe/Berlin');
    assert.equal(d.toISOString(), '2024-01-01T11:00:00.000Z');
  });

  it('adds UTC-based durations without changing local semantics', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const plusOneDay = tz.utcAdd(start, 1, 'days');
    assert.equal(plusOneDay.toISOString(), '2024-01-02T00:00:00.000Z');
  });

  describe('DST transitions', () => {
    it('skips the missing hour during spring forward', () => {
      const berlin = 'Europe/Berlin';
      const localGap = '20240331T023000';
      const resolved = tz.parseDateTimeInZone(localGap, berlin);

      assert.ok(resolved instanceof Date);
      // 02:30 local never occurs on the DST start date, so we land on the next representable instant (03:30 local / 01:30Z)
      assert.equal(resolved.toISOString(), '2024-03-31T01:30:00.000Z');
      assert.equal(resolved.tz, berlin);
    });

    it('disambiguates the repeated hour during fall back', () => {
      const berlin = 'Europe/Berlin';
      const ambiguous = '20241027T023000';
      const resolved = tz.parseDateTimeInZone(ambiguous, berlin);

      assert.ok(resolved instanceof Date);
      // The first occurrence keeps the summer offset (UTC+2) so 02:30 local resolves to 01:30Z
      assert.equal(resolved.toISOString(), '2024-10-27T01:30:00.000Z');
      assert.equal(resolved.tz, berlin);
    });

    it('keeps UTC math consistent across the fall-back repetition', () => {
      const firstOccurrence = tz.parseWithOffset('20241027T023000', '+02:00');
      const secondOccurrence = tz.parseWithOffset('20241027T023000', '+01:00');

      assert.equal(firstOccurrence.toISOString(), '2024-10-27T00:30:00.000Z');
      assert.equal(secondOccurrence.toISOString(), '2024-10-27T01:30:00.000Z');
      assert.equal(tz.utcAdd(firstOccurrence, 1, 'hours').toISOString(), secondOccurrence.toISOString());
    });
  });

  it('guesses a local zone string when TZ is set', () => {
    // Set process.env.TZ to a known valid IANA zone
    const zone = 'Europe/Berlin';
    const oldTZ = process.env.TZ;
    process.env.TZ = zone;
    try {
      assert.equal(tz.guessLocalZone(), zone);
      assert.ok(tz.getZoneNames().includes(zone));
    } finally {
      // Restore previous TZ
      if (oldTZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = oldTZ;
      }
    }
  });

  describe('isUtcTimezone', () => {
    it('should return false for undefined/null/empty', () => {
      assert.equal(tz.__test__.isUtcTimezone(undefined), false);
      assert.equal(tz.__test__.isUtcTimezone(null), false);
      assert.equal(tz.__test__.isUtcTimezone(''), false);
    });

    it('should return true for UTC timezones', () => {
      assert.equal(tz.__test__.isUtcTimezone('Etc/UTC'), true);
      assert.equal(tz.__test__.isUtcTimezone('UTC'), true);
      assert.equal(tz.__test__.isUtcTimezone('Etc/GMT'), true);
    });

    it('should be case insensitive', () => {
      assert.equal(tz.__test__.isUtcTimezone('etc/utc'), true);
      assert.equal(tz.__test__.isUtcTimezone('utc'), true);
      assert.equal(tz.__test__.isUtcTimezone('ETC/GMT'), true);
    });

    it('should return false for non-UTC timezones', () => {
      assert.equal(tz.__test__.isUtcTimezone('Europe/Berlin'), false);
      assert.equal(tz.__test__.isUtcTimezone('America/New_York'), false);
      assert.equal(tz.__test__.isUtcTimezone('Etc/GMT+1'), false);
    });
  });
});
