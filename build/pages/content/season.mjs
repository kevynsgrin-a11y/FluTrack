import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand, trendDisclaimer, revisedOn } from '../../lib/partials.mjs';
import { organizationLd } from '../../lib/seo.mjs';

/**
 * 2026–27 flu season page. A data-framing page, not guidance: it describes the
 * well-documented seasonal shape of U.S. flu surveillance (timing of rise and
 * peak, reporting-season weeks, holiday gaps) and points readers at the parts
 * of FluTrack that carry the live read. The about page's editorial rule holds
 * here too — no advice about vaccination, testing, or treatment; prevention
 * questions route to the CDC, linked.
 */
export default function season(ctx) {
  const { site, disclaimers } = ctx;

  const body = `
  ${pageHeader({
    eyebrow: 'Season 2026–27',
    title: 'Flu season 2026–27: when activity rises, and how to read it here',
    lede:
      'U.S. flu activity follows a shape public-health agencies have documented for decades: quiet late-summer months, a rise that usually begins in October or November, a peak most often between December and February, and a tail that can run into May. Here is how that season shows up in the numbers this site reads — and where to watch it week by week.',
  })}

  ${prose(`
    <h2>When flu season starts — and when it peaks</h2>
    <p>The pattern the Centers for Disease Control and Prevention describe each year is consistent: influenza activity in the United States is low through late summer, most often begins to increase in <strong>October and November</strong>, and peaks <strong>most often between December and February</strong>, with activity sometimes continuing into May. The CDC's respiratory reporting season is built around that shape — weekly surveillance runs from early October (roughly MMWR week 40) through late May (week 20).</p>
    <p>No two seasons are identical. Some rise early and peak over the holidays; others stay quiet until January and peak in February, which is the single most common peak month. The year's timing is only knowable in retrospect — which is why this site shows what the current data says, not what a season is "supposed" to do.</p>

    <h2>What FluTrack shows during the season</h2>
    <p>FluTrack's implemented index feeds are CDC emergency-department visit percentages, the Acute Respiratory Illness activity level and wastewater viral activity. Available inputs form a combined respiratory index for flu, RSV and COVID-19; laboratory positivity is unavailable live and modeled only in labeled samples. The trend compares the latest observation with the mean of up to three prior observations. Observation periods, source publication dates and retrieval times are separate; a new build does not establish new health conditions.</p>
    <p>A seasonal calendar cannot establish the direction of COVID-19, influenza or RSV in a selected state. Read the dated by-virus observations and their coverage instead. Wastewater describes participating sewersheds, not every resident or a city infection count; missing or insufficient surveillance does not mean no illness.</p>

    <h2>Dated national COVID-19 context &mdash; October 2, 2026</h2>
    <p>In its <a href="https://www.cdc.gov/respiratory-viruses/data/" rel="noopener">national respiratory summary published October 2, 2026</a>, CDC said: &ldquo;COVID-19 activity remains elevated in some regions but is declining nationally.&rdquo; This is a dated national summary, not a current-week measurement or a trend for the selected state. A national decline can coexist with regional increases; it cannot replace the selected state's observation periods and coverage, or establish independently measured city conditions.</p>

    <h2>Where to watch it</h2>
    <ul>
      <li><a href="/states/"><strong>Your state's page</strong></a> — the weekly threat level, trend, and per-pathogen read for flu, RSV, and COVID-19.</li>
      <li><a href="/metro/atlanta/">Atlanta</a>, <a href="/metro/boston/">Boston</a>, and <a href="/metro/bay-area/">SF Bay Area</a> — metro pages that pair the state-level read with the official metro-scale sources that exist, including wastewater programs.</li>
      <li><a href="/alerts/"><strong>Season alerts</strong></a> — sign up to hear when your state's level moves.</li>
      <li><a href="/methodology/">Methodology and data sources</a> — exactly which CDC systems feed the index and how they are combined.</li>
    </ul>

    <h2>Reporting gaps and revisions</h2>
    <p>Care-seeking, testing volume and publication schedules can change around holidays. A missing or delayed report limits interpretation; it does not establish that illness declined. Check source dates and coverage before comparing observations, and allow for later revisions. FluTrack does not infer a local or national increase from the calendar or fill reporting gaps with reassuring conclusions.</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)} Questions about vaccination, testing, or treatment are medical questions — for those, FluTrack deliberately stays out of the way: the CDC's seasonal guidance (<a href="https://www.cdc.gov/flu/about/season/fluseason.htm" rel="noopener">cdc.gov/flu</a>) and your own clinician are the right sources.</p>
    </div>
  `)}

  ${trendDisclaimer()}
  ${signupBand()}
  `;

  return {
    title: 'Flu Season 2026–27: When It Starts, Peaks & How to Track It',
    description:
      'When does flu season start? The documented U.S. pattern — rising October–November, peak most often December–February, tail into May — plus where to watch the 2026–27 weekly read for your state.',
    path: '/season/2026-27/',
    lastmod: revisedOn('/season/2026-27/'),
    body,
    changefreq: 'monthly',
    priority: 0.7,
    jsonld: [organizationLd()],
  };
}
