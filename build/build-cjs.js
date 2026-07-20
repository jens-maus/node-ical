// Generate the CommonJS entry point (node-ical.cjs) from the ESM sources.
//
// ESM (*.js, type: module) is the single source of truth. This bundles
// node-ical.js into a single CommonJS file so that `require('node-ical')` keeps
// working. The Temporal polyfill is bundled because its v1 package is ESM-only;
// rrule-temporal remains an external runtime dependency.
import {build} from 'esbuild';

await build({
  entryPoints: ['node-ical.js'],
  outfile: 'node-ical.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Keep in sync with engines.node in package.json and node-version in .github/workflows/nodejs.yml
  target: 'node22',
  external: ['rrule-temporal', 'rrule-temporal/totext'],
  logLevel: 'info',
});
