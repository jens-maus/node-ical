// Convert xml-json raw conversion to hash for fast lookup
// Save as json for quick import when needed
const fs = require('node:fs');
const p = require('node:path');
const process = require('node:process');

const wtz = require(p.join(__dirname, 'windowsZones.json'));
const v = getObjects(wtz, 'name', 'mapZone');
const zoneTable = {};

function getObjects(object, key, value) {
  let objects = [];
  for (const i in object) {
    if (!Object.hasOwn(object, i)) {
      continue;
    }

    if (typeof object[i] === 'object') {
      objects = objects.concat(getObjects(object[i], key, value));
    } else if ((i === key && object[i] === value) || (i === key && value === '')) {
      // If key matches and value matches or if key matches and value is not passed (eliminating the case where key matches but passed value does not)
      objects.push(object);
    } else if (object[i] === value && key === '' && !objects.includes(object)) {
      objects.push(object);
    }
  }

  return objects;
}

for (const zone of v) {
  // Get the object based on zone name
  //  let wzone = null;
  let wzone = zoneTable[zone.attributes.other];
  // If not set
  if (wzone === undefined) {
    // Initialize
    wzone = {iana: []}; // T, type: zone.attributes.territory};
  }

  for (const iana of zone.attributes.type.split(' ')) {
    // Only save the 1st IANA name, only one used in lookup
    if (wzone.iana.length === 0) {
      wzone.iana.push(iana);
    }
  }

  zoneTable[zone.attributes.other] = wzone;
}

// Legacy/display-name aliases -> canonical Windows ID map.
// Many ICS or MS products use human-readable labels instead of the Windows ID.
// We map those legacy labels to their canonical Windows ID and then resolve
// to the same primary IANA zone as the canonical entry.
const wtzOld = require(p.join(__dirname, 'build/windowsZonesOld.json'));
// Loop thru the legacy aliases table and merge into the zone table
const unresolvedLegacy = [];
let mergedLegacy = 0;
for (const key of Object.keys(wtzOld)) {
  const windowsId = wtzOld[key];
  const target = zoneTable[windowsId];
  const primaryIana = target && Array.isArray(target.iana) ? target.iana[0] : undefined;
  // Only add alias if we can resolve to a primary IANA zone
  if (primaryIana) {
    zoneTable[key] = {iana: [primaryIana]};
    mergedLegacy++;
  } else {
    unresolvedLegacy.push({label: key, windowsId});
  }
}

// Write JSON with one top-level property per line, values minified
{
  // Sort keys for deterministic output (stable diffs)
  const keys = Object.keys(zoneTable).sort();
  const lines = ['{'];
  for (const [index, key] of keys.entries()) {
    const value = JSON.stringify(zoneTable[key]); // Minified value
    const comma = index < keys.length - 1 ? ',' : '';
    lines.push(`  ${JSON.stringify(key)}: ${value}${comma}`);
  }

  lines.push('}');
  fs.writeFileSync('windowsZones.json', lines.join('\n') + '\n');
}

// Emit warnings (and optionally fail) for any unresolved legacy aliases
if (unresolvedLegacy.length > 0) {
  const header = `windowsZones: ${unresolvedLegacy.length} legacy alias(es) could not be resolved to a canonical Windows ID -> IANA mapping.`;
  console.warn(header);
  for (const {label, windowsId} of unresolvedLegacy) {
    console.warn(`  - Skipped legacy label ${JSON.stringify(label)} -> ${JSON.stringify(windowsId)} (no primary IANA found)`);
  }

  // In CI or when explicitly requested, fail hard to prevent regressions
  const strict = process.env.CI === 'true' || process.argv.includes('--strict');
  if (strict) {
    console.error('windowsZones: Failing build due to unresolved legacy aliases (strict mode).');
    process.exitCode = 1;
  }
} else if (mergedLegacy > 0) {
  // Helpful summary in non-verbose runs
  console.log(`windowsZones: merged ${mergedLegacy} legacy alias(es).`);
}
