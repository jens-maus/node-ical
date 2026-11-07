import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';
import {createCoreApi} from '../lib/core-api.js';

// The callback mode of the autodetect parseICS()/parseFile() is deprecated (#476)

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';

function createApi() {
  const warnings = [];
  const api = createCoreApi({
    parseICSImpl(data, cb) {
      const result = {data};
      if (!cb) {
        return result;
      }

      setImmediate(() => {
        cb(null, result);
      });
    },
    fsModule: {
      readFileSync: () => ICS,
      promises: {readFile: async () => ICS},
    },
    emitWarning(message, options) {
      warnings.push({message, ...options});
    },
  });

  return {api, warnings};
}

function callWithCallback(fn, argument) {
  return new Promise((resolve, reject) => {
    fn(argument, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

describe('callback deprecation of the autodetect API', () => {
  it('warns once per function and still calls the callback', async () => {
    const {api, warnings} = createApi();

    assert.deepEqual(await callWithCallback(api.parseICS, ICS), {data: ICS});
    assert.deepEqual(await callWithCallback(api.parseICS, ICS), {data: ICS});
    assert.deepEqual(await callWithCallback(api.parseFile, 'calendar.ics'), {data: ICS});
    assert.deepEqual(await callWithCallback(api.parseFile, 'calendar.ics'), {data: ICS});

    assert.deepEqual(warnings.map(({type, code}) => ({type, code})), [
      {type: 'DeprecationWarning', code: 'NODE_ICAL_PARSEICS_CALLBACK'},
      {type: 'DeprecationWarning', code: 'NODE_ICAL_PARSEFILE_CALLBACK'},
    ]);
    assert.match(warnings[0].message, /parseICS\(\) with a callback is deprecated.*ical\.async\.parseICS\(\)/v);
    assert.match(warnings[1].message, /parseFile\(\) with a callback is deprecated.*ical\.async\.parseFile\(\)/v);
  });

  it('does not warn for the sync form or for the async API with a callback', async () => {
    const {api, warnings} = createApi();

    assert.deepEqual(api.parseICS(ICS), {data: ICS});
    assert.deepEqual(api.parseFile('calendar.ics'), {data: ICS});
    await callWithCallback(api.asyncApi.parseICS, ICS);
    await callWithCallback(api.asyncApi.parseFile, 'calendar.ics');
    await api.asyncApi.parseICS(ICS);

    assert.deepEqual(warnings, []);
  });

  for (const [format, script] of [
    ['ESM', 'import ical from \'node-ical\';'],
    ['CommonJS', 'const ical = require(\'node-ical\');'],
  ]) {
    it(`emits one DeprecationWarning per process through the ${format} entry`, () => {
      const code = `${script}
        const ics = ${JSON.stringify(ICS)};
        let calls = 0;
        const done = () => { if (++calls === 2) console.log('callbacks: 2'); };
        ical.parseICS(ics, done);
        ical.parseICS(ics, done);`;
      const {status, stdout, stderr} = spawnSync(process.execPath, [
        ...(format === 'ESM' ? ['--input-type=module'] : []),
        '--eval',
        code,
      ], {cwd: repositoryRoot, encoding: 'utf8'});

      assert.equal(status, 0, stderr);
      assert.equal(stdout.trim(), 'callbacks: 2');
      assert.equal(stderr.match(/\[NODE_ICAL_PARSEICS_CALLBACK\] DeprecationWarning/gv)?.length, 1, stderr);
    });
  }
});
