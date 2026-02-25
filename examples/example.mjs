/*
 * Example: Fetching and printing events from a remote calendar URL
 *
 * Shows how to retrieve an ICS file over HTTP and iterate over the
 * resulting VEVENT entries using the Promise-based API.
 */

import ical from '../node-ical.js';

const url = 'https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'short',
});

const data = await ical.fromURL(url);

for (const ev of Object.values(data)) {
  if (ev.type === 'VEVENT') {
    const when = ev.start ? dateFormat.format(ev.start) : 'unknown time';
    const where = ev.location ? ` in ${ev.location}` : '';
    console.log(`${ev.summary}${where} — ${when}`);
  }
}
