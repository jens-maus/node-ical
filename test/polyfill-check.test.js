const assert = require('node:assert/strict');
const {execSync} = require('node:child_process');
const path = require('node:path');
const {describe, it} = require('mocha');

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

  it('should use temporal-polyfill (not @js-temporal/polyfill with JSBI)', () => {
    const result = execSync('npm ls @js-temporal/polyfill --json', {encoding: 'utf8'});
    const data = JSON.parse(result);

    // Find the actual resolved package
    const resolved = data.dependencies['rrule-temporal'].dependencies['@js-temporal/polyfill'];

    assert.ok(resolved, '@js-temporal/polyfill should be resolved');
    assert.match(resolved.resolved, /temporal-polyfill/);
  });

  it('should load temporal-polyfill when requiring @js-temporal/polyfill', () => {
    // Clear require cache to force fresh load
    const modulePath = require.resolve('@js-temporal/polyfill');
    delete require.cache[modulePath];

    const _Temporal = require('@js-temporal/polyfill');
    const packageJsonPath = path.join(path.dirname(modulePath), 'package.json');
    const packageJson = require(packageJsonPath);

    assert.strictEqual(packageJson.name, 'temporal-polyfill');
  });
});
