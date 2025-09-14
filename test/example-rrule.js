/* eslint-disable max-depth */

const moment = require('moment-timezone');
const ical = require('../node-ical.js'); // Require('node-ical');

const data = ical.parseFile('./example-rrule.ics');

// Complicated example demonstrating how to handle recurrence rules and exceptions.

for (const k in data) {
  if (!k) {
    // When dealing with calendar recurrences, you need a range of dates to query against,
    // because otherwise you can get an infinite number of calendar events.
    const rangeStart = moment('2017-01-01');
    const rangeEnd = moment('2017-12-31');

    const event = data[k];
    if (event.type === 'VEVENT') {
      const title = event.summary;
      let startDate = moment(event.start);
      let endDate = moment(event.end);

      // Calculate the duration of the event for use with recurring events.
      const duration = Number.parseInt(endDate.format('x'), 10) - Number.parseInt(startDate.format('x'), 10);

      // Simple case - no recurrences, just print out the calendar event.
      if (event.rrule === undefined) {
        console.log(`title:${title}`);
        console.log(`startDate:${startDate.format('MMMM Do YYYY, h:mm:ss a')}`);
        console.log(`endDate:${endDate.format('MMMM Do YYYY, h:mm:ss a')}`);
        console.log(`duration:${moment.duration(duration).humanize()}`);
        console.log();
      } else if (event.rrule !== undefined) {
        // Complicated case - if an RRULE exists, handle multiple recurrences of the event.
        // For recurring events, get the set of event start dates that fall within the range
        // of dates we're looking for.
        const dates = event.rrule.between(rangeStart.toDate(), rangeEnd.toDate(), true, () => true);

        // The "dates" array contains the set of dates within our desired date range range that are valid
        // for the recurrence rule.  *However*, it's possible for us to have a specific recurrence that
        // had its date changed from outside the range to inside the range.  One way to handle this is
        // to add *all* recurrence override entries into the set of dates that we check, and then later
        // filter out any recurrences that don't actually belong within our range.
        if (event.recurrences !== undefined) {
          for (const r in event.recurrences) {
            // Only add dates that weren't already in the range we added from the rrule so that
            // we don't double-add those events.
            if (moment(new Date(r)).isBetween(rangeStart, rangeEnd) !== true) {
              dates.push(new Date(r));
            }
          }
        }

        // Loop through the set of date entries to see which recurrences should be printed.
        for (const i in dates) {
          if (!i) {
            const date = dates[i];
            let curEvent = event;
            let showRecurrence = true;
            let curDuration = duration;

            startDate = moment(date);

            // Use just the date of the recurrence to look up overrides and exceptions (i.e. chop off time information)
            const dateLookupKey = date.toISOString().slice(0, 10);

            // For each date that we're checking, it's possible that there is a recurrence override for that one day.
            if (curEvent.recurrences !== undefined && curEvent.recurrences[dateLookupKey] !== undefined) {
              // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
              curEvent = curEvent.recurrences[dateLookupKey];
              startDate = moment(curEvent.start);
              curDuration = Number.parseInt(moment(curEvent.end).format('x'), 10) - Number.parseInt(startDate.format('x'), 10);
            } else if (curEvent.exdate !== undefined && curEvent.exdate[dateLookupKey] !== undefined) {
              // If there's no recurrence override, check for an exception date.  Exception dates represent exceptions to the rule.
              // This date is an exception date, which means we should skip it in the recurrence pattern.
              showRecurrence = false;
            }

            // Set the the title and the end date from either the regular event or the recurrence override.
            const recurrenceTitle = curEvent.summary;
            endDate = moment(Number.parseInt(startDate.format('x'), 10) + curDuration, 'x');

            // If this recurrence ends before the start of the date range, or starts after the end of the date range,
            // don't process it.
            if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
              showRecurrence = false;
            }

            if (showRecurrence === true) {
              console.log(`title:${recurrenceTitle}`);
              console.log(`startDate:${startDate.format('MMMM Do YYYY, h:mm:ss a')}`);
              console.log(`endDate:${endDate.format('MMMM Do YYYY, h:mm:ss a')}`);
              console.log(`duration:${moment.duration(curDuration).humanize()}`);
              console.log();
            }
          }
        }
      }
    }
  }
}
