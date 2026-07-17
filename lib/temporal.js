import {Temporal as PolyfillTemporal} from 'temporal-polyfill';

// Prefer a natively available Temporal implementation and fall back to the
// polyfill otherwise. The resolved implementation is pinned on globalThis so
// that rrule-temporal (loaded afterwards) resolves the exact same Temporal.
// eslint-disable-next-line unicorn/no-global-object-property-assignment -- shared runtime bootstrap for a single Temporal implementation
globalThis.Temporal ??= PolyfillTemporal;

const {Temporal} = globalThis;

export {Temporal};
