/*
 * Example: Expanding recurring calendar events (using moment-timezone)
 *
 * This script shows how to turn VEVENTs (including recurring ones) into concrete
 * event instances within a given date range. It demonstrates how to:
 *
 * - Expand RRULEs into individual dates within a range
 * - Apply per-date overrides (RECURRENCE-ID via `recurrences`)
 * - Skip exception dates (`exdate`)
 * - Print each instance with title, start/end time, and humanized duration
 *
 * Why a date range? Recurring rules can describe infinite series. Limiting to a
 * fixed window (here: calendar year 2017) keeps expansion finite and practical.
 */

const path = require('node:path');
const moment = require('moment-timezone');
const ical = require('../node-ical.js');

// Load an example iCal file with various recurring events.
const data = ical.parseFile(path.join(__dirname, 'example-rrule.ics'));

// Extract VEVENT components for iteration.
const events = Object
  .values(data)
  .filter(item => item.type === 'VEVENT' && !item.recurrenceid);

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
const rangeStart = moment('2017-01-01').startOf('day');
const rangeEnd = moment('2017-12-31').endOf('day');

for (const event of events) {
  // Use expandRecurringEvent to handle all RRULE expansion, EXDATEs, and overrides
  const instances = ical.expandRecurringEvent(event, {
    from: rangeStart.toDate(),
    to: rangeEnd.toDate(),
  });

  // Print each instance with moment.js formatting
  for (const instance of instances) {
    const title = instance.summary;
    const startDate = moment(instance.start);
    const endDate = moment(instance.end);
    const duration = endDate.valueOf() - startDate.valueOf();

    console.log(`title:${title}`);
    console.log(`startDate:${startDate.format('MMMM Do YYYY, h:mm:ss a')}`);
    console.log(`endDate:${endDate.format('MMMM Do YYYY, h:mm:ss a')}`);
    console.log(`duration:${moment.duration(duration).humanize()}`);
    console.log();
  }
}
