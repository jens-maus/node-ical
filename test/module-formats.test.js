import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {describe, it} from 'mocha';

const require = createRequire(import.meta.url);

const ICS_SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//TEST//module format parity//EN',
  'BEGIN:VEVENT',
  'UID:module-format-1',
  'DTSTAMP:20250101T000000Z',
  'DTSTART:20250101T100000Z',
  'DTEND:20250101T110000Z',
  'SUMMARY:Module Format Event',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function findFirstVevent(data) {
  return Object.values(data).find(component => component?.type === 'VEVENT');
}

function assertCjsContainsEsmDefaultKeys(esmDefault, cjs) {
  for (const key of Object.keys(esmDefault)) {
    assert.ok(Object.hasOwn(cjs, key), `CJS entry is missing "${key}"`);
  }
}

describe('package entry points', () => {
  it('loads CommonJS entry via require', () => {
    const cjs = require('node-ical');

    assert.equal(typeof cjs.parseICS, 'function');
    assert.equal(typeof cjs.parseFile, 'function');
    assert.equal(typeof cjs.fromURL, 'function');
    assert.equal(typeof cjs.expandRecurringEvent, 'function');
    assert.equal(typeof cjs.sync?.parseICS, 'function');
    assert.equal(typeof cjs.async?.parseICS, 'function');
  });

  it('loads ESM entry via import with named and default exports', async () => {
    const esm = await import('node-ical');

    assert.equal(typeof esm.parseICS, 'function');
    assert.equal(typeof esm.parseFile, 'function');
    assert.equal(typeof esm.fromURL, 'function');
    assert.equal(typeof esm.expandRecurringEvent, 'function');
    assert.equal(typeof esm.default?.parseICS, 'function');
    assert.equal(typeof esm.default?.sync?.parseICS, 'function');
    assert.equal(typeof esm.default?.async?.parseICS, 'function');
  });

  it('resolves the advertised package exports for both import and require', async () => {
    const packageJson = require('../package.json');

    assert.equal(packageJson.type, 'module');
    assert.equal(packageJson.exports['.'].require, './node-ical.cjs');
    assert.equal(packageJson.exports['.'].import, './node-ical.js');

    const esm = await import('node-ical');
    const cjs = require('node-ical');

    // The generated CJS entry may carry additive interop keys (e.g. `default`),
    // so require every public ESM key to be present rather than an exact match.
    assertCjsContainsEsmDefaultKeys(esm.default, cjs);

    assert.equal(esm.default.parseICS, esm.parseICS);
    assert.equal(typeof cjs.parseICS, 'function');
  });

  it('exposes matching top-level API keys for CJS and ESM default export', async () => {
    const cjs = require('node-ical');
    const esm = await import('node-ical');

    assertCjsContainsEsmDefaultKeys(esm.default, cjs);
  });

  it('parses ICS consistently between CJS and ESM named export', async () => {
    const cjs = require('node-ical');
    const esm = await import('node-ical');

    const parsedCjs = cjs.parseICS(ICS_SAMPLE);
    const parsedEsm = esm.parseICS(ICS_SAMPLE);
    const eventCjs = findFirstVevent(parsedCjs);
    const eventEsm = findFirstVevent(parsedEsm);

    assert.ok(eventCjs);
    assert.ok(eventEsm);
    assert.equal(eventCjs.uid, eventEsm.uid);
    assert.equal(eventCjs.summary, eventEsm.summary);
    assert.equal(eventCjs.start.toISOString(), eventEsm.start.toISOString());
    assert.equal(eventCjs.end.toISOString(), eventEsm.end.toISOString());
  });
});
