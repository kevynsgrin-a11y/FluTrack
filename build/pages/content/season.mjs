import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand, trendDisclaimer } from '../../lib/partials.mjs';
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
    <p>Every week, FluTrack reads the CDC's public respiratory surveillance — emergency-department visit percentages, laboratory test positivity, and wastewater viral activity — and combines them into a single 0–4 threat level with a rising-or-falling trend, for every state. During the season those numbers move weekly; every figure on every page is labeled with the week it represents, and figures inside the usual one-to-two-week settling window are marked as still firming up.</p>
    <p>The clearest October signal for most states is usually <strong>wastewater viral activity</strong>: sewershed measurements are published for many parts of the country and often move before clinical reporting does, which makes them an early hint that a local rise may be starting — even while the combined index is still rated low.</p>

    <h2>Where to watch it</h2>
    <ul>
      <li><a href="/states/"><strong>Your state's page</strong></a> — the weekly threat level, trend, and per-pathogen read for flu, RSV, and COVID-19.</li>
      <li><a href="/metro/atlanta/">Atlanta</a>, <a href="/metro/boston/">Boston</a>, and <a href="/metro/bay-area/">SF Bay Area</a> — metro pages that pair the state-level read with the official metro-scale sources that exist, including wastewater programs.</li>
      <li><a href="/alerts/"><strong>Season alerts</strong></a> — sign up to hear when your state's level moves.</li>
      <li><a href="/methodology/">Methodology and data sources</a> — exactly which CDC systems feed the index and how they are combined.</li>
    </ul>

    <h2>Holiday weeks read lower than reality</h2>
    <p>The season's steepest stretch overlaps its least reliable reporting weeks. Around Thanksgiving, Christmas, and New Year, testing volume, care-seeking, and public-health publishing all drop — so surveillance for those weeks can read artificially low and then jump once reporting catches up. FluTrack labels those gaps rather than smoothing over them; a "falling" trend across a holiday week deserves skepticism in both directions.</p>

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
    body,
    changefreq: 'monthly',
    priority: 0.7,
    jsonld: [organizationLd()],
  };
}
