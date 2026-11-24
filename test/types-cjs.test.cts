/* eslint-disable @typescript-eslint/no-require-imports */
import ical = require('node-ical');

export const parsed = ical.parseICS('BEGIN:VCALENDAR\r\nEND:VCALENDAR');

export const numberOfGuests: ical.Attendee = {val: 'mailto:a@example.com', params: {'X-NUM-GUESTS': 2, RSVP: true}}; // eslint-disable-line @typescript-eslint/naming-convention
export const textOfGuests: ical.Attendee = {val: 'mailto:a@example.com', params: {'X-NUM-GUESTS': '02', RSVP: '', PARTSTAT: ''}}; // eslint-disable-line @typescript-eslint/naming-convention
