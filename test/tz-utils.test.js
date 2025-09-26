const assert = require('node:assert/strict');
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

  it('guesses a local zone string', () => {
    const guess = tz.guessLocalZone();
    assert.equal(typeof guess, 'string');
    // Node >=18 exposes the full IANA catalog via Intl.supportedValuesOf('timeZone'), so the guess should be included
    if (guess) {
      const names = tz.getZoneNames();
      assert.equal(Array.isArray(names), true);
      assert.ok(names.length > 0);
      assert.ok(names.includes(guess));
    }
  });
});
