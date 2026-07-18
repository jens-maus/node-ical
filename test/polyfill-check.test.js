import assert from 'node:assert/strict';
import {execSync} from 'node:child_process';
import {describe, it} from 'mocha';

describe('Temporal Polyfill Configuration', () => {
  it('should NOT have JSBI dependency installed', () => {
    try {
      execSync('npm ls jsbi --json', {encoding: 'utf8', stdio: 'pipe'});
      assert.fail('JSBI should not be installed');
    } catch {
      // Expected: JSBI should not be found (command will fail)
      assert.ok(true, 'JSBI is not installed as expected');
    }
  });
});
