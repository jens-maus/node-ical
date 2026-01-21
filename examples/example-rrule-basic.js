/*
 * Example: Expanding a simple recurring event (native Date only)
 *
 * This minimal script shows how to read an .ics file, expand a single
 * RRULE within a fixed window, and print the resulting instances.
 */

const path = require('node:path');
const ical = require('../node-ical.js');

// Load the basic example calendar that contains one recurring event.
const data = ical.parseFile(path.join(__dirname, 'example-rrule-basic.ics'));

// Pull out the first VEVENT.
const event = Object.values(data).find(item => item.type === 'VEVENT');
if (!event) {
  throw new Error('No VEVENT found in example-rrule-basic.ics');
}

// Choose a window that definitely includes all generated instances.
const rangeStart = new Date('2024-01-01T00:00:00.000Z');
const rangeEnd = new Date('2024-01-31T23:59:59.999Z');

// Use expandRecurringEvent to handle RRULE expansion, EXDATE filtering, and RECURRENCE-ID overrides
const instances = ical.expandRecurringEvent(event, {
  from: rangeStart,
  to: rangeEnd,
});

for (const instance of instances) {
  console.log(`summary:${instance.summary}`);
  console.log(`start:${instance.start.toISOString()}`);
  console.log(`end:${instance.end.toISOString()}`);
  console.log();
}
