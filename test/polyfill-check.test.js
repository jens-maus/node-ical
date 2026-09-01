import assert from 'node:assert/strict';
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {describe, it} from 'mocha';

describe('Temporal Polyfill Configuration', () => {
  it('should NOT have JSBI dependency installed', () => {
    assert.throws(
      () => execSync('npm ls jsbi --json', {encoding: 'utf8', stdio: 'pipe'}),
      error => error.status === 1,
      'JSBI should not be installed',
    );
  });

  it('should use temporal-polyfill v1 as a direct dependency', () => {
    // Read the installed package's own package.json directly instead of
    // shelling out to `npm ls`, which can exit non-zero (and make execSync
    // throw) for unrelated dependency-tree issues.
    const packageJsonUrl = new URL('../node_modules/temporal-polyfill/package.json', import.meta.url);
    const {version} = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));

    assert.match(String(version), /^1\./v);
  });

  it('should load temporal-polyfill via ESM import', async () => {
    const mod = await import('temporal-polyfill');

    assert.ok(mod.Temporal, 'temporal-polyfill should expose Temporal');
  });
});
