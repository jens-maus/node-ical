# node-ical
[![Build](https://github.com/jens-maus/node-ical/workflows/CI/badge.svg)](https://github.com/jens-maus/node-ical/actions)
[![NPM version](https://img.shields.io/npm/v/node-ical.svg)](https://www.npmjs.com/package/node-ical)
[![Downloads](https://img.shields.io/npm/dm/node-ical.svg)](https://www.npmjs.com/package/node-ical)
[![Contributors](https://img.shields.io/github/contributors/jens-maus/node-ical.svg)](https://github.com/jens-maus/node-ical/graphs/contributors)
[![License](https://img.shields.io/github/license/jens-maus/node-ical.svg)](https://github.com/jens-maus/node-ical/blob/master/LICENSE)
[![Donate](https://img.shields.io/badge/donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=RAQSDY9YNZVCL)
[![GitHub stars](https://img.shields.io/github/stars/jens-maus/node-ical.svg?style=social&label=Star)](https://github.com/jens-maus/node-ical/stargazers/)

A feature-rich iCalendar/ICS ([RFC 5545](https://tools.ietf.org/html/rfc5545)) parser for Node.js. Originally forked from [ical.js](https://github.com/peterbraden/ical.js) by Peter Braden, node-ical has evolved significantly to include robust recurrence rule (RRULE) expansion, timezone-aware date handling, exception dates (EXDATE), and recurrence overrides (RECURRENCE-ID). The library provides both synchronous and asynchronous APIs for parsing ICS files from strings, local files, and remote URLs – features specifically designed for Node.js environments.

## Install
node-ical is available on npm:
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
    const webEvents = await ical.async.fromURL('https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics');
    // you can pass standard fetch() options (e.g. headers, signal for timeout)
    // Example: 5s timeout
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5000);
    const headerWebEvents = await ical.async.fromURL(
        'https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics',
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
ical.async.fromURL('https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics', function(err, data) { console.log(data); });

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

See [`examples/example.mjs`](./examples/example.mjs) for a full example script.

> **Note:** This snippet uses `import` and top-level `await` (ESM). Save it as a `.mjs` file, or add `"type": "module"` to your `package.json`.

```javascript
import ical from 'node-ical';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' });

const data = await ical.fromURL('https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics');
for (const ev of Object.values(data)) {
  if (ev.type === 'VEVENT') {
    const when = ev.start ? dateFormat.format(ev.start) : 'unknown time';
    const where = ev.location ? ` in ${ev.location}` : '';
    console.log(`${ev.summary}${where} — ${when}`);
  }
}
```

### Recurrence rule (RRULE) and Timezone Handling

When expanding recurrences (RRULEs), node-ical takes the timezone from the DTSTART field into account:

- **If a timezone is present in DTSTART**, all recurrence dates are calculated in that timezone.
- **If no timezone is present**, recurrences are calculated in UTC. The original offset from DTSTART and the current offset of the recurrence date are considered.
- For correct results in complex timezone scenarios, always specify the timezone explicitly in DTSTART.

### Exception dates (EXDATE) and Recurrence overrides (RECURRENCE-ID)

node-ical provides RFC 5545-compliant handling of exception dates and recurrence overrides:

#### EXDATE – Excluding dates from recurrence

Exception dates are stored in an object with **dual-key access** for maximum flexibility:

```javascript
const event = data['some-recurring-event-uid'];

// Simple date-based lookup (works for all events)
if (event.exdate?.['2024-07-15']) {
  console.log('July 15th is excluded from this recurring event');
}

// Precise time-based lookup (for events recurring multiple times per day)
if (event.exdate?.['2024-07-15T14:00:00.000Z']) {
  console.log('Only the 2 PM instance on July 15th is excluded');
}
```

**How it works:**
- For `VALUE=DATE` (date-only): Only the date key is created (`YYYY-MM-DD`)
- For `VALUE=DATE-TIME`: **Both** date key and full ISO timestamp key are created
- Both keys reference the same `Date` object (no memory overhead)

**Why dual keys?**
- **Backward compatibility**: Existing code using date-only lookups continues to work
- **RFC 5545 compliance**: Supports precise exclusion of specific instances
- **Practical use**: Simple lookups for most cases, precise matching when needed

#### RECURRENCE-ID – Modifying specific instances

Recurrence overrides follow the same dual-key pattern:

```javascript
// Access override for entire day
const override = event.recurrences?.['2024-07-15'];

// Access override for specific time instance
const preciseOverride = event.recurrences?.['2024-07-15T14:00:00.000Z'];
```

### Expanding recurring events

For convenience, node-ical provides `expandRecurringEvent()` to expand recurring events into individual instances with proper handling of EXDATE, RECURRENCE-ID, and DST transitions:

```javascript
const ical = require('node-ical');
const events = ical.sync.parseFile('calendar.ics');
const event = Object.values(events).find(e => e.type === 'VEVENT' && e.rrule);

// Expand recurring event for next 30 days
const instances = ical.expandRecurringEvent(event, {
  from: new Date(),
  to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
});

// Each instance has all the information you need
instances.forEach(instance => {
  console.log(instance.summary);           // Event title
  console.log(instance.start);             // Start date/time
  console.log(instance.isFullDay);         // Whether it's an all-day event
  console.log(instance.isOverride);        // Whether it's a modified instance
});
```

**Options:**
- `from` / `to` – Date range to expand (inclusive)
- `includeOverrides` – Apply RECURRENCE-ID modifications (default: `true`)
- `excludeExdates` – Exclude EXDATE dates (default: `true`)
- `expandOngoing` – Include events starting before `from` but still ongoing (default: `false`)

**Key features:**
- DST-safe: Full-day events stay on the correct calendar day across timezone transitions
- Proper EXDATE and RECURRENCE-ID handling built-in
- Returns sorted array of instances with rich metadata
- Works with both recurring and non-recurring events

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

### TypeScript support

node-ical includes full TypeScript type definitions. See [`examples/example-typescript.ts`](./examples/example-typescript.ts) for a complete example showing type-safe access to calendar properties, including the `vcalendar` object for accessing calendar-level metadata like `WR-CALNAME`.

## Under the hood

**Windows/IANA time zones**: node-ical maps Windows time zone IDs and common legacy display-name labels to IANA via a generated `windowsZones.json`. It’s built from CLDR (`windowsZones.xml`) and augmented with legacy aliases for resilience; see `build/README.md` for details.
