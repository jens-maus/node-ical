/**
 * Additional tests for VTODO, VJOURNAL, and VFREEBUSY types
 * Ensures comprehensive coverage of all component types
 */

const assert_ = require('node:assert/strict');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

function values(object) {
  return Object.values(object);
}

function findItem(array, predicate) {
  return array.find(item => predicate(item));
}

describe('parser: extended component types', () => {
  describe('VTODO', () => {
    it('parses VTODO with all properties (vtodo-vfreebusy.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vtodo-vfreebusy.ics');
      const todo = findItem(values(data), item => item.uid === 'uid4@host1.com');

      assert_.equal(todo.type, 'VTODO');
      assert_.equal(todo.uid, 'uid4@host1.com');
      assert_.equal(todo.summary, 'Submit Income Taxes');
      assert_.equal(todo.status, 'NEEDS-ACTION');

      // DUE should be parsed as a Date object (fixes #426)
      // Note: DUE:19980415T235959 is floating time (no Z suffix), so the exact
      // UTC timestamp depends on the local timezone. We verify the date components.
      assert_.ok(todo.due instanceof Date, 'DUE should be a Date object');
      assert_.equal(todo.due.getFullYear(), 1998);
      assert_.equal(todo.due.getMonth(), 3); // April = 3 (0-indexed)
      assert_.equal(todo.due.getDate(), 15);
      assert_.equal(todo.due.getHours(), 23);
      assert_.equal(todo.due.getMinutes(), 59);
      assert_.equal(todo.due.getSeconds(), 59);

      assert_.ok(todo.organizer);
      assert_.ok(todo.attendee);
      assert_.ok(Array.isArray(todo.alarms) && todo.alarms.length > 0);
    });

    it('parses VTODO with completion (utf8-french-calendar.ics)', () => {
      const data = ical.parseFile('./test/fixtures/utf8-french-calendar.ics');
      const todos = values(data).filter(item => item.type === 'VTODO');

      assert_.equal(todos.length, 2);

      const completedTodo = todos.find(todo => Number(todo.completion) === 100);
      assert_.ok(completedTodo, 'Should have a completed VTODO');
      assert_.equal(Number(completedTodo.completion), 100);
      assert_.ok(completedTodo.completed);
      assert_.equal(completedTodo.completed.toISOString(), '2013-07-16T08:57:45.000Z');
      assert_.ok(completedTodo.categories);
    });
  });

  describe('VJOURNAL', () => {
    it('parses VJOURNAL with all properties (vtodo-vfreebusy.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vtodo-vfreebusy.ics');
      const journal = findItem(values(data), item => item.type === 'VJOURNAL');

      assert_.equal(journal.type, 'VJOURNAL');
      assert_.equal(journal.uid, 'uid5@host1.com');
      assert_.ok(journal.description);
      assert_.equal(journal.status, 'DRAFT');
      assert_.equal(journal.class, 'PUBLIC');
      assert_.ok(journal.organizer);

      // VJOURNAL can have CATEGORY (singular) which becomes categories array
      assert_.ok(journal.categories || journal.category);
    });
  });

  describe('VFREEBUSY', () => {
    it('parses VFREEBUSY with periods (vtodo-vfreebusy.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vtodo-vfreebusy.ics');
      const vfb = findItem(values(data), item => item.type === 'VFREEBUSY');

      assert_.equal(vfb.type, 'VFREEBUSY');
      assert_.ok(vfb.organizer);
      assert_.equal(vfb.url, 'http://www.host.com/calendar/busytime/jsmith.ifb');
      assert_.ok(vfb.start);
      assert_.ok(vfb.end);
      assert_.ok(Array.isArray(vfb.freebusy));
      assert_.ok(vfb.freebusy.length > 0);

      const period = vfb.freebusy[0];
      assert_.equal(period.type, 'BUSY');
      assert_.ok(period.start);
      assert_.ok(period.end);
    });

    it('parses VFREEBUSY with multiple FBTYPE values (vfreebusy-zimbra.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vfreebusy-zimbra.ics');
      const vfb = findItem(values(data), item => item.type === 'VFREEBUSY');

      assert_.equal(vfb.type, 'VFREEBUSY');
      assert_.ok(vfb.organizer);
      assert_.ok(vfb.url);
      assert_.ok(Array.isArray(vfb.freebusy));

      // All periods in vfreebusy-zimbra.ics should be BUSY type
      for (const period of vfb.freebusy) {
        assert_.equal(period.type, 'BUSY');
        assert_.ok(period.start instanceof Date);
        assert_.ok(period.end instanceof Date);
        assert_.ok(period.start < period.end, 'start should be before end');
      }
    });
  });

  describe('CalendarComponent union', () => {
    it('handles mixed component types in one file (vtodo-vfreebusy.ics)', () => {
      const data = ical.parseFile('./test/fixtures/vtodo-vfreebusy.ics');
      const components = values(data);

      const types = new Set(components.map(c => c.type).filter(Boolean));

      // Vtodo-vfreebusy.ics contains multiple component types
      assert_.ok(types.has('VEVENT'));
      assert_.ok(types.has('VTODO'));
      assert_.ok(types.has('VJOURNAL'));
      assert_.ok(types.has('VFREEBUSY'));
    });

    it('properly indexes all components by UID', () => {
      const data = ical.parseFile('./test/fixtures/vtodo-vfreebusy.ics');

      // Each component type should be accessible by its UID
      assert_.ok(data['uid4@host1.com']?.type === 'VTODO');
      assert_.ok(data['uid5@host1.com']?.type === 'VJOURNAL');

      // Also check that VEVENT components are present
      const events = Object.values(data).filter(c => c?.type === 'VEVENT');
      assert_.ok(events.length > 0, 'Should have at least one VEVENT');
    });
  });
});
