// ===========================================================================
// Cloudflare Pages Function — GET /api/area?zip=
//
// "Check your area": official CDC data first, then the community block.
//   { location: { state, county_fips, county_name, source },
//     official: { <source>: { week_ending, fetched_at, … } },
//     community: { n, suppressed, pct_ili, n_pos_flu, badge, label },
//     meaning, … }
// Location: the ZIP if given, else Cloudflare's request.cf. A visitor outside
// the US without a ZIP gets 403 { error: "us_only" }.
//
// Caching: 15 minutes. A response for an explicit ZIP is public; one derived
// from the visitor's IP is `private`, so no shared cache can hand one person's
// approximate location to another.
// A no-JS GET (Accept: text/html) gets a server-rendered result page.
// ===========================================================================

import { json, html, AREA_CACHE } from '../../src/server/http.js';
import { resolveLocation } from '../../src/server/geo.js';
import { makeZipLookup } from '../../src/server/zip-lookup.js';
import { assembleArea } from '../../src/server/area.js';
import { resultPage, messagePage, stylesheetHref, PAGE_HEADERS } from '../../src/server/page.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const zip = url.searchParams.get('zip');
  const asHtml = (request.headers.get('accept') || '').includes('text/html') && url.searchParams.get('format') !== 'json';
  const cacheControl = zip ? AREA_CACHE : AREA_CACHE.replace('public', 'private');

  const resolved = await resolveLocation({ zip, cf: request.cf || {}, lookupZip: makeZipLookup(env, request), allowZipFromAbroad: true });
  if (!resolved.ok) {
    if (asHtml) {
      const css = await stylesheetHref(env, request);
      return html(messagePage({ title: resolved.error === 'us_only' ? 'US-only for now' : 'Check your area', message: resolved.message, css }), resolved.status, PAGE_HEADERS);
    }
    return json({ error: resolved.error, message: resolved.message }, resolved.status);
  }

  const payload = await assembleArea(context, resolved.location);
  if (asHtml) {
    const css = await stylesheetHref(env, request);
    return html(resultPage({ payload, css }), 200, { ...PAGE_HEADERS, 'Cache-Control': cacheControl.replace('public', 'private') });
  }
  return json(payload, 200, { 'Cache-Control': cacheControl, Vary: 'Accept' });
}
