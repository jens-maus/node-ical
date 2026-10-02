import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {describe, it} from 'mocha';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(packageRoot);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npmOptions = {shell: process.platform === 'win32'};

describe('published package type compatibility', () => {
  it('resolves ESM and CJS types with TypeScript 5.9', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'node-ical-types-'));

    try {
      const packageDirectory = path.join(temporaryRoot, 'package');
      const packageOutput = execFileSync(npmCommand, [
        'pack',
        '--json',
        '--pack-destination',
        temporaryRoot,
      ], {cwd: repositoryRoot, encoding: 'utf8', ...npmOptions});
      const packageFile = Object.values(JSON.parse(packageOutput))[0].filename;
      const packageArchive = path.join(temporaryRoot, packageFile);
      const nodeModulesDirectory = path.join(packageDirectory, 'node_modules', 'node-ical');
      mkdirSync(nodeModulesDirectory, {recursive: true});
      execFileSync('tar', ['-xzf', packageArchive, '--strip-components=1', '-C', nodeModulesDirectory]);

      writeFileSync(path.join(packageDirectory, 'package.json'), '{"type":"module"}\n');
      writeFileSync(path.join(packageDirectory, 'esm.ts'), [
        'import ical, {parseICS, type CalendarResponse} from \'node-ical\';',
        String.raw`const parsed: CalendarResponse = parseICS('BEGIN:VCALENDAR\r\nEND:VCALENDAR');`,
        'ical.parseICS(JSON.stringify(parsed));',
      ].join('\n'));
      writeFileSync(path.join(packageDirectory, 'cjs.cts'), [
        'import ical = require(\'node-ical\');',
        String.raw`const parsed = ical.parseICS('BEGIN:VCALENDAR\r\nEND:VCALENDAR');`,
        'ical.parseICS(JSON.stringify(parsed));',
      ].join('\n'));
      writeFileSync(path.join(packageDirectory, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        files: ['esm.ts', 'cjs.cts'],
      }));

      execFileSync(npxCommand, [
        '--yes',
        '--package=typescript@5.9.3',
        'tsc',
        '--project',
        path.join(packageDirectory, 'tsconfig.json'),
      ], {cwd: packageDirectory, stdio: 'pipe', ...npmOptions});
    } finally {
      rmSync(temporaryRoot, {recursive: true, force: true});
    }
  });
}).timeout(30_000);
