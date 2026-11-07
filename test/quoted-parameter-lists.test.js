import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// Parameters with a list of quoted values, like MEMBER="mailto:a","mailto:b" (RFC 5545 §3.1)

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'quoted-parameter-lists.ics');

describe('parameters with a list of quoted values', () => {
  const event = ical.sync.parseFile(fixture)['quoted-parameter-lists@node-ical.test'];

  it('keeps the lines instead of dropping them', () => {
    assert.deepEqual(event.attendee.map(attendee => attendee.val), [
      'mailto:john@example.com',
      'mailto:rick@example.com',
      'mailto:ann@example.com',
    ]);
  });

  it('unquotes each value of the list, like an unquoted list', () => {
    assert.deepEqual(event.attendee[0].params, {MEMBER: 'mailto:team@example.com,mailto:dev@example.com', CN: 'John Doe'});
    assert.deepEqual(event.attendee[1].params, {'DELEGATED-TO': 'mailto:ann@example.com,mailto:bob@example.com'});
  });

  it('still unquotes a single quoted value', () => {
    assert.deepEqual(event.attendee[2].params, {'DELEGATED-FROM': 'mailto:rick@example.com', CN: 'Ann'});
    assert.deepEqual(event.organizer.params, {CN: 'Doe, Jane'});
  });

  it('leaves an unquoted list as it is', () => {
    assert.deepEqual(event.summary, {params: {'X-TAGS': 'one,two'}, val: 'Planning'});
  });
});
