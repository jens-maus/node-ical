// TypeScript usage example demonstrating VCALENDAR metadata access

import * as ical from 'node-ical';

// Example: Parse Google Calendar
const data = ical.sync.parseICS(`BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
X-WR-CALNAME:node-ical test
X-WR-TIMEZONE:Europe/Moscow
X-WR-CALDESC:A simple calendar to test node-ical parser
BEGIN:VEVENT
DTSTART:20240101T100000Z
DTEND:20240101T110000Z
SUMMARY:Test Event
UID:test-event-1
END:VEVENT
END:VCALENDAR`);

// Access VCALENDAR properties via vcalendar object
if (data.vcalendar) {
  // TypeScript knows these properties exist!
  const calendarName: string | undefined = data.vcalendar['WR-CALNAME'];
  const timezone: string | undefined = data.vcalendar['WR-TIMEZONE'];
  const description: string | undefined = data.vcalendar['WR-CALDESC'];
  const {version} = data.vcalendar;
  const {method} = data.vcalendar;

  console.log('Calendar Name:', calendarName);
  console.log('Timezone:', timezone);
  console.log('Description:', description);
  console.log('Version:', version);
  console.log('Method:', method);
}

// Access events as before
for (const uid in data) {
  if (!Object.hasOwn(data, uid)) {
    continue;
  }

  const component = data[uid];
  if (component && typeof component === 'object' && 'type' in component && component.type === 'VEVENT') {
    console.log('Event:', component.summary);
  }
}
