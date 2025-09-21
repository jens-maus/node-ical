// Update windowsZones.json from the upstream CLDR windowsZones.xml using fast-xml-parser.
// This replaces the old xml-js CLI + shell script pipeline with a single cross-platform Node script.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {XMLParser} from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_URL = 'https://raw.githubusercontent.com/unicode-org/cldr/master/common/supplemental/windowsZones.xml';
const OLD_MAP_PATH = path.join(__dirname, 'windowsZonesOld.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'windowsZones.json');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, response => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Follow redirect
          fetchText(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} when fetching ${url}`));
          response.resume();
          return;
        }

        let data = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function parseXmlToDoc(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    parseTagValue: false,
  });
  return parser.parse(xml);
}

function extractMapZones(doc) {
  return toArray(doc?.supplementalData?.windowsZones?.mapTimezones?.mapZone);
}

function buildZoneTable(zones) {
  const zoneTable = {};
  for (const z of zones) {
    const other = z?.other;
    const typeString = z?.type || '';
    if (!other || typeof typeString !== 'string') {
      continue;
    }

    const firstIana = typeString.split(' ').find(Boolean);
    if (!firstIana) {
      continue;
    }

    let entry = zoneTable[other];
    entry ||= {iana: []};
    if (entry.iana.length === 0) {
      entry.iana.push(firstIana);
    }

    zoneTable[other] = entry;
  }

  return zoneTable;
}

function readOldMap(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function getFirstIanaFromLookup(table, lookupKey) {
  const mapped = table[lookupKey];

  return mapped && Array.isArray(mapped.iana) ? mapped.iana[0] : undefined;
}

function mergeLegacyOverrides(zoneTable, oldMap) {
  if (!oldMap) {
    return {zoneTable, unresolved: [], merged: 0};
  }

  const unresolved = [];
  let merged = 0;
  for (const key of Object.keys(oldMap)) {
    const iana = getFirstIanaFromLookup(zoneTable, oldMap[key]);
    if (iana) {
      zoneTable[key] = {iana: [iana]};
      merged++;
    } else {
      unresolved.push({label: key, windowsId: oldMap[key]});
    }
  }

  return {zoneTable, unresolved, merged};
}

function writeOutput(filePath, data) {
  // Deterministic, diff-friendly: one top-level key per line, minified values, sorted keys
  const keys = Object.keys(data).sort();
  const lines = ['{'];
  for (const [idx, key] of keys.entries()) {
    const comma = idx < keys.length - 1 ? ',' : '';
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(data[key])}${comma}`);
  }

  lines.push('}');
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

try {
  const xml = await fetchText(SOURCE_URL);
  const doc = parseXmlToDoc(xml);
  const zones = extractMapZones(doc);
  const zoneTable = buildZoneTable(zones);
  const oldMap = readOldMap(OLD_MAP_PATH);
  const {zoneTable: merged, unresolved, merged: mergedCount} = mergeLegacyOverrides(zoneTable, oldMap);
  writeOutput(OUTPUT_PATH, merged);

  if (unresolved.length > 0) {
    console.warn(`windowsZones: ${unresolved.length} legacy alias(es) could not be resolved to a canonical Windows ID -> IANA mapping.`);
    for (const {label, windowsId} of unresolved) {
      console.warn(`  - Skipped legacy label ${JSON.stringify(label)} -> ${JSON.stringify(windowsId)} (no primary IANA found)`);
    }

    const strict = process.env.CI === 'true' || process.argv.includes('--strict');
    if (strict) {
      console.error('windowsZones: Failing build due to unresolved legacy aliases (strict mode).');
      process.exitCode = 1;
    }
  } else if (mergedCount > 0) {
    console.log(`windowsZones: merged ${mergedCount} legacy alias(es).`);
  }

  console.log(`Wrote ${OUTPUT_PATH}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
