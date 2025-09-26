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
const events = Object
  .values(data)
  .filter(item => item.type === 'VEVENT' && !item.recurrenceid);

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
const rangeStart = new Date('2017-01-01T00:00:00.000Z');
const rangeEnd = new Date('2017-12-31T23:59:59.999Z');

for (const event of events) {
  const title = event.summary;
  let startDate = new Date(event.start);
  let endDate = new Date(event.end);

  // Calculate the duration of the event for use with recurring events.
  const duration = endDate.getTime() - startDate.getTime();

  // Simple case: no RRULE — print the single event.
  if (!event.rrule) {
    console.log(`title:${title}`);
    console.log(`startDate:${formatDate(startDate)}`);
    console.log(`endDate:${formatDate(endDate)}`);
    console.log(`duration:${formatDuration(duration)}`);
    console.log();
    continue;
  }

  // Expand RRULE start dates within the range, keying each occurrence by its exact start time.
  const instanceDates = new Map();
  for (const date of event.rrule.between(rangeStart, rangeEnd, true)) {
    const iso = date.toISOString();
    const lookupKey = iso.slice(0, 10);
    if (event.recurrences && event.recurrences[lookupKey]) {
      continue;
    }

    if (!instanceDates.has(iso)) {
      instanceDates.set(iso, {
        occurrenceStart: new Date(date),
        lookupKey,
      });
    }
  }

  // Overrides may move an instance into range; merge by RECURRENCE-ID day so each occurrence prints once.
  if (event.recurrences) {
    for (const recurrence of Object.values(event.recurrences)) {
      const recurStart = recurrence?.start instanceof Date ? new Date(recurrence.start) : undefined;
      const recurId = recurrence?.recurrenceid instanceof Date ? new Date(recurrence.recurrenceid) : undefined;
      if (!recurStart || !recurId) {
        continue;
      }

      if (recurStart < rangeStart || recurStart > rangeEnd) {
        continue;
      }

      const recurIso = recurId.toISOString();
      instanceDates.set(recurIso, {
        occurrenceStart: recurStart,
        lookupKey: recurIso.slice(0, 10),
      });
    }
  }

  // Build and print each resulting instance in chronological order.
  const dates = Array
    .from(instanceDates.values())
    .sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());

  for (const {occurrenceStart, lookupKey} of dates) {
    let curEvent = event;
    let showRecurrence = true;
    let curDuration = duration;

    startDate = new Date(occurrenceStart);

    // Look up overrides/EXDATEs by date (YYYY-MM-DD), as represented by node-ical.
    const dateLookupKey = lookupKey;

    // Apply per-date override if present; otherwise check EXDATE.
    if (curEvent.recurrences && curEvent.recurrences[dateLookupKey]) {
      // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
      curEvent = curEvent.recurrences[dateLookupKey];
      startDate = new Date(curEvent.start);
      curDuration = new Date(curEvent.end).getTime() - startDate.getTime();
    } else if (curEvent.exdate && curEvent.exdate[dateLookupKey]) {
      // If there's no recurrence override, check for an exception date. Exception dates represent exceptions to the rule.
      // This date is an exception date, which means we should skip it in the recurrence pattern.
      showRecurrence = false;
    }

    // Set the title and the end date from either the regular event or the recurrence override.
    const recurrenceTitle = curEvent.summary;
    endDate = new Date(startDate.getTime() + curDuration);

    // Skip instances outside the range after applying overrides.
    if (endDate < rangeStart || startDate > rangeEnd) {
      showRecurrence = false;
    }

    if (showRecurrence) {
      console.log(`title:${recurrenceTitle}`);
      console.log(`startDate:${formatDate(startDate)}`);
      console.log(`endDate:${formatDate(endDate)}`);
      console.log(`duration:${formatDuration(curDuration)}`);
      console.log();
    }
  }
}
