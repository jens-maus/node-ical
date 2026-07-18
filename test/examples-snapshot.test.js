import assert from 'node:assert';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'mocha';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const exampleScripts = [
  'example-rrule-basic.js',
  'example-rrule-moment.js',
  'example-rrule-luxon.js',
  'example-rrule-dayjs.js',
  'example-rrule-datefns.js',
  'example-rrule-vanilla.js',
];

const snapshotDir = path.join(__dirname, 'snapshots');

function runExample(script) {
  const absPath = path.join(__dirname, '../examples', script);
  const result = spawnSync('node', [absPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TZ: 'Europe/Berlin',
    },
  });
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Script ${script} exited with code ${result.status}`);
  }

  return result.stdout.trim();
}

// Normalize output to LF so Windows/macOS/Linux all compare the same snapshot
function normalizeNewlines(text) {
  return text.replaceAll('\r\n', '\n');
}

// Example scripts should stay in sync after logic changes
describe('example output snapshots', function () {
  this.timeout(10_000);

  for (const script of exampleScripts) {
    it(`${script} output matches snapshot`, function () {
      const output = normalizeNewlines(runExample(script));
      const snapshotFile = path.join(snapshotDir, script.replace(/\.(?:c|m)?js$/v, '.txt'));
      if (fs.existsSync(snapshotFile)) {
        const expected = normalizeNewlines(fs.readFileSync(snapshotFile, 'utf8')).trim();
        assert.strictEqual(output, expected, `Output of ${script} does not match snapshot. If this is intentional, update the snapshot.`);
      } else {
        // If no snapshot exists yet (new example variant), write the baseline and skip this assertion
        fs.writeFileSync(snapshotFile, output, 'utf8');
        this.skip();
      }
    });
  }
});
