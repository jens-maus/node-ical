/*
 * Example: Expanding recurring calendar events (using native JavaScript Date)
 *
 * This script shows how to turn VEVENTs (including recurring ones) into concrete
 * event instances within a given date range using only native JavaScript Date objects.
 * It demonstrates how to:
 *
 * - Expand RRULEs into individual dates within a range
 * - Apply per-date overrides (RECURRENCE-ID via `recurrences`)
 * - Skip exception dates (`exdate`)
 * - Print each instance with title, start/end time, and duration
 *
 * Why native Date? Sometimes you want minimal dependencies and are comfortable
 * with JavaScript's built-in Date API. This example shows that node-ical works
 * perfectly well without requiring any external date libraries.
 *
 * Why a date range? Recurring rules can describe infinite series. Limiting to a
 * fixed window (here: calendar year 2017) keeps expansion finite and practical.
 */

const path = require('node:path');
const ical = require('../node-ical.js');

// Helper function to format duration from milliseconds to hours:minutes
function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}:${String(minutes).padStart(2, '0')} hours`;
}

// Helper function to format date in a readable way
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// Load an example iCal file with various recurring events.
const data = ical.parseFile(path.join(__dirname, 'example-rrule.ics'));

// Extract VEVENT components for iteration.
const events = Object.values(data).filter(item => item.type === 'VEVENT');

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
const rangeStart = new Date('2017-01-01T00:00:00.000Z');
const rangeEnd = new Date('2017-12-31T23:59:59.999Z');

for (const event of events) {
  // Use expandRecurringEvent to handle RRULE expansion, EXDATE filtering, and RECURRENCE-ID overrides
  const instances = ical.expandRecurringEvent(event, {
    from: rangeStart,
    to: rangeEnd,
  });

  for (const instance of instances) {
    const startDate = instance.start;
    const endDate = instance.end;
    const duration = endDate.getTime() - startDate.getTime();

    console.log(`title:${instance.summary}`);
    console.log(`startDate:${formatDate(startDate)}`);
    console.log(`endDate:${formatDate(endDate)}`);
    console.log(`duration:${formatDuration(duration)}`);
    console.log();
  }
}
