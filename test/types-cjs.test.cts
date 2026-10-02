/* eslint-disable @typescript-eslint/no-require-imports */
import ical = require('node-ical');

export const parsed = ical.parseICS('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
