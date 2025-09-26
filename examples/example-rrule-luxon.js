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
const rangeStart = DateTime.fromISO('2017-01-01').startOf('day');
const rangeEnd = DateTime.fromISO('2017-12-31').endOf('day');

for (const event of events) {
  const title = event.summary;
  let startDate = DateTime.fromJSDate(event.start);
  let endDate = DateTime.fromJSDate(event.end);

  // Calculate the duration of the event for use with recurring events.
  const duration = endDate.diff(startDate);

  // Simple case: no RRULE — print the single event.
  if (!event.rrule) {
    console.log(`title:${title}`);
    console.log(`startDate:${startDate.toLocaleString(DateTime.DATETIME_FULL, {locale: 'en'})}`);
    console.log(`endDate:${endDate.toLocaleString(DateTime.DATETIME_FULL, {locale: 'en'})}`);
    console.log(`duration:${duration.toFormat('h:mm')} hours`);
    console.log();
    continue;
  }

  // Expand RRULE start dates within the range, keyed by calendar day to avoid duplicates.
  const instanceDates = new Map();
  for (const date of event.rrule.between(rangeStart.toJSDate(), rangeEnd.toJSDate(), true, () => true)) {
    const key = date.toISOString().slice(0, 10);
    if (!instanceDates.has(key)) {
      instanceDates.set(key, DateTime.fromJSDate(date));
    }
  }

  // Overrides may move an instance into range; merge by RECURRENCE-ID day so each occurrence prints once.
  if (event.recurrences) {
    for (const recurrence of Object.values(event.recurrences)) {
      const recurStart = recurrence?.start instanceof Date ? DateTime.fromJSDate(recurrence.start) : null;
      const recurId = recurrence?.recurrenceid instanceof Date ? DateTime.fromJSDate(recurrence.recurrenceid) : null;
      if (!recurStart || !recurId) {
        continue;
      }

      const insideRange = recurStart >= rangeStart && recurStart <= rangeEnd;
      const recurrenceKey = recurId.toISODate();
      if (insideRange && !instanceDates.has(recurrenceKey)) {
        instanceDates.set(recurrenceKey, recurId);
      }
    }
  }

  // Build and print each resulting instance in chronological order.
  const dates = Array
    .from(instanceDates.values())
    .sort((a, b) => a.toMillis() - b.toMillis());

  for (const date of dates) {
    let curEvent = event;
    let showRecurrence = true;
    let curDuration = duration;

    startDate = DateTime.isDateTime(date) ? date : DateTime.fromJSDate(date);

    // Look up overrides/EXDATEs by date (YYYY-MM-DD), as represented by node-ical.
    const dateLookupKey = startDate.toISODate();

    // Apply per-date override if present; otherwise check EXDATE.
    if (curEvent.recurrences && curEvent.recurrences[dateLookupKey]) {
      // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
      curEvent = curEvent.recurrences[dateLookupKey];
      startDate = DateTime.fromJSDate(curEvent.start);
      curDuration = DateTime.fromJSDate(curEvent.end).diff(startDate);
    } else if (curEvent.exdate && curEvent.exdate[dateLookupKey]) {
      // If there's no recurrence override, check for an exception date. Exception dates represent exceptions to the rule.
      // This date is an exception date, which means we should skip it in the recurrence pattern.
      showRecurrence = false;
    }

    // Set the title and the end date from either the regular event or the recurrence override.
    const recurrenceTitle = curEvent.summary;
    endDate = startDate.plus(curDuration);

    // Skip instances outside the range after applying overrides.
    if (endDate < rangeStart || startDate > rangeEnd) {
      showRecurrence = false;
    }

    if (showRecurrence) {
      console.log(`title:${recurrenceTitle}`);
      console.log(`startDate:${startDate.toLocaleString(DateTime.DATETIME_FULL, {locale: 'en'})}`);
      console.log(`endDate:${endDate.toLocaleString(DateTime.DATETIME_FULL, {locale: 'en'})}`);
      console.log(`duration:${curDuration.toFormat('h:mm')} hours`);
      console.log();
    }
  }
}
