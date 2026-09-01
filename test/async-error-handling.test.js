/**
 * Tests for async parseICS error handling
 *
 * Related to Issue #144: Uncatchable exception in async mode
 * @see https://github.com/jens-maus/node-ical/issues/144
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';
import ical from 'node-ical';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to promisify the callback-based async.parseICS API
function parseICSPromise(data) {
  return new Promise((resolve, reject) => {
    ical.async.parseICS(data, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

// Valid ICS for baseline tests
const validICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
SUMMARY:Valid Event
UID:valid-event-123
END:VEVENT
END:VCALENDAR`;

// Malformed ICS that causes "No toISOString function" error
const malformedDtstartICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Bad Event
DTSTART:not_a_valid_date
RRULE:FREQ=DAILY
UID:bad-event-456
END:VEVENT
END:VCALENDAR`;

describe('parseICS async mode', () => {
  describe('successful parsing', () => {
    it('should parse valid ICS via callback', async () => {
      const data = await parseICSPromise(validICS);
      assert.ok(data, 'Data should be returned');

      const events = Object.values(data).filter(x => x.type === 'VEVENT');
      assert.equal(events.length, 1);
      assert.equal(events[0].summary, 'Valid Event');
      assert.equal(events[0].uid, 'valid-event-123');
    });

    it('should return same result as sync mode', async () => {
      const syncResult = ical.sync.parseICS(validICS);
      const asyncResult = await parseICSPromise(validICS);

      const syncEvents = Object.values(syncResult).filter(x => x.type === 'VEVENT');
      const asyncEvents = Object.values(asyncResult).filter(x => x.type === 'VEVENT');
      assert.equal(syncEvents.length, asyncEvents.length);
      assert.equal(syncEvents[0].summary, asyncEvents[0].summary);
      assert.equal(syncEvents[0].uid, asyncEvents[0].uid);
    });
  });

  describe('error handling - Issue #144', () => {
    /**
     * CURRENT BEHAVIOR (BUG):
     * Errors in setImmediate are not catchable via callback.
     *
     * EXPECTED BEHAVIOR (AFTER FIX):
     * Errors should be passed to the callback's first parameter.
     */
    it('should pass parsing errors to callback (Issue #144)', async () => {
      await assert.rejects(
        () => parseICSPromise(malformedDtstartICS),
        /toISOString|Invalid/v,
        'Error should indicate parsing failure',
      );
    });

    it('should not require try-catch for async error handling', async () => {
      await assert.rejects(
        () => parseICSPromise(malformedDtstartICS),
        /toISOString|Invalid/v,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty ICS string', async () => {
      const data = await parseICSPromise('');
      assert.ok(data);
      assert.equal(Object.keys(data).length, 0);
    });

    it('should handle ICS with only VCALENDAR wrapper', async () => {
      const minimalICS = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

      const data = await parseICSPromise(minimalICS);
      assert.ok(data);
    });

    it('should handle multiple events', async () => {
      const multiEventICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20240101T120000Z
SUMMARY:Event 1
UID:event-1
END:VEVENT
BEGIN:VEVENT
DTSTART:20240102T120000Z
SUMMARY:Event 2
UID:event-2
END:VEVENT
END:VCALENDAR`;

      const data = await parseICSPromise(multiEventICS);
      const events = Object.values(data).filter(x => x.type === 'VEVENT');
      assert.equal(events.length, 2);
    });

    it('invokes the callback exactly once and surfaces a throwing callback', done => {
      // The two-argument form of promise.then() guarantees cb runs at most once:
      // an error thrown by cb is not re-routed into the rejection handler.
      // A throwing callback should surface as an uncaught exception (standard
      // callback-API behavior), not be silently swallowed nor cause a 2nd call.
      let callbackCount = 0;

      const originalListeners = process.listeners('uncaughtException');
      process.removeAllListeners('uncaughtException');
      let isRestored = false;
      const timeout = setTimeout(() => {
        restore();
        done(new Error('Expected callback error to surface via uncaughtException'));
      }, 100);

      const restore = () => {
        if (isRestored) {
          return;
        }

        isRestored = true;
        clearTimeout(timeout);
        process.removeListener('uncaughtException', onUncaught);
        for (const listener of originalListeners) {
          process.on('uncaughtException', listener);
        }
      };

      function onUncaught(error) {
        restore();
        try {
          assert.equal(callbackCount, 1, 'callback must be invoked exactly once');
          assert.equal(error.message, 'User callback error');
          done();
        } catch (assertionError) {
          done(assertionError);
        }
      }

      process.on('uncaughtException', onUncaught);

      ical.parseICS(validICS, () => {
        callbackCount++;
        throw new Error('User callback error');
      });
    });
  });
});

describe('parseICS sync vs async parity', () => {
  it('sync mode should throw on malformed data', () => {
    assert.throws(() => {
      ical.parseICS(malformedDtstartICS);
    }, /toISOString/v);
  });

  it('async mode should report error consistent with sync mode', async () => {
    // Both sync and async modes should report the same error for malformed data
    await assert.rejects(() => parseICSPromise(malformedDtstartICS), /toISOString|Invalid/v);
  });

  describe('Bug #144 reproduction - error after first setImmediate batch', () => {
    it('should catch errors occurring after 2000+ lines (Issue #144)', async () => {
      // This test uses a large ICS file (2410+ lines) with a duplicate DTSTART at the end
      // The error occurs AFTER the first setImmediate batch (limit=2000)
      // This demonstrates the actual bug: exceptions thrown in setImmediate callbacks
      // escape to the global uncaughtException handler instead of being passed to the callback

      const largeICS = readFileSync(
        path.join(__dirname, 'fixtures', 'large-file-with-late-error.ics'),
        'utf8',
      );

      // Expected behavior: error should be caught and rejected in promise
      await assert.rejects(() => parseICSPromise(largeICS), /duplicate DTSTART/v);
    });
  });
});
