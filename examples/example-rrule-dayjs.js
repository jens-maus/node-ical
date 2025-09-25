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
const timezone = require('dayjs/plugin/timezone');
const duration = require('dayjs/plugin/duration');
const relativeTime = require('dayjs/plugin/relativeTime');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const ical = require('../node-ical.js');

// Extend Day.js with plugins for timezone and duration support
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

// Load an example iCal file with various recurring events.
const data = ical.parseFile(path.join(__dirname, 'example-rrule.ics'));

// Extract VEVENT components for iteration.
const events = Object.values(data).filter(item => item.type === 'VEVENT');

// Use a fixed date range to keep expansion finite (recurrences can be unbounded).
const rangeStart = dayjs('2017-01-01');
const rangeEnd = dayjs('2017-12-31');

for (const event of events) {
  const title = event.summary;
  let startDate = dayjs(event.start);
  let endDate = dayjs(event.end);

  // Calculate the duration of the event for use with recurring events.
  const eventDuration = dayjs.duration(endDate.diff(startDate));

  // Simple case: no RRULE — print the single event.
  if (!event.rrule) {
    console.log(`title:${title}`);
    console.log(`startDate:${startDate.format('LLLL')}`);
    console.log(`endDate:${endDate.format('LLLL')}`);
    console.log(`duration:${Math.floor(eventDuration.asHours())}:${String(eventDuration.minutes()).padStart(2, '0')} hours`);
    console.log();
    continue;
  }

  // Expand RRULE start dates within the range.
  const dates = event.rrule.between(rangeStart.toDate(), rangeEnd.toDate(), true, () => true);

  // The dates array holds valid instances in-range. Overrides may move an instance into range,
  // so include override dates not already yielded by rrule (avoid duplicates).
  if (event.recurrences) {
    for (const r of Object.keys(event.recurrences)) {
      const rDate = new Date(r);
      const rDayjs = dayjs(rDate);
      // Avoid duplicates: only add if not already present from rrule.
      const insideRange = rDayjs.isAfter(rangeStart.subtract(1, 'day')) && rDayjs.isBefore(rangeEnd.add(1, 'day'));
      const alreadyPresent = dates.some(d => d.getTime() === rDate.getTime());
      if (insideRange && !alreadyPresent) {
        dates.push(rDate);
      }
    }
  }

  // Build and print each resulting instance.
  for (const date of dates) {
    let curEvent = event;
    let showRecurrence = true;
    let curDuration = eventDuration;

    startDate = dayjs(date);

    // Look up overrides/EXDATEs by date (YYYY-MM-DD), as represented by node-ical.
    const dateLookupKey = date.toISOString().slice(0, 10);

    // Apply per-date override if present; otherwise check EXDATE.
    if (curEvent.recurrences && curEvent.recurrences[dateLookupKey]) {
      // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
      curEvent = curEvent.recurrences[dateLookupKey];
      startDate = dayjs(curEvent.start);
      curDuration = dayjs.duration(dayjs(curEvent.end).diff(startDate));
    } else if (curEvent.exdate && curEvent.exdate[dateLookupKey]) {
      // If there's no recurrence override, check for an exception date. Exception dates represent exceptions to the rule.
      // This date is an exception date, which means we should skip it in the recurrence pattern.
      showRecurrence = false;
    }

    // Set the title and the end date from either the regular event or the recurrence override.
    const recurrenceTitle = curEvent.summary;
    endDate = startDate.add(curDuration.asMilliseconds(), 'millisecond');

    // Skip instances outside the range after applying overrides.
    if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
      showRecurrence = false;
    }

    if (showRecurrence) {
      console.log(`title:${recurrenceTitle}`);
      console.log(`startDate:${startDate.format('LLLL')}`);
      console.log(`endDate:${endDate.format('LLLL')}`);
      console.log(`duration:${Math.floor(curDuration.asHours())}:${String(curDuration.minutes()).padStart(2, '0')} hours`);
      console.log();
    }
  }
}
