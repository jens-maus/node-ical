# Windows time zone mapping build files

This folder contains data and scripts used to generate `windowsZones.json`, the runtime lookup table for mapping Windows time zone identifiers and display-name aliases to IANA time zones.

## Files

- `update-windows-zones.mjs`: Node-only updater that fetches the upstream CLDR `windowsZones.xml` and regenerates `windowsZones.json` using fast-xml-parser.
- `windowsZonesOld.json`: A curated map of legacy Windows display-name labels (the human-readable aliases used by various Outlook/Exchange/ICS exporters) to the canonical Windows time zone IDs (e.g., `"(UTC+03:00) Tbilisi" -> "Georgian Standard Time"`).

## Why `windowsZonesOld.json` exists

CLDR provides a canonical mapping from Windows time zone IDs (e.g., `"Georgian Standard Time"`) to IANA zones (e.g., `Asia/Tbilisi`). However, real-world ICS files and Microsoft products often embed older or localized display-name labels instead of the canonical ID. Examples include:

- Historical labels with outdated UTC offsets
- Regional bundles (e.g., `"(UTC+04:00) Baku, Tbilisi, Yerevan"`) that later split
- Localized or product-specific strings

To keep `node-ical` resilient, we preserve a set of these legacy labels and map them to the modern Windows ID. During generation we then resolve those IDs to the primary IANA zone via CLDR.

## How generation works

1. `update-windows-zones.mjs` downloads CLDR `windowsZones.xml` and parses it directly.
2. It builds a `zoneTable` from CLDR, mapping Windows IDs to `{ iana: [primaryIana] }`.
3. It then loads `build/windowsZonesOld.json` and, for each legacy label (top-level key), looks up the canonical Windows ID (value) and injects a mapping entry into the final `zoneTable` so that legacy labels resolve to the same IANA zone as the canonical ID.
4. The script writes `windowsZones.json` in a one-entry-per-line format with sorted keys for stable diffs.

## Validation and strict mode

During the merge, any legacy alias whose Windows ID cannot be resolved to a primary IANA zone is skipped. The generator will:

- Print a warning for each skipped alias, and
- In strict mode, fail the build to prevent regressions.

Enable strict mode via the npm script or environment flag:

```bash
npm run build:strict
# or
CI=true npm run build
# or (low-level)
node build/update-windows-zones.mjs --strict
```

Note: CI runs the generator in strict mode to catch unresolved aliases early in pull requests.

## When to edit `windowsZonesOld.json`

- Add: When you encounter an ICS or MS product label that doesn’t resolve in `windowsZones.json`, add a key for that label with the value set to the canonical Windows ID.
- Update:
	- Offset-only correction (same region): If the label is conceptually right but the offset text is outdated/wrong (e.g., `"(UTC+03:00) Tbilisi"` → `"(UTC+04:00) Tbilisi"`), add the corrected label as an additional key and keep the legacy one for backward compatibility.
	- Fundamentally wrong mapping (different region): If the label refers to a different place/region entirely (e.g., `"(UTC-03:00) Buenos Aires"` → `"Azerbaijan Standard Time"`), replace/remove the wrong label and add the correct one instead.
- Remove: Only if a legacy label is provably harmful and should no longer resolve.

After changes, run the build to regenerate `windowsZones.json`:

```bash
npm run build
```
