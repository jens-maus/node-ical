/**
 * Tests for async parseICS error handling
 *
 * Related to Issue #144: Uncatchable exception in async mode
 * @see https://github.com/jens-maus/node-ical/issues/144
 */
/* eslint-disable prefer-arrow-callback, max-nested-callbacks */

const assert = require('node:assert/strict');
const process = require('node:process');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

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

describe('parseICS async mode', function () {
  describe('successful parsing', function () {
    it('should parse valid ICS via callback', function (done) {
      ical.parseICS(validICS, (error, data) => {
        assert.equal(error, null, 'Error should be null for valid ICS');
        assert.ok(data, 'Data should be returned');

        const events = Object.values(data).filter(x => x.type === 'VEVENT');
        assert.equal(events.length, 1);
        assert.equal(events[0].summary, 'Valid Event');
        assert.equal(events[0].uid, 'valid-event-123');

        done();
      });
    });

    it('should return same result as sync mode', function (done) {
      const syncResult = ical.parseICS(validICS);

      ical.parseICS(validICS, (error, asyncResult) => {
        assert.equal(error, null);

        const syncEvents = Object.values(syncResult).filter(x => x.type === 'VEVENT');
        const asyncEvents = Object.values(asyncResult).filter(x => x.type === 'VEVENT');
        assert.equal(syncEvents.length, asyncEvents.length);
        assert.equal(syncEvents[0].summary, asyncEvents[0].summary);
        assert.equal(syncEvents[0].uid, asyncEvents[0].uid);

        done();
      });
    });
  });

  describe('error handling - Issue #144', function () {
    /**
     * CURRENT BEHAVIOR (BUG):
     * Errors in setImmediate are not catchable via callback.
     *
     * EXPECTED BEHAVIOR (AFTER FIX):
     * Errors should be passed to the callback's first parameter.
     */
    it('should pass parsing errors to callback (Issue #144)', function (done) {
      this.timeout(5000);

      let handled = false;
      let uncaughtError = null;

      // Temporarily capture uncaught exceptions
      const originalHandlers = process.listeners('uncaughtException');
      process.removeAllListeners('uncaughtException');

      const uncaughtHandler = error => {
        uncaughtError = error;
      };

      process.on('uncaughtException', uncaughtHandler);

      const cleanup = () => {
        process.removeListener('uncaughtException', uncaughtHandler);
        for (const handler of originalHandlers) {
          process.on('uncaughtException', handler);
        }
      };

      const checkComplete = () => {
        if (handled) {
          return;
        }

        handled = true;
        cleanup();

        if (uncaughtError) {
          return done(new Error(`BUG #144: Error escaped to uncaughtException: ${uncaughtError.message}`));
        }

        done(new Error('BUG #144: Neither callback nor try-catch received the error'));
      };

      ical.parseICS(malformedDtstartICS, (error, _data) => {
        if (handled || !error) {
          return;
        }

        // EXPECTED behavior - error passed to callback
        handled = true;
        cleanup();

        assert.ok(
          error.message.includes('toISOString') || error.message.includes('Invalid'),
          'Error message should indicate parsing failure',
        );
        done();
      });

      // Wait to see if uncaught exception occurs (the bug)
      setTimeout(checkComplete, 2000);
    });

    it('should not require try-catch for async error handling', function (done) {
      this.timeout(5000);

      let errorCaught = false;

      const handleError = () => {
        if (!errorCaught) {
          errorCaught = true;
          done();
        }
      };

      ical.parseICS(malformedDtstartICS, (error, _data) => {
        if (error) {
          handleError();
        }
      });

      setTimeout(() => {
        if (!errorCaught) {
          done(new Error('Error was not caught by callback'));
        }
      }, 2000);
    });
  });

  describe('edge cases', function () {
    it('should handle empty ICS string', function (done) {
      ical.parseICS('', (error, data) => {
        assert.equal(error, null);
        assert.ok(data);
        assert.equal(Object.keys(data).length, 0);
        done();
      });
    });

    it('should handle ICS with only VCALENDAR wrapper', function (done) {
      const minimalICS = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

      ical.parseICS(minimalICS, (error, data) => {
        assert.equal(error, null);
        assert.ok(data);
        done();
      });
    });

    it('should handle multiple events', function (done) {
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

      ical.parseICS(multiEventICS, (error, data) => {
        assert.equal(error, null);
        const events = Object.values(data).filter(x => x.type === 'VEVENT');
        assert.equal(events.length, 2);
        done();
      });
    });

    it('should call callback only once even if it throws', function (done) {
      // Regression test: if callback is inside try-catch, an error thrown by
      // the callback would be caught and cause a double callback
      let callbackCount = 0;

      ical.parseICS(validICS, () => {
        callbackCount++;

        if (callbackCount > 1) {
          done(new Error('Callback was called more than once'));
          return;
        }

        // Throw after incrementing counter - this tests that parseICS
        // doesn't catch this error and call the callback again
        throw new Error('User callback error');
      });

      // Give it time for potential double callback
      setTimeout(() => {
        assert.equal(callbackCount, 1);
        done();
      }, 50);
    });
  });
});

describe('parseICS sync vs async parity', function () {
  it('sync mode should throw on malformed data', function () {
    assert.throws(() => {
      ical.parseICS(malformedDtstartICS);
    }, /toISOString/);
  });

  it('async mode should report same error via callback', function (done) {
    this.timeout(5000);

    let syncErrorMessage;
    try {
      ical.parseICS(malformedDtstartICS);
    } catch (error) {
      syncErrorMessage = error.message;
    }

    let handled = false;

    try {
      ical.parseICS(malformedDtstartICS, (error, _data) => {
        if (error && !handled) {
          handled = true;
          assert.ok(
            error.message.includes('toISOString') || syncErrorMessage.includes(error.message),
            'Async error should be similar to sync error',
          );
          done();
        }
      });
    } catch (error) {
      if (!handled) {
        handled = true;
        assert.equal(error.message, syncErrorMessage);
        done();
      }
    }

    setTimeout(() => {
      if (!handled) {
        done(new Error('Neither callback nor try-catch received the error'));
      }
    }, 2000);
  });

  describe('Bug #144 reproduction - error after first setImmediate batch', function () {
    it('should catch errors occurring after 2000+ lines (Issue #144)', function (done) {
      // This test uses a large ICS file (2410+ lines) with a duplicate DTSTART at the end
      // The error occurs AFTER the first setImmediate batch (limit=2000)
      // This demonstrates the actual bug: exceptions thrown in setImmediate callbacks
      // escape to the global uncaughtException handler instead of being passed to the callback

      this.timeout(5000); // Allow more time for large file processing

      const fs = require('node:fs');
      const path = require('node:path');
      const largeICS = fs.readFileSync(
        path.join(__dirname, 'fixtures', 'large-file-with-late-error.ics'),
        'utf8',
      );

      let handled = false;
      ical.parseICS(largeICS, (error, _data) => {
        if (handled) {
          return;
        }

        handled = true;

        if (error) {
          // Expected behavior: error should be caught and passed to callback
          assert.match(error.message, /duplicate DTSTART/);
          done();
        } else {
          // Current buggy behavior: parsing might appear to succeed
          // because the error escapes to uncaughtException
          done(new Error('Expected error but parsing succeeded - bug #144 not fixed'));
        }
      });
    });
  });
});
