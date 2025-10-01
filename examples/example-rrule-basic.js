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

// Duration stays constant across all recurrences.
const durationMs = event.end.getTime() - event.start.getTime();

// Choose a window that definitely includes all generated instances.
const rangeStart = new Date('2024-01-01T00:00:00.000Z');
const rangeEnd = new Date('2024-01-31T23:59:59.999Z');

// Expand the RRULE; if none exists, just emit the original DTSTART.
const starts = event.rrule
  ? event.rrule.between(rangeStart, rangeEnd, true)
  : [event.start];

for (const occurrenceStart of starts) {
  const startDate = new Date(occurrenceStart);
  const endDate = new Date(startDate.getTime() + durationMs);

  console.log(`summary:${event.summary}`);
  console.log(`start:${startDate.toISOString()}`);
  console.log(`end:${endDate.toISOString()}`);
  console.log();
}
