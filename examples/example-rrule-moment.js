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
  const title = event.summary;
  let startDate = moment(event.start);
  let endDate = moment(event.end);

  // Calculate the duration of the event for use with recurring events.
  const duration = endDate.valueOf() - startDate.valueOf();

  // Simple case: no RRULE — print the single event.
  if (!event.rrule) {
    console.log(`title:${title}`);
    console.log(`startDate:${startDate.format('MMMM Do YYYY, h:mm:ss a')}`);
    console.log(`endDate:${endDate.format('MMMM Do YYYY, h:mm:ss a')}`);
    console.log(`duration:${moment.duration(duration).humanize()}`);
    console.log();
    continue;
  }

  // Expand RRULE start dates within the range, keying each occurrence by its exact start time.
  const instanceDates = new Map();
  for (const date of event.rrule.between(rangeStart.toDate(), rangeEnd.toDate(), true)) {
    const occurrence = moment(date);
    const iso = occurrence.toISOString();
    const lookupKey = iso.slice(0, 10);
    if (event.recurrences && event.recurrences[lookupKey]) {
      continue;
    }

    if (!instanceDates.has(iso)) {
      instanceDates.set(iso, {
        occurrenceStart: occurrence,
        lookupKey,
      });
    }
  }

  // Overrides may move an instance into range; merge by RECURRENCE-ID day so each occurrence prints once.
  if (event.recurrences) {
    for (const recurrence of Object.values(event.recurrences)) {
      const recurStart = recurrence?.start ? moment(recurrence.start) : null;
      const recurId = recurrence?.recurrenceid ? moment(recurrence.recurrenceid) : null;
      if (!recurStart?.isValid() || !recurId?.isValid()) {
        continue;
      }

      const insideRange = !recurStart.isBefore(rangeStart) && !recurStart.isAfter(rangeEnd);
      if (!insideRange) {
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
    .sort((a, b) => a.occurrenceStart.valueOf() - b.occurrenceStart.valueOf());

  for (const {occurrenceStart, lookupKey} of dates) {
    let curEvent = event;
    let showRecurrence = true;
    let curDuration = duration;

    startDate = occurrenceStart.clone();

    // Look up overrides/EXDATEs by date (YYYY-MM-DD), as represented by node-ical.
    const dateLookupKey = lookupKey;

    // Apply per-date override if present; otherwise check EXDATE.
    if (curEvent.recurrences && curEvent.recurrences[dateLookupKey]) {
      // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
      curEvent = curEvent.recurrences[dateLookupKey];
      startDate = moment(curEvent.start);
      const overrideEnd = curEvent.end ? moment(curEvent.end) : null;
      if (overrideEnd?.isValid()) {
        curDuration = overrideEnd.valueOf() - startDate.valueOf();
      }
    } else if (curEvent.exdate && curEvent.exdate[dateLookupKey]) {
      // If there's no recurrence override, check for an exception date. Exception dates represent exceptions to the rule.
      // This date is an exception date, which means we should skip it in the recurrence pattern.
      showRecurrence = false;
    }

    // Set the title and the end date from either the regular event or the recurrence override.
    const recurrenceTitle = curEvent.summary;
    endDate = moment(startDate.valueOf() + curDuration);

    // Skip instances outside the range after applying overrides.
    if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
      showRecurrence = false;
    }

    if (showRecurrence) {
      console.log(`title:${recurrenceTitle}`);
      console.log(`startDate:${startDate.format('MMMM Do YYYY, h:mm:ss a')}`);
      console.log(`endDate:${endDate.format('MMMM Do YYYY, h:mm:ss a')}`);
      console.log(`duration:${moment.duration(curDuration).humanize()}`);
      console.log();
    }
  }
}
