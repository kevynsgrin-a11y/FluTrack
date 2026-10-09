#!/usr/bin/env node
// ===========================================================================
// ZIP → county crosswalk tooling.
//
// Source of the committed src/data/zip-county.csv: U.S. Census Bureau, 2020
// ZCTA-to-county relationship file (public domain):
//   https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
// One county per ZIP — the county with the largest land-area share of the ZCTA
// (src/server/geo.js crosswalkFromCensus). PO-box-only ZIPs have no ZCTA and
// are absent; the API then asks for a nearby ZIP.
//
//   Regenerate the CSV from a downloaded relationship file:
//     node scripts/zip-crosswalk.mjs --census tab20_zcta520_county20_natl.txt
//   …or from a HUD-USPS ZIP-County crosswalk CSV (largest residential share):
//     node scripts/zip-crosswalk.mjs --hud ZIP_COUNTY_122025.csv
//   Emit SQL to seed D1 zip_crosswalk from the committed CSV:
//     node scripts/zip-crosswalk.mjs --sql > .cache/zip_crosswalk.sql
//     npx wrangler d1 execute flutrack-db --remote --file .cache/zip_crosswalk.sql
//   (The ingest Worker's POST /__seed-zip does the same from Census directly.)
// ===========================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crosswalkFromCensus, crosswalkFromHud, stateForCounty, RESTRICTED_ZIP3 } from '../src/server/geo.js';
import { crosswalkStatements } from '../workers/ingest/src/zip-seed.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = resolve(root, 'src/data/zip-county.csv');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

export function readCommittedCrosswalk(text = readFileSync(csvPath, 'utf8')) {
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [zip5, county_fips] = line.split(',');
      const zip3 = zip5.slice(0, 3);
      return { zip5, county_fips, state: stateForCounty(county_fips), zip3, zip3_pop_over_20k: RESTRICTED_ZIP3.has(zip3) ? 0 : 1 };
    })
    .filter((r) => r.state);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (arg('--census') || arg('--hud')) {
    const rows = arg('--census')
      ? crosswalkFromCensus(readFileSync(arg('--census'), 'utf8'))
      : crosswalkFromHud(readFileSync(arg('--hud'), 'utf8'));
    writeFileSync(csvPath, `zip5,county_fips\n${rows.map((r) => `${r.zip5},${r.county_fips}`).join('\n')}\n`);
    console.error(`wrote ${rows.length} ZIPs to src/data/zip-county.csv`);
  } else if (process.argv.includes('--sql')) {
    process.stdout.write(`${crosswalkStatements(readCommittedCrosswalk()).join(';\n')};\n`);
  } else {
    console.error('usage: --census <file> | --hud <file> | --sql');
    process.exit(2);
  }
}
