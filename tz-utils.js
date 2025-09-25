// Thin abstraction over moment-timezone to centralize all timezone logic
// This simplifies swapping to a different TZ library later.
// Also, this module can be mocked in tests to control timezone behavior.

const moment = require('moment-timezone');

function guessLocalZone() {
  return moment.tz.guess();
}

function getZoneNames() {
  return moment.tz.names();
}

function findExactZoneMatch(tz) {
  if (!tz) {
    return undefined;
  }

  return getZoneNames().find(zone => zone === tz);
}

function isValidIana(zone) {
  return Boolean(zone && moment.tz.zone(zone));
}

function parseDateTimeInZone(yyyymmddThhmmss, zone) {
  // Interpret the provided local wall time in the given IANA zone
  // and return a JS Date in UTC representing that instant.
  return moment.tz(yyyymmddThhmmss, 'YYYYMMDDTHHmmss', zone).toDate();
}

function parseWithOffset(yyyymmddThhmmss, offset) {
  // Offset like +hh:mm or -hh:mm
  return moment.parseZone(`${yyyymmddThhmmss}${offset}`, 'YYYYMMDDTHHmmssZ').toDate();
}

function utcAdd(date, amount, unit) {
  // Unit: 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds'
  return moment.utc(date).add(amount, unit).toDate();
}

function formatMMMMDoYYYY(date) {
  return moment(date).format('MMMM/Do/YYYY');
}

function linkAlias(arg1, arg2) {
  // Support both moment.tz.link('Etc/Unknown|Etc/GMT') and linkAlias('Etc/Unknown','Etc/GMT')
  if (arg2 === undefined) {
    return moment.tz.link(arg1);
  }

  return moment.tz.link(`${arg1}|${arg2}`);
}

// Public API
module.exports = {
  guessLocalZone,
  getZoneNames,
  findExactZoneMatch,
  isValidIana,
  parseDateTimeInZone,
  parseWithOffset,
  utcAdd,
  formatMMMMDoYYYY,
  linkAlias,
};
