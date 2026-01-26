/*
 * Example: Expanding recurring calendar events (using Day.js)
 *
 * This script shows how to turn VEVENTs (including recurring ones) into concrete
 * event instances within a given date range using Day.js for date handling. It demonstrates how to:
 *
 * - Expand RRULEs into individual dates within a range
 * - Apply per-date overrides (RECURRENCE-ID via `recurrences`)
 * - Skip exception dates (`exdate`)
 * - Print each instance with title, start/end time, and humanized duration
 *
 * Why Day.js? It's a minimalist JavaScript date library with a familiar API similar
 * to moment.js but with a much smaller footprint (~2kB vs ~67kB for moment).
 * Perfect for environments where bundle size matters.
 *
 * Why a date range? Recurring rules can describe infinite series. Limiting to a
 * fixed window (here: calendar year 2017) keeps expansion finite and practical.
 */

const path = require('node:path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const duration = require('dayjs/plugin/duration');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const ical = require('../node-ical.js');

// Extend Day.js with plugins for timezone and duration support
dayjs.extend(utc);
dayjs.extend(duration);
dayjs.extend(localizedFormat);

// Load an example iCal file with various recurring events.
const data = ical.parseFile(path.join(__dirname, 'example-rrule.ics'));

// Extract VEVENT components for iteration.
const events = Object
  .values(data)
  .filter(item => item.type === 'VEVENT' && !item.recurrenceid);

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
const rangeStart = dayjs('2017-01-01').startOf('day');
const rangeEnd = dayjs('2017-12-31').endOf('day');

for (const event of events) {
  // Use expandRecurringEvent to handle all RRULE expansion, EXDATEs, and overrides
  const instances = ical.expandRecurringEvent(event, {
    from: rangeStart.toDate(),
    to: rangeEnd.toDate(),
  });

  // Print each instance with Day.js formatting
  for (const instance of instances) {
    const title = instance.summary;
    const startDate = dayjs(instance.start);
    const endDate = dayjs(instance.end);
    const duration = dayjs.duration(endDate.diff(startDate));

    console.log(`title:${title}`);
    console.log(`startDate:${startDate.format('LLLL')}`);
    console.log(`endDate:${endDate.format('LLLL')}`);
    console.log(`duration:${Math.floor(duration.asHours())}:${String(duration.minutes()).padStart(2, '0')} hours`);
    console.log();
  }
}
