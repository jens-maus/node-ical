// Convert xml-json raw conversion to hash for fast lookup
// Save as json for quick import when needed
const fs = require('fs');
const p = require('path');

const wtz = require(p.join(__dirname, 'windowsZones.json'));
const v = getObjects(wtz, 'name', 'mapZone');
const zoneTable = {};

function getObjects(object, key, value) {
  let objects = [];
  for (const i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }

    if (typeof object[i] === 'object') {
      objects = objects.concat(getObjects(object[i], key, value));
    } else if ((i === key && object[i] === value) || (i === key && value === '')) {
      // If key matches and value matches or if key matches and value is not passed (eliminating the case where key matches but passed value does not)
      objects.push(object);
    } else if (object[i] === value && key === '' && objects.lastIndexOf(object) === -1) {
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

const wtzOld = require(p.join(__dirname, 'build/windowsZonesOld.json'));
// Loop thru the old zones table
for (const key of Object.keys(wtzOld)) {
  // Get the new zone and look it up on the iana table
  // Look in new table for existing entry
  let wzone = zoneTable[key];
  // Look in old table for latest name
  const lookup = wtzOld[key];
  // Use latest name in original table to find  correct name
  let iana = zoneTable[lookup];
  //   Console.log(" lookup key="+key +" new ="+ lookup +"="+wzone+" iana="+(!iana? 'undefined':JSON.stringify(iana)))
  if (iana) {
    iana = iana.iana[0];
  }

  // If not set
  if (wzone === undefined) {
    // Initialize
    wzone = {iana: []}; // T, type: zone.attributes.territory};
  }

  if (wzone.iana.length === 0) {
    wzone.iana.push(iana);
  }

  if (iana !== null) {
  // Console.log("saving "+iana)
  // Save back new info using new key
    zoneTable[key] = wzone;
  }
}

fs.writeFileSync('windowsZones.json', JSON.stringify(zoneTable));
