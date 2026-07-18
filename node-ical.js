import fs from 'node:fs';
import ical from './ical.js';
import {createCoreApi} from './lib/core-api.js';
import expandRecurringEventImpl from './lib/expand-recurring-event.js';
import {buildPublicApi} from './lib/public-api.js';

// Runtime API wiring lives here; public typings are maintained in node-ical.d.ts.

const {
  syncApi,
  asyncApi,
  autodetectApi,
} = createCoreApi({
  parseICSImpl: ical.parseICS.bind(ical),
  fsModule: fs,
});

const {objectHandlers} = ical;
const handleObject = ical.handleObject.bind(ical);
const parseLines = ical.parseLines.bind(ical);

const publicApi = buildPublicApi({
  asyncApi,
  autodetectApi,
  syncApi,
  expandRecurringEvent: expandRecurringEventImpl,
  icalCore: {
    objectHandlers,
    handleObject,
    parseLines,
  },
});

const {
  fromURL,
  parseFile,
  parseICS,
  sync,
  async,
} = publicApi;

export {
  fromURL,
  parseFile,
  parseICS,
  sync,
  async,
  objectHandlers,
  handleObject,
  parseLines,
};

export {default as expandRecurringEvent} from './lib/expand-recurring-event.js';

export default publicApi;
