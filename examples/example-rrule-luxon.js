/*
 * Example: Expanding recurring calendar events (using Luxon)
 *
 * This script shows how to turn VEVENTs (including recurring ones) into concrete
 * event instances within a given date range using Luxon for date handling. It demonstrates how to:
 *
 * - Expand RRULEs into individual dates within a range
 * - Apply per-date overrides (RECURRENCE-ID via `recurrences`)
 * - Skip exception dates (`exdate`)
 * - Print each instance with title, start/end time, and humanized duration
 *
 * Why Luxon? It provides immutable DateTime objects, excellent timezone support,
 * and a clean API for date manipulation without the bulk of moment.js.
 *
 * Why a date range? Recurring rules can describe infinite series. Limiting to a
 * fixed window (here: calendar year 2017) keeps expansion finite and practical.
 */

const path = require('node:path');
const {DateTime} = require('luxon');
const ical = require('../node-ical.js');

// Load an example iCal file with various recurring events.
const data = ical.parseFile(path.join(__dirname, 'example-rrule.ics'));

// Extract VEVENT components for iteration.
const events = Object
  .values(data)
  .filter(item => item.type === 'VEVENT' && !item.recurrenceid);

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
// Pin the bounds to UTC so converting via toJSDate() stays stable across environments.
const rangeStart = DateTime.fromISO('2017-01-01', {zone: 'UTC'}).startOf('day');
const rangeEnd = DateTime.fromISO('2017-12-31', {zone: 'UTC'}).endOf('day');

for (const event of events) {
  // Use expandRecurringEvent to handle all RRULE expansion, EXDATEs, and overrides
  const instances = ical.expandRecurringEvent(event, {
    from: rangeStart.toJSDate(),
    to: rangeEnd.toJSDate(),
  });

  // Print each instance with Luxon formatting
  for (const instance of instances) {
    const title = instance.summary;
    const startDate = DateTime.fromJSDate(instance.start);
    const endDate = DateTime.fromJSDate(instance.end);
    const duration = endDate.diff(startDate);

    console.log(`title:${title}`);
    console.log(`startDate:${startDate.toLocaleString(DateTime.DATETIME_FULL, {locale: 'en'})}`);
    console.log(`endDate:${endDate.toLocaleString(DateTime.DATETIME_FULL, {locale: 'en'})}`);
    console.log(`duration:${duration.toFormat('h:mm')} hours`);
    console.log();
  }
}
