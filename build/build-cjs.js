// Generate the CommonJS entry point (node-ical.cjs) from the ESM sources.
//
// ESM (*.js, type: module) is the single source of truth. This bundles
// node-ical.js into a single self-contained CommonJS file so that
// `require('node-ical')` keeps working, while runtime dependencies stay
// external `require()` calls.
import {build} from 'esbuild';

await build({
  entryPoints: ['node-ical.js'],
  outfile: 'node-ical.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Keep in sync with engines.node in package.json and node-version in .github/workflows/nodejs.yml
  target: 'node22',
  // Keep node_modules dependencies as require() calls; only bundle our own code
  // (and inline windowsZones.json, which is imported relatively).
  packages: 'external',
  logLevel: 'info',
});
