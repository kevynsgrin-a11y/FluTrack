import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultCard, sourceChip, shareText } from '../src/scripts/report-render.js';
import { buildAreaPayload, meaningLine } from '../src/server/area.js';
import { communitySummary } from '../src/server/community.js';
import { reportSection } from '../build/lib/report-section.mjs';
import { SYMPTOM_KEYS } from '../src/scripts/report-schema.js';

const NOW = new Date('2026-10-09T12:00:00Z');
const entry = (source, week, readings, series = {}) => ({ source, system: source.split('_')[0].toUpperCase(), label: source, dataset: 'x', week_ending: week, fetched_at: '2026-10-09T03:00:00Z', method_version: null, readings, series });
const location = { state: 'CA', state_name: 'California', county_fips: '06001', county_name: 'Alameda County', source: 'zip' };

function payload({ stale = false, community } = {}) {
  const week = stale ? '2026-09-12' : '2026-09-26';
  return buildAreaPayload({
    location,
    level: { level: 1, label: 'Low', trend: 'up', week_ending: '2026-10-03', kind: 'live', stale: false },
    stateDoc: {
      sources: {
        nhsn_levels: entry('nhsn_levels', '2026-09-26', [{ pathogen: 'influenza', metric: 'admissions_per_100k', value: 0.99, level_label: 'Very Low' }], {
          'influenza:admissions_per_100k': [0.5, 0.6, 0.8, 0.99].map((value, i) => ({ week_ending: `2026-09-0${i + 1}`, value })),
        }),
      },
    },
    countyDoc: { sources: { nwss_wval: entry('nwss_wval', week, [{ pathogen: 'influenza', metric: 'wval', value: 9.25, level_label: 'Moderate' }, { pathogen: 'influenza', metric: 'site_count', value: 2 }]) } },
    community: community || communitySummary({ n: 2 }, null, 'Alameda County'),
    now: NOW,
  });
}

test('the result card leads with official data, then community, with chips, emergency line and disclaimer', () => {
  const html = resultCard(payload());
  const at = (s) => html.indexOf(s);
  assert.ok(at('Respiratory level') < at('Flu hospital admissions') && at('Flu hospital admissions') < at('Wastewater') && at('Wastewater') < at('Community reports'));
  assert.match(html, /0\.99 per 100,000 people/);
  assert.match(html, /role="img" aria-label="Flu admissions per 100,000, 4 reported periods/);
  assert.match(html, /WVAL 9\.3/);
  assert.match(html, /Fewer than 5 reports this week — be one of the first in Alameda County/);
  assert.match(html, /CDC NHSN admissions · state<\/span><span>week ending Sep 26, 2026<\/span><span>retrieved Oct 9, 2026<\/span>/);
  assert.match(html, /call 911/);
  assert.match(html, /Not medical advice/);
  assert.doesNotMatch(html, /ad-slot|Advertisement/);
  assert.doesNotMatch(html, /\blive\b|real-time/i, 'never "live" or "real-time"');
  assert.match(html, /data-globe/);
});

test('data more than 14 days old is flagged amber; stale wastewater reads as "no recent data", never zero', () => {
  const p = payload({ stale: true });
  assert.equal(p.highlights.wastewater_flu.stale, true);
  const html = resultCard(p);
  assert.match(html, /No recent wastewater data — the last report was for the week ending Sep 12, 2026/);
  assert.match(html, /data-stale="true"/);
});

test('missing county wastewater does not assert an absence of sites or low activity', () => {
  const p = payload();
  p.highlights.wastewater_flu = null;
  assert.match(resultCard(p), /No usable wastewater reading is available from sites serving this county/);
  assert.match(resultCard(p), /Missing data does not mean low viral activity/);
});

test('source chips name the system, the week ending, the fetch date and the age', () => {
  const html = sourceChip({ system: 'NWSS', short: 'NWSS wastewater', week_ending: '2026-09-26', fetched_at: '2026-10-09T01:00:00Z', age_days: 13, stale: false });
  assert.match(html, /CDC NWSS wastewater/);
  assert.match(html, /13 days old/);
  assert.doesNotMatch(html, /data-stale/);
});

test('the share text carries the official level only — never symptoms', () => {
  const text = shareText(payload());
  assert.equal(text, 'Reported CDC-based respiratory index for California: Low, week ending Oct 3, 2026 — via FluTrack');
  assert.doesNotMatch(text, /fever|cough|sick|symptom|community/i);
});

test('"What this means" describes the data, never advises, never says outbreak', () => {
  const p = payload();
  assert.equal(p.meaning, 'The CDC-based respiratory index for California is low for the week ending Oct 3, 2026. Statewide flu hospital admissions were very low for the week ending Sep 26, 2026. Reporting wastewater sites serving Alameda County showed moderate flu A viral activity for the week ending Sep 26, 2026.');
  const quiet = meaningLine({ location, level: null, highlights: {} });
  assert.match(quiet, /No usable dated CDC-based respiratory index is available for California; current activity is unknown/);
  assert.doesNotMatch(p.meaning + quiet, /outbreak|should|recommend|stay home|see a doctor/i);
});

test('sample state fallback stays illustrative in the card, meaning and share text', () => {
  const p = payload();
  p.level.kind = 'sample';
  p.meaning = meaningLine({ location, level: p.level, highlights: {} });
  const html = resultCard(p);
  assert.match(html, /Low \(sample\)/);
  assert.match(html, /Illustrative sample data — demonstration only/);
  assert.match(p.meaning, /illustrative sample data/);
  assert.match(p.meaning, /week ending Oct 3, 2026/);
  assert.match(shareText(p), /Illustrative sample respiratory index/);
  assert.doesNotMatch(html + p.meaning + shareText(p), /this week(?:&#39;|')s CDC|CDC-based respiratory index for California: Low|rising/);
});

test('old state and hospitalization readings retain their separate periods without current reassurance', () => {
  const p = payload();
  p.level.stale = true;
  p.level.week_ending = '2026-09-05';
  p.highlights.nhsn_flu.stale = true;
  p.highlights.nhsn_flu.week_ending = '2026-08-29';
  p.meaning = meaningLine({ location, level: p.level, highlights: p.highlights });
  const html = resultCard(p);
  assert.match(html, /Historical Low/);
  assert.match(html, /Current activity is unknown/);
  assert.match(html, /Historical Very Low/);
  assert.match(html, /Statewide hospital admissions for week ending Aug 29, 2026/);
  assert.match(html, /Historical admission data/);
  assert.match(p.meaning, /last available CDC-based respiratory index.*week ending Sep 5, 2026/);
  assert.match(p.meaning, /admissions were very low for the week ending Aug 29, 2026; newer admission data is unavailable/);
  assert.match(shareText(p), /Historical.*Sep 5, 2026; current activity is unknown/);
  assert.doesNotMatch(p.meaning, /hospital admissions are/);
});

test('missing evidence and unknown provenance never render a reassuring state severity', () => {
  for (const level of [null, { level: null, label: 'No data', kind: 'live' }, { level: 0, label: 'Minimal', kind: 'unknown', week_ending: '2026-10-03' }]) {
    const p = payload();
    p.level = level;
    p.highlights = {};
    p.meaning = meaningLine({ location, level, highlights: {} });
    const html = resultCard(p);
    assert.match(html, /Current activity is unknown; missing data does not mean low activity/);
    assert.doesNotMatch(html, /level-token|is minimal|is low/);
    assert.match(shareText(p), /current activity is unknown/);
  }
});

test('wastewater measurement and geography remain distinct from admissions', () => {
  const html = resultCard(payload());
  assert.match(html, /reporting sampling sites serving this county/);
  assert.match(html, /WVAL is a viral activity index, not a percentage of people infected/);
  assert.match(html, /0\.99 per 100,000 people/);
  assert.match(html, /CDC NWSS wastewater · county/);
});

test('an elevated community block is labeled as unverified community data', () => {
  const html = resultCard(payload({ community: communitySummary({ n: 40, n_ili: 20, n_pos_flu: 3 }, { pct: 10, scope: 'county' }, 'Alameda County') }));
  assert.match(html, /Elevated community reports/);
  assert.match(html, /self-reported and not verified/);
  assert.match(html, /3 reported a positive flu test \(self-reported\)/);
});

test('the home section is a working no-JS form with every schema field, consent required', () => {
  const html = reportSection({ siteKey: '0x4AAA-test', enabled: true });
  assert.match(html, /<form method="get" action="\/api\/area"/);
  assert.match(html, /<form class="report__form" method="post" action="\/api\/report"/);
  for (const k of SYMPTOM_KEYS) assert.match(html, new RegExp(`name="${k}"`), k);
  for (const k of ['onset_bucket', 'age_band', 'vaccinated', 'test_type', 'test_result', 'household_sick', 'zip', 'website']) assert.match(html, new RegExp(`name="${k}"`), k);
  assert.match(html, /name="consent" value="1" required/);
  assert.match(html, /href="\/consumer-health-data-privacy\/"/);
  assert.match(html, /<button class="btn btn--primary btn--lg" type="submit" name="feeling" value="fine">I feel fine<\/button>/);
  assert.match(html, /data-sitekey="0x4AAA-test"/);
  assert.doesNotMatch(html, /<textarea|type="email"|name="name"/, 'no free text, email or name fields');
  assert.doesNotMatch(html, /challenges\.cloudflare\.com/, 'Turnstile is not loaded with the page');
});

test('without a Turnstile site key the report half says "opens soon" and posts nothing', () => {
  const html = reportSection({ siteKey: '' });
  assert.match(html, /open soon/);
  assert.doesNotMatch(html, /action="\/api\/report"/);
  assert.match(html, /action="\/api\/area"/, 'checking an area still works');
});
