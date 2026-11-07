import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// Quoted parameter values that contain a semicolon are kept whole (issue #600)

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'quoted-parameter-semicolon.ics');

describe('issue #600: quoted parameter values with a semicolon', () => {
  const event = ical.sync.parseFile(fixture)['issue-600@node-ical.test'];

  it('keeps a quoted CN with a semicolon in ATTENDEE and ORGANIZER', () => {
    assert.deepEqual(event.attendee[0].params, {CN: 'Doe; John', ROLE: 'REQ-PARTICIPANT'});
    assert.equal(event.attendee[0].val, 'mailto:john@example.com');
    assert.deepEqual(event.organizer.params, {CN: 'Doe; Jane'});
    assert.equal(event.organizer.val, 'mailto:jane@example.com');
  });

  it('still keeps a quoted CN with a colon (#326)', () => {
    assert.deepEqual(event.attendee[1].params, {CN: 'Roe: Rick', ROLE: 'OPT-PARTICIPANT'});
    assert.equal(event.attendee[1].val, 'mailto:rick@example.com');
  });

  it('does not split a quoted URL into an extra parameter', () => {
    assert.deepEqual(event.location.params, {ALTREP: 'https://example.com/?a=1;b=2'});
    assert.equal(event.location.val, 'Room 1');
  });

  it('keeps the parameters around a quoted value with a semicolon', () => {
    assert.deepEqual(event.summary.params, {LANGUAGE: 'en', 'X-NOTE': 'a;b'});
    assert.equal(event.summary.val, 'Meeting');
  });
});
