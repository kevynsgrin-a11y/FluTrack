// ===========================================================================
// Cloudflare Pages Function — GET /api/official?state=CA&county=06073
//
// Official CDC data only (no community reports), CORS-open so schools, local
// news and pharmacies can embed it. Cached 15 minutes. Every source carries
// its own week_ending and fetched_at; attribution is required.
// ===========================================================================

import { json, AREA_CACHE } from '../../src/server/http.js';
import { isUsState, stateName, countyLabel } from '../../src/server/geo.js';
import { getOfficialDocs } from '../../src/server/area.js';
import { states } from '../../src/scripts/states-data.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const ATTRIBUTION =
  'Source: U.S. Centers for Disease Control and Prevention (data.cdc.gov), public domain. Compiled by FluTrack (flufollower.com), which is not affiliated with the CDC.';

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const state = String(url.searchParams.get('state') || '').toUpperCase();
  const county = url.searchParams.get('county');
  if (!isUsState(state)) {
    return json({ error: 'bad_state', message: 'Pass a 2-letter U.S. state code, e.g. ?state=CA' }, 400, CORS);
  }
  const fips = states.find((s) => s.abbr === state).fips;
  if (county != null && !(/^\d{5}$/.test(county) && county.startsWith(fips))) {
    return json({ error: 'bad_county', message: `county must be a 5-digit FIPS code in ${state}, e.g. ${fips}073` }, 400, CORS);
  }

  const docs = await getOfficialDocs(context.env, { state, county }, { ctx: context });
  return json(
    {
      state,
      state_name: stateName(state),
      county_fips: county || null,
      county_name: county ? countyLabel(county) : null,
      official: {
        state: docs.state?.sources || {},
        county: docs.county?.sources || {},
      },
      updated_at: docs.state?.updated_at || null,
      attribution: ATTRIBUTION,
      generated_at: new Date().toISOString(),
    },
    200,
    { ...CORS, 'Cache-Control': AREA_CACHE }
  );
}
