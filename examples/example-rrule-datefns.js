/*
 * Example: Expanding recurring calendar events (using date-fns)
 *
 * This script shows how to turn VEVENTs (including recurring ones) into concrete
 * event instances within a given date range using date-fns for date handling. It demonstrates how to:
 *
 * - Expand RRULEs into individual dates within a range
 * - Apply per-date overrides (RECURRENCE-ID via `recurrences`)
 * - Skip exception dates (`exdate`)
 * - Print each instance with title, start/end time, and humanized duration
 *
 * Why date-fns? It is a modern, modular date library for JavaScript with a functional API and tree-shakable design.
 *
 * Why a date range? Recurring rules can describe infinite series. Limiting to a
 * fixed window (here: calendar year 2017) keeps expansion finite and practical.
 */

const path = require('node:path');
const {
  format,
  differenceInMilliseconds,
  parseISO,
} = require('date-fns');
const ical = require('../node-ical.js');

// Load an example iCal file with various recurring events.
const data = ical.parseFile(path.join(__dirname, 'example-rrule.ics'));

// Extract VEVENT components for iteration.
const events = Object
  .values(data)
  .filter(item => item.type === 'VEVENT' && !item.recurrenceid);

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
const rangeStart = parseISO('2017-01-01T00:00:00.000Z');
const rangeEnd = parseISO('2017-12-31T23:59:59.999Z');

for (const event of events) {
  // Use expandRecurringEvent to handle all RRULE expansion, EXDATEs, and overrides
  const instances = ical.expandRecurringEvent(event, {
    from: rangeStart,
    to: rangeEnd,
  });

  // Print each instance with date-fns formatting
  for (const instance of instances) {
    const title = instance.summary;
    const startDate = instance.start;
    const endDate = instance.end;
    const durationMs = differenceInMilliseconds(endDate, startDate);

    console.log(`title:${title}`);
    console.log(`startDate:${format(startDate, 'eeee, MMMM d, yyyy HH:mm')}`);
    console.log(`endDate:${format(endDate, 'eeee, MMMM d, yyyy HH:mm')}`);
    console.log(`duration:${Math.floor(durationMs / 3_600_000)}:${String(Math.floor((durationMs % 3_600_000) / 60_000)).padStart(2, '0')} hours`);
    console.log();
  }
}
