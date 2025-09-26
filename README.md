# node-ical
[![Build](https://github.com/jens-maus/node-ical/workflows/CI/badge.svg)](https://github.com/jens-maus/node-ical/actions)
[![NPM version](https://img.shields.io/npm/v/node-ical.svg)](https://www.npmjs.com/package/node-ical)
[![Downloads](https://img.shields.io/npm/dm/node-ical.svg)](https://www.npmjs.com/package/node-ical)
[![Contributors](https://img.shields.io/github/contributors/jens-maus/node-ical.svg)](https://github.com/jens-maus/node-ical/graphs/contributors)
[![License](https://img.shields.io/github/license/jens-maus/node-ical.svg)](https://github.com/jens-maus/node-ical/blob/master/LICENSE)
[![Donate](https://img.shields.io/badge/donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=RAQSDY9YNZVCL)
[![GitHub stars](https://img.shields.io/github/stars/jens-maus/node-ical.svg?style=social&label=Star)](https://github.com/jens-maus/node-ical/stargazers/)

A minimal iCalendar/ICS (http://tools.ietf.org/html/rfc5545) parser for Node.js. This module is a direct fork
of the ical.js module by Peter Braden (https://github.com/peterbraden/ical.js) which is primarily targeted
for parsing iCalender/ICS files in a pure JavaScript environment. (ex. within the browser itself) This node-ical
module however, primarily targets Node.js use and allows for more flexible APIs and interactions within a Node environment. (like filesystem access!)

## Install
node-ical is availble on npm:
```sh
npm install node-ical
```

## API
The API has now been broken into three sections:
 - [sync](#sync)
 - [async](#async)
 - [autodetect](#autodetect)

`sync` provides synchronous API functions.
These are easy to use but can block the event loop and are not recommended for applications that need to serve content or handle events.

`async` provides proper asynchronous support for iCal parsing.
All functions will either return a promise for `async/await` or use a callback if one is provided.

`autodetect` provides a mix of both for backwards compatibility with older node-ical applications.

All API functions are documented using JSDoc in the [node-ical.js](node-ical.js) file.
This allows for IDE hinting!

### sync
```javascript
// import ical
const ical = require('node-ical');

// use the sync function parseFile() to parse this ics file
const events = ical.sync.parseFile('example-calendar.ics');
// loop through events and log them
for (const event of Object.values(events)) {
    console.log(
        'Summary: ' + event.summary +
        '\nDescription: ' + event.description +
        '\nStart Date: ' + event.start.toISOString() +
        '\n'
    );
};

// or just parse some iCalendar data directly
const directEvents = ical.sync.parseICS(`
BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:Hey look! An example event!
DTSTART;TZID=America/New_York:20130802T103400
DTEND;TZID=America/New_York:20130802T110400
LOCATION:1000 Broadway Ave.\, Brooklyn
DESCRIPTION: Do something in NY.
STATUS:CONFIRMED
UID:7014-1567468800-1567555199@peterbraden@peterbraden.co.uk
END:VEVENT
END:VCALENDAR
`);
// log the ids of these events
console.log(Object.keys(directEvents));
```

### async
```javascript
// import ical
const ical = require('node-ical');

// do stuff in an async function
;(async () => {
    // load and parse this file without blocking the event loop
    const events = await ical.async.parseFile('example-calendar.ics');

    // you can also use the async lib to download and parse iCal from the web
    const webEvents = await ical.async.fromURL('http://lanyrd.com/topics/nodejs/nodejs.ics');
    // you can pass standard fetch() options (e.g. headers, signal for timeout)
    // Example: 5s timeout
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5000);
    const headerWebEvents = await ical.async.fromURL(
        'http://lanyrd.com/topics/nodejs/nodejs.ics',
        { headers: { 'User-Agent': 'API-Example/1.0' }, signal: ac.signal }
    );

    // parse iCal data without blocking the main loop for extra-large events
    const directEvents = await ical.async.parseICS(`
BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:Hey look! An example event!
DTSTART;TZID=America/New_York:20130802T103400
DTEND;TZID=America/New_York:20130802T110400
DESCRIPTION: Do something in NY.
UID:7014-1567468800-1567555199@peterbraden@peterbraden.co.uk
END:VEVENT
END:VCALENDAR
    `);
})()
    .catch(console.error.bind());

// old fashioned callbacks cause why not

// parse a file with a callback
ical.async.parseFile('example-calendar.ics', function(err, data) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(data);
});

// or a URL
ical.async.fromURL('http://lanyrd.com/topics/nodejs/nodejs.ics', function(err, data) { console.log(data); });

// or directly
ical.async.parseICS(`
BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:Hey look! An example event!
DTSTART;TZID=America/New_York:20130802T103400
DTEND;TZID=America/New_York:20130802T110400
DESCRIPTION: Do something in NY.
UID:7014-1567468800-1567555199@peterbraden@peterbraden.co.uk
END:VEVENT
END:VCALENDAR
`, function(err, data) { console.log(data); });
```

Note: When using the `ical.async.*` functions in a separate async context from your main code,
errors will be thrown in that separate context. Therefore, you must wrap these function calls
in try/catch blocks to properly handle any errors. For example:

```javascript
try {
  const events = await ical.async.parseFile('calendar.ics');
  // Process events
} catch (error) {
  console.error('Failed to parse calendar:', error);
}
```

### autodetect
These are the old API examples, which still work and will be converted to the new API automatically.
Functions with callbacks provided will also have better performance over the older versions even if they use the old API.

Parses a string with ICS content in sync. This can block the event loop on big files.
```javascript
const ical = require('node-ical');
ical.parseICS(str);
```

Parses a string with ICS content in async to prevent the event loop from being blocked.
```javascript
const ical = require('node-ical');
ical.parseICS(str, function(err, data) {
    if (err) console.log(err);
    console.log(data);
});
```

Parses a string with an ICS file in sync. This can block the event loop on big files.
```javascript
const ical = require('node-ical');
const data = ical.parseFile(filename);
```

Parses a string with an ICS file in async to prevent event loop from being blocked.
```javascript
const ical = require('node-ical');
const data = ical.parseFile(filename, function(err, data) {
    if (err) console.log(err);
    console.log(data);
});
```

Reads in the specified iCal file from the URL, parses it and returns the parsed data.
```javascript
const ical = require('node-ical');
ical.fromURL(url, options, function(err, data) {
    if (err) console.log(err);
    console.log(data);
});
```

Fetch the specified URL using the native fetch API (```options``` are passed to the underlying `fetch()` call) and call the function with the result (either an error or the data). Requires Node.js 18+ (or any environment that provides a global `fetch`).

#### Example: Print list of upcoming node conferences

See [`examples/example.js`](./examples/example.js) for a synchronous example script.

```javascript
const ical = require('node-ical');
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

ical.fromURL('http://lanyrd.com/topics/nodejs/nodejs.ics', {}, function (err, data) {
    for (let k in data) {
        if (data.hasOwnProperty(k)) {
            const ev = data[k];
            if (data[k].type == 'VEVENT') {
                console.log(`${ev.summary} is in ${ev.location} on the ${ev.start.getDate()} of ${months[ev.start.getMonth()]} at ${ev.start.toLocaleTimeString('en-GB')}`);
            }
        }
    }
});
```

### Recurrence rule (RRULE) and Timezone Handling

When expanding recurrences (RRULEs), node-ical takes the timezone from the DTSTART field into account:

- **If a timezone is present in DTSTART**, all recurrence dates are calculated in that timezone.
- **If no timezone is present**, recurrences are calculated in UTC. The original offset from DTSTART and the current offset of the recurrence date are considered.
- For correct results in complex timezone scenarios, always specify the timezone explicitly in DTSTART.

### Working with the parsed dates

- Every parsed `start`/`end` value is a JavaScript `Date` that represents the **exact instant in UTC**. When DTSTART carries an IANA timezone, the parser attaches a non-enumerable `tz` property (for example `event.start.tz === 'Europe/Zurich'`). All-day values also expose `dateOnly === true`, which makes it easy to distinguish floating all-day events from timed ones.
- Prior to v0.22, all-day DTSTART values were normalised to `00:00:00Z` and their timezone metadata was lost. The modern behaviour preserves the original instant *and* its timezone, which keeps RRULE expansions and DST transitions correct. Treat this as a breaking behaviour change when migrating from older releases.
- To render the day in the originating timezone (for example, to display an all-day event on “25 March” in its local time), derive it explicitly:

    ```js
    const localDay = new Intl.DateTimeFormat('de-CH', {
        timeZone: event.start.tz ?? 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(event.start);
    ```

    If your runtime ships [Temporal](https://tc39.es/proposal-temporal/), you can also round-trip via:

    ```js
    const zoned = Temporal.ZonedDateTime.from({
        timeZone: event.start.tz ?? 'UTC',
        instant: Temporal.Instant.fromEpochMilliseconds(event.start.valueOf()),
    }).startOfDay();
    ```

Consumers that previously relied on implicit midnight UTC should update their handling to restore the local day using the attached timezone.

See the following example scripts for practical demonstration:
- [`examples/example-rrule-basic.js`](./examples/example-rrule-basic.js) – minimal RRULE expansion with native `Date`
- [`examples/example-rrule-moment.js`](./examples/example-rrule-moment.js)
- [`examples/example-rrule-luxon.js`](./examples/example-rrule-luxon.js)
- [`examples/example-rrule-dayjs.js`](./examples/example-rrule-dayjs.js)
- [`examples/example-rrule-datefns.js`](./examples/example-rrule-datefns.js)
- [`examples/example-rrule-vanilla.js`](./examples/example-rrule-vanilla.js)

Each library may display timezones differently, but the recurrence logic is the same.

## Under the hood

**Windows/IANA time zones**: node-ical maps Windows time zone IDs and common legacy display-name labels to IANA via a generated `windowsZones.json`. It’s built from CLDR (`windowsZones.xml`) and augmented with legacy aliases for resilience; see `build/README.md` for details.
