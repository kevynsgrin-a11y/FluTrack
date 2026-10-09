// ===========================================================================
// Cloudflare Pages Function — POST /api/report
//
// Accepts one anonymous symptom report (JSON from the widget, or a native
// form post from the no-JS page) and answers with the area payload.
//
// Gates, in order:
//   FEATURE_REPORT flag (503) → same-origin (403) → honeypot (accepted and
//   dropped) → US-only (403 us_only) → schema + consent (422) → Turnstile
//   (403) → per-ip_hash rate limit, 3/hour and 5/day (429) → location (422)
//
// Stored: the report fields from src/scripts/report-schema.js, the calendar
// day and ISO week, state, county FIPS, a ZIP3 only for areas over 20,000
// people, and sha256(IP + daily salt). Never stored: the IP, the ZIP5, a
// time of day, or any free text. Write-time burst/cluster checks quarantine a
// report (kept out of every aggregate) instead of rejecting it, so an
// attacker learns nothing from the response.
// ===========================================================================

import { json, html, isCrossOrigin, readBody, wantsHtml, reportEnabled } from '../../src/server/http.js';
import { parseReport } from '../../src/scripts/report-schema.js';
import { resolveLocation } from '../../src/server/geo.js';
import { makeZipLookup } from '../../src/server/zip-lookup.js';
import { verifyTurnstile } from '../../src/server/turnstile.js';
import { ipHash, checkRateLimit, burstCheck, utcDay, isoWeek } from '../../src/server/privacy.js';
import { assembleArea, countyDailyMean } from '../../src/server/area.js';
import { resultPage, messagePage, stylesheetHref, PAGE_HEADERS } from '../../src/server/page.js';

const PRODUCTION_HOSTS = new Set(['flufollower.com', 'www.flufollower.com']);

const INSERT_SQL = `INSERT INTO reports (id, created_day, iso_week, state, county_fips, zip3, feeling,
  fever, cough, sore_throat, body_aches, fatigue, congestion, headache, chills, gi, taste_smell, sob,
  onset_bucket, age_band, vaccinated, test_type, test_result, household_sick, ili, covid_like,
  ip_hash, quarantined, first_report)
  VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?)`;

async function respond(context, { status, error, message, payload, heading }, asHtml) {
  if (!asHtml) {
    return payload ? json({ ok: true, area: payload }, status) : json({ ok: false, error, message }, status);
  }
  const css = await stylesheetHref(context.env, context.request);
  const body = payload
    ? resultPage({ payload, heading, css })
    : messagePage({
        title: error === 'us_only' ? 'US-only for now' : 'We could not send your report',
        message,
        css,
        extra: '<p><a href="/#check-area">Go back</a></p>',
      });
  return html(body, status, PAGE_HEADERS);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const asHtml = wantsHtml(request);
  const fail = (status, error, message) => respond(context, { status, error, message }, asHtml);

  if (!reportEnabled(env)) return fail(503, 'reporting_paused', 'Symptom reporting is paused right now. You can still check your area.');
  if (isCrossOrigin(request)) return fail(403, 'cross_origin', 'Cross-origin submissions are not accepted.');
  if (!env.DB || !env.OFFICIAL_CACHE) return fail(503, 'not_configured', 'Symptom reporting is not switched on in this deployment yet.');

  let body;
  try {
    body = await readBody(request);
  } catch (e) {
    return fail(400, 'bad_body', 'Invalid request body.');
  }

  // Bots fill hidden fields. Accept and drop, so the bot learns nothing.
  if (String(body.website || '').trim()) {
    if (!asHtml) return json({ ok: true }, 202);
    const css = await stylesheetHref(env, request);
    return html(messagePage({ title: 'Thanks', message: 'Your report was received.', css }), 202, PAGE_HEADERS);
  }

  const cf = request.cf || {};
  if (cf.country && String(cf.country).toUpperCase() !== 'US') {
    return fail(403, 'us_only', 'FluFollower is US-only for now.');
  }

  const parsed = parseReport(body);
  if (!parsed.ok) {
    const msg = parsed.errors.includes('consent')
      ? 'Please tick the consent box so we can count your report.'
      : parsed.errors.includes('feeling')
        ? 'Please choose “I feel fine” or “I feel sick”.'
        : 'Some answers were not recognized. Please try again.';
    return fail(422, parsed.errors.includes('consent') ? 'consent_required' : 'invalid', msg);
  }

  const ip = request.headers.get('cf-connecting-ip') || '';
  const challenge = await verifyTurnstile({ token: body['cf-turnstile-response'], secret: env.TURNSTILE_SECRET, ip });
  if (!challenge.ok) {
    if (challenge.reason === 'not_configured') return fail(503, 'not_configured', 'Symptom reporting is not switched on in this deployment yet.');
    return fail(403, 'challenge_failed', 'We could not confirm you are not a bot. With JavaScript on, the check runs automatically — please try again.');
  }

  const now = new Date();
  const hash = await ipHash(env.OFFICIAL_CACHE, ip, now);
  const limit = await checkRateLimit(env.OFFICIAL_CACHE, hash, now);
  if (!limit.ok) return fail(429, 'rate_limited', 'You have sent several reports recently. Please try again later.');

  const resolved = await resolveLocation({ zip: body.zip, cf, lookupZip: makeZipLookup(env, request) });
  if (!resolved.ok) return fail(resolved.status, resolved.error, resolved.message);
  const loc = resolved.location;

  const preview = !PRODUCTION_HOSTS.has(new URL(request.url).hostname);
  const burst = await burstCheck(env.OFFICIAL_CACHE, { countyFips: loc.county_fips, asn: cf.asn, trailingDailyMean: await countyDailyMean(env, loc.county_fips, now) }, now);
  const r = parsed.report;
  await env.DB.prepare(INSERT_SQL)
    .bind(
      crypto.randomUUID(),
      utcDay(now),
      isoWeek(now),
      loc.state,
      loc.county_fips,
      loc.zip3,
      r.feeling,
      r.fever, r.cough, r.sore_throat, r.body_aches, r.fatigue, r.congestion, r.headache, r.chills, r.gi, r.taste_smell, r.sob,
      r.onset_bucket, r.age_band, r.vaccinated, r.test_type, r.test_result, r.household_sick, r.ili, r.covid_like,
      hash,
      burst || preview ? 1 : 0, // preview deployments never feed real aggregates
      body.returning === '1' || body.returning === true ? 0 : 1
    )
    .run();

  const payload = await assembleArea(context, loc, now);
  return respond(context, { status: 202, payload, heading: 'Thanks — your report was counted. Community numbers update once a day.' }, asHtml);
}
