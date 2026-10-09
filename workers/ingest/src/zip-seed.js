// ===========================================================================
// ZIP → county crosswalk seed for D1 zip_crosswalk.
//
// Source: U.S. Census Bureau 2020 ZCTA-to-county relationship file (public
// domain). One county per ZIP: the county holding the largest land-area share
// of the ZCTA. HUD's USPS crosswalk (largest residential share) is the better
// source and is supported by src/server/geo.js crosswalkFromHud(); it needs a
// free HUD API token — see FOLLOWUPS.md.
//
// Run once (and after a Census refresh): POST /__seed-zip with INGEST_TOKEN.
// ===========================================================================

import { crosswalkFromCensus } from '../../../src/server/geo.js';
import { sqlLiteral } from '../../../src/server/official-store.js';

export const CENSUS_ZCTA_COUNTY =
  'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt';

export function crosswalkStatements(rows, perStatement = 400) {
  const cols = ['zip5', 'county_fips', 'state', 'zip3', 'zip3_pop_over_20k'];
  const out = [];
  for (let i = 0; i < rows.length; i += perStatement) {
    const values = rows
      .slice(i, i + perStatement)
      .map((r) => `(${cols.map((c) => sqlLiteral(r[c])).join(',')})`)
      .join(',');
    out.push(
      `INSERT INTO zip_crosswalk (${cols.join(',')}) VALUES ${values} ON CONFLICT(zip5) DO UPDATE SET ` +
        `county_fips=excluded.county_fips, state=excluded.state, zip3=excluded.zip3, zip3_pop_over_20k=excluded.zip3_pop_over_20k`
    );
  }
  return out;
}

export async function seedZipCrosswalk(env, { fetchImpl = fetch, url = CENSUS_ZCTA_COUNTY } = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'flutrack-ingest (+https://flufollower.com/)' } });
  if (!res.ok) throw new Error(`Census relationship file: HTTP ${res.status}`);
  const rows = crosswalkFromCensus(await res.text());
  if (rows.length < 30000) throw new Error(`Census relationship file parsed to only ${rows.length} ZIPs; refusing to seed`);
  const sql = crosswalkStatements(rows);
  for (let i = 0; i < sql.length; i += 20) {
    await env.DB.batch(sql.slice(i, i + 20).map((s) => env.DB.prepare(s)));
  }
  return { zips: rows.length, statements: sql.length };
}
