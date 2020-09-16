// Convert xml-json raw conversion to hash for fast lookup
// Save as json for quick import when needed
const fs = require('fs');

const p = require('path');

const wtz = JSON.parse(fs.readFileSync(p.join(__dirname, 'windowsZones.json')));
const v = getObjects(wtz, 'name', 'mapZone');
zoneTable = {};

function getObjects(obj, key, val) {
    let objects = [];
    for (const i in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, i)) {
            continue;
        }
        if (typeof obj[i] === 'object') {
            objects = objects.concat(getObjects(obj[i], key, val));
        } else if ((i === key && obj[i] === val) || (i === key && val === '')) {
            // If key matches and value matches or if key matches and value is not passed (eliminating the case where key matches but passed value does not)
            objects.push(obj);
        } else if (obj[i] === val && key === '') {
            // Only add if the object is not already in the array
            if (objects.lastIndexOf(obj) === -1) {
                objects.push(obj);
            }
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
        wzone = { iana: [], type: zone.attributes.territory };
    }
    for (const iana of zone.attributes.type.split(' ')) {
        if (wzone.iana.indexOf(iana) === -1) {
            wzone.iana.push(iana);
        }
    }
    zoneTable[zone.attributes.other] = wzone;
}
fs.writeFileSync('windowsZones.json', JSON.stringify(zoneTable, ' ', 2));
