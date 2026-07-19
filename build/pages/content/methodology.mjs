import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand, breadcrumbs } from '../../lib/partials.mjs';
import { breadcrumbLd, faqLd } from '../../lib/seo.mjs';

/**
 * /methodology/ — the primary trust page.
 *
 * Documents, verbatim, the constants and logic in src/scripts/threat-index.js:
 * the five severity levels, the signal weights (renormalized over available
 * signals), the composite 0–100 → level cut points, the per-signal breakpoint
 * bands, and the ±8% trend rule. Everything here is descriptive of the DATA —
 * no advice, no diagnosis, no prediction.
 */
export default function methodology(ctx) {
  const { site, disclaimers } = ctx;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Methodology', path: '/methodology/' },
  ];

  const faqs = methodologyFaqs(disclaimers);

  const content = `
    ${breadcrumbs(crumbs)}

    <p>The <strong>respiratory threat level</strong> is a single, plain-English answer to one
    question: how much flu, RSV and COVID-19 activity is the CDC's own surveillance data showing in
    a given state right now, and which way is it moving? Underneath that one word sits a small,
    deliberately boring pipeline. This page documents every constant in it, so you can check our
    work rather than take it on faith.</p>

    <p>Two principles guide the whole method. First, <strong>we only ever describe the data</strong> —
    the index summarizes reported activity; it is not a forecast, a case count, or clinical guidance.
    Second, <strong>every threshold is published</strong>. The numbers below are the actual values the
    code uses; they are FluTrack's transparent editorial thresholds, chosen to reflect typical seasonal
    ranges in the underlying CDC products. They are <em>not</em> CDC-defined cut points, and no U.S.
    government agency sets, reviews, or endorses them.</p>

    <div class="callout" role="note">
      <p class="callout__title">${icon('pulse')} The short version</p>
      <p>Four CDC signals are each scored 0&ndash;100, blended by a fixed weighting into one composite
      score, and that score is mapped to one of five levels &mdash; <strong>Minimal, Low, Moderate,
      High, Very High</strong>. A separate rule compares the most recent week against the prior few to
      label the trend <strong>Rising</strong>, <strong>Falling</strong>, or <strong>Holding steady</strong>.</p>
    </div>

    <h2>The five levels</h2>
    <p>Every score in FluTrack ultimately resolves to a level from 0 to 4. The composite is first
    expressed as a continuous score from 0 to 100, then bucketed at fixed cut points. A score sitting
    exactly on a boundary rounds up into the higher level.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Level</th><th scope="col">Label</th><th scope="col">Composite score (0&ndash;100)</th><th scope="col">In plain English</th></tr>
        </thead>
        <tbody>
          <tr><td>0</td><td><strong>Minimal</strong></td><td>0 &ndash; &lt;&nbsp;20</td><td>Little measurable respiratory activity in the data.</td></tr>
          <tr><td>1</td><td><strong>Low</strong></td><td>20 &ndash; &lt;&nbsp;40</td><td>Present but limited; typical of the shoulders of a season.</td></tr>
          <tr><td>2</td><td><strong>Moderate</strong></td><td>40 &ndash; &lt;&nbsp;60</td><td>Clearly elevated activity across the signals.</td></tr>
          <tr><td>3</td><td><strong>High</strong></td><td>60 &ndash; &lt;&nbsp;80</td><td>Widespread activity, in the range of a busy respiratory week.</td></tr>
          <tr><td>4</td><td><strong>Very High</strong></td><td>80 &ndash; 100</td><td>Among the most intense activity the signals register.</td></tr>
        </tbody>
      </table>
    </div>

    <h2>The four signals and their weights</h2>
    <p>FluTrack draws on four independent, public-domain CDC surveillance signals. Each is converted
    to its own 0&ndash;100 sub-score (see below), and the composite is a weighted average of whichever
    signals are present. The weights are fixed:</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Signal</th><th scope="col">CDC source</th><th scope="col">Weight</th><th scope="col">Why this weight</th></tr>
        </thead>
        <tbody>
          <tr><td>Wastewater viral activity (WVAL)</td><td>NWSS</td><td><strong>0.30</strong></td><td>Weighted highest: viral shedding measured in wastewater typically leads clinical reporting by roughly 5&ndash;7 days, so it is the earliest read on where activity is heading.</td></tr>
          <tr><td>Acute Respiratory Illness level</td><td>NSSP ARI</td><td><strong>0.25</strong></td><td>A broad categorical read on how busy respiratory care is, translated from the CDC's own activity label.</td></tr>
          <tr><td>Emergency-department visits</td><td>NSSP</td><td><strong>0.25</strong></td><td>A direct, hard measure of illness severe enough to send people to the ER.</td></tr>
          <tr><td>Laboratory test positivity</td><td>NREVSS</td><td><strong>0.20</strong></td><td>Weighted lowest: positivity reflects testing behavior &mdash; who chooses to get tested &mdash; as much as underlying prevalence, so it is the noisiest of the four.</td></tr>
        </tbody>
      </table>
    </div>
    <p>Signals are frequently missing for a particular state and week. Rather than penalize a state
    for a gap in federal reporting, FluTrack <strong>renormalizes the weights over whatever signals are
    actually present</strong>. If, say, positivity is unavailable, the remaining three weights
    (0.30&nbsp;+&nbsp;0.25&nbsp;+&nbsp;0.25&nbsp;=&nbsp;0.80) are used as the denominator, so the composite
    is always a proper weighted average of the data on hand. FluTrack records which signals contributed
    to each result.</p>

    <h3>How the ARI activity label is mapped</h3>
    <p>The NSSP Acute Respiratory Illness product is categorical, not numeric. FluTrack maps its labels
    to the 0&ndash;4 scale as follows: <em>Minimal</em> or <em>Very Low</em> &rarr; 0, <em>Low</em> &rarr; 1,
    <em>Moderate</em> or <em>Medium</em> &rarr; 2, <em>High</em> &rarr; 3, and <em>Very High</em> or
    <em>Extremely High</em> &rarr; 4. That level is then represented by its band midpoint score
    (10, 30, 50, 70 or 90) before entering the weighted average.</p>

    <h2>From a raw reading to a 0&ndash;100 sub-score</h2>
    <p>Each numeric signal is turned into a 0&ndash;100 sub-score by anchoring its breakpoints to the
    level boundaries and interpolating linearly between them. Concretely, a reading of 0 scores 0, and
    the four breakpoints map to sub-scores of 20, 40, 60 and 80 respectively &mdash; the exact boundaries
    between Minimal, Low, Moderate, High and Very High. A reading landing halfway between two breakpoints
    scores halfway between their boundary values. Readings above the top breakpoint ramp from 80 toward
    100 over one additional breakpoint-width. This keeps the smooth composite perfectly consistent with
    the discrete level bands in the table above.</p>

    <h2>The breakpoints</h2>
    <p>These are the thresholds that separate the five levels for each signal. A reading at or above a
    breakpoint moves up into the next level. Units are noted per row. Again: these are FluTrack's
    editorial thresholds, informed by typical seasonal ranges in the CDC products &mdash; not official
    CDC cut points.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col">Unit</th>
            <th scope="col">Minimal</th>
            <th scope="col">Low</th>
            <th scope="col">Moderate</th>
            <th scope="col">High</th>
            <th scope="col">Very High</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Wastewater (WVAL index)</th>
            <td>index</td>
            <td>&lt;&nbsp;3</td><td>3&nbsp;&ndash;&nbsp;5</td><td>5&nbsp;&ndash;&nbsp;7</td><td>7&nbsp;&ndash;&nbsp;8.5</td><td>&ge;&nbsp;8.5</td>
          </tr>
          <tr>
            <th scope="row">ED visits &mdash; combined</th>
            <td>% of ED visits</td>
            <td>&lt;&nbsp;2.0</td><td>2.0&nbsp;&ndash;&nbsp;3.5</td><td>3.5&nbsp;&ndash;&nbsp;5.5</td><td>5.5&nbsp;&ndash;&nbsp;8.0</td><td>&ge;&nbsp;8.0</td>
          </tr>
          <tr>
            <th scope="row">ED visits &mdash; influenza</th>
            <td>% of ED visits</td>
            <td>&lt;&nbsp;0.6</td><td>0.6&nbsp;&ndash;&nbsp;1.5</td><td>1.5&nbsp;&ndash;&nbsp;3.0</td><td>3.0&nbsp;&ndash;&nbsp;5.0</td><td>&ge;&nbsp;5.0</td>
          </tr>
          <tr>
            <th scope="row">ED visits &mdash; COVID-19</th>
            <td>% of ED visits</td>
            <td>&lt;&nbsp;0.6</td><td>0.6&nbsp;&ndash;&nbsp;1.2</td><td>1.2&nbsp;&ndash;&nbsp;2.2</td><td>2.2&nbsp;&ndash;&nbsp;3.5</td><td>&ge;&nbsp;3.5</td>
          </tr>
          <tr>
            <th scope="row">ED visits &mdash; RSV</th>
            <td>% of ED visits</td>
            <td>&lt;&nbsp;0.3</td><td>0.3&nbsp;&ndash;&nbsp;0.8</td><td>0.8&nbsp;&ndash;&nbsp;1.5</td><td>1.5&nbsp;&ndash;&nbsp;2.5</td><td>&ge;&nbsp;2.5</td>
          </tr>
          <tr>
            <th scope="row">Positivity &mdash; influenza</th>
            <td>% of tests positive</td>
            <td>&lt;&nbsp;3</td><td>3&nbsp;&ndash;&nbsp;8</td><td>8&nbsp;&ndash;&nbsp;15</td><td>15&nbsp;&ndash;&nbsp;25</td><td>&ge;&nbsp;25</td>
          </tr>
          <tr>
            <th scope="row">Positivity &mdash; COVID-19</th>
            <td>% of tests positive</td>
            <td>&lt;&nbsp;4</td><td>4&nbsp;&ndash;&nbsp;8</td><td>8&nbsp;&ndash;&nbsp;14</td><td>14&nbsp;&ndash;&nbsp;20</td><td>&ge;&nbsp;20</td>
          </tr>
          <tr>
            <th scope="row">Positivity &mdash; RSV</th>
            <td>% of tests positive</td>
            <td>&lt;&nbsp;2</td><td>2&nbsp;&ndash;&nbsp;5</td><td>5&nbsp;&ndash;&nbsp;10</td><td>10&nbsp;&ndash;&nbsp;15</td><td>&ge;&nbsp;15</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted">At the state-composite level, combined ED visits, the wastewater index and the ARI
    label feed the headline number; a state's mean test positivity is scored against the influenza
    positivity band as a general proxy. The per-pathogen bands above drive the by-virus breakdown.</p>

    <h2>A worked example</h2>
    <p>Suppose a state reports three signals for the latest week: a wastewater index of 6.0, combined
    ED visits at 4.2% of all visits, and an ARI label of <em>High</em>. Test positivity is missing.
    Each present signal is scored, then blended:</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Signal</th><th scope="col">Reading</th><th scope="col">Sub-score</th><th scope="col">Weight</th></tr>
        </thead>
        <tbody>
          <tr><td>Wastewater</td><td>6.0 (band 5&ndash;7)</td><td>50</td><td>0.30</td></tr>
          <tr><td>ED visits (combined)</td><td>4.2% (band 3.5&ndash;5.5)</td><td>47</td><td>0.25</td></tr>
          <tr><td>ARI level</td><td>High (level 3)</td><td>70</td><td>0.25</td></tr>
          <tr><td>Positivity</td><td>&mdash; not reported &mdash;</td><td>&mdash;</td><td>&mdash;</td></tr>
        </tbody>
      </table>
    </div>
    <p>The weights of the three present signals sum to 0.80. The composite is
    (50&nbsp;&times;&nbsp;0.30&nbsp;+&nbsp;47&nbsp;&times;&nbsp;0.25&nbsp;+&nbsp;70&nbsp;&times;&nbsp;0.25)&nbsp;&divide;&nbsp;0.80&nbsp;=&nbsp;44.25&nbsp;&divide;&nbsp;0.80&nbsp;&asymp;&nbsp;<strong>55</strong>.
    A score of 55 falls in the 40&ndash;60 band, so the headline level for this state would read
    <strong>Moderate</strong>.</p>

    <h2>The by-virus breakdown</h2>
    <p>The same machinery runs once per pathogen. For influenza, COVID-19 and RSV individually, FluTrack
    scores whichever of that virus's ED-visit, positivity and wastewater readings are available, using
    the pathogen-specific bands above, and blends them with the same weights (wastewater 0.30,
    ED visits 0.25, positivity 0.20). The result is each virus's own level and trend, so a season driven
    mostly by, for example, RSV reads differently from one driven by influenza &mdash; even when the
    combined headline level is identical.</p>

    <h2>How the trend is derived</h2>
    <p>The trend answers "which way is this moving?" without pretending to more precision than weekly,
    lagged data can support. FluTrack takes the relevant chronological series (oldest to newest),
    compares the <strong>most recent week</strong> against the <strong>mean of the prior up-to-three
    weeks</strong>, and expresses the difference as a percent change:</p>
    <ul>
      <li>A change of <strong>+8% or more</strong> is labeled <strong>Rising</strong>.</li>
      <li>A change of <strong>&minus;8% or more</strong> (a fall of at least 8%) is labeled <strong>Falling</strong>.</li>
      <li>Anything in between is <strong>Holding steady</strong>.</li>
    </ul>
    <p>The &plusmn;8% band is deliberately wide enough to ignore ordinary week-to-week wobble while still
    catching a genuine turn. When fewer than two data points are available, the trend is reported as
    "Not enough data" rather than guessed. As a worked case, an ED-visit series of 3.6, 3.8, 3.9, 4.2
    compares the latest 4.2 against the prior three-week mean of about 3.77, a change of roughly +12% &mdash;
    labeled <strong>Rising</strong>.</p>

    <h2>Timing: a trend, never a live count</h2>
    <p>${escapeHtml(disclaimers.trendNotLive)} CDC surveillance systems publish on a weekly cadence
    (typically Fridays), and a given week's figures generally reflect illness from one to two weeks
    earlier as reports are collected and revised. FluTrack therefore leads with the direction of travel
    rather than any single day's number, and figures for the most recent week or two can still move as
    late data arrives. See <a href="/data-sources/">data sources</a> for the specific CDC systems behind
    each signal.</p>

    <h2>Limitations</h2>
    <p>An honest index states plainly what it cannot do. The respiratory threat level:</p>
    <ul>
      <li><strong>Is not real-time.</strong> It reflects reported surveillance with an inherent one-to-two-week lag, not today's conditions.</li>
      <li><strong>Uses editorial thresholds.</strong> The breakpoints and weights on this page are FluTrack's own, informed by typical seasonal ranges &mdash; not official CDC classifications. Reasonable analysts could choose different cut points.</li>
      <li><strong>Depends on federal reporting.</strong> Coverage varies by state and week; sparse wastewater sites or missing signals mean some composites rest on fewer inputs than others.</li>
      <li><strong>Is a state-level summary.</strong> Activity can differ substantially within a state, and the index does not resolve county or neighborhood detail.</li>
      <li><strong>Reflects measured activity, not risk to any individual.</strong> It describes what the surveillance data shows in aggregate and says nothing about a specific person's circumstances.</li>
      <li><strong>Blends signals that measure different things.</strong> Wastewater, ED visits, positivity and ARI capture related but distinct phenomena; combining them is a useful simplification, not a ground truth.</li>
    </ul>

    <h2>Independence and scope</h2>
    <p>${escapeHtml(disclaimers.notAffiliated)}</p>
    <p>${escapeHtml(disclaimers.notMedical)}</p>
    <p class="muted">Reproducibility note: the constants documented here mirror FluTrack's threat-index
    module exactly. If the method changes, this page changes with it.</p>
  `;

  const body = `
  ${pageHeader({
    eyebrow: 'Methodology',
    title: 'How the respiratory threat level is computed',
    lede:
      'A full, transparent account of how FluTrack turns four public-domain CDC surveillance ' +
      'signals into one respiratory threat level for your state — every weight, threshold and ' +
      'trend rule, exactly as the code applies them.',
  })}

  ${prose(content, { updated: 'July 2026' })}

  <section class="section" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container container--narrow">
      <h2 style="font-size: var(--step-2)">Method questions</h2>
      <div style="margin-top: var(--space-md)">
        ${faqs
          .map(
            (f) =>
              `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`
          )
          .join('')}
      </div>
    </div>
  </section>

  ${signupBand()}
  `;

  return {
    title: 'Methodology: how the threat level is computed',
    description:
      'How FluTrack turns four CDC surveillance signals into one respiratory threat level — a 0–4 scale from a 0–100 composite score — with transparent weights and thresholds.',
    path: '/methodology/',
    body,
    ogType: 'article',
    changefreq: 'monthly',
    priority: 0.7,
    jsonld: [
      breadcrumbLd(crumbs),
      techArticleLd(site),
      faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) }))),
    ],
  };
}

/** A literal TechArticle node describing the methodology document. */
function techArticleLd(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'How the FluTrack respiratory threat level is computed',
    description:
      'The complete methodology behind FluTrack\'s unified respiratory threat level: the four ' +
      'CDC surveillance signals, their weights, the per-signal breakpoints, the 0–100 composite ' +
      'score, and the trend rule.',
    url: `${site.origin}/methodology/`,
    inLanguage: 'en-US',
    datePublished: '2026-07-01',
    dateModified: '2026-07-19',
    author: { '@type': 'Organization', name: site.name },
    publisher: { '@type': 'Organization', name: site.name, url: site.origin },
    isBasedOn: 'https://data.cdc.gov/',
    license: 'https://www.usa.gov/government-works',
    about: [
      'Influenza',
      'Respiratory syncytial virus',
      'COVID-19',
      'Public health surveillance',
    ],
    keywords: [
      'respiratory threat level',
      'methodology',
      'wastewater',
      'NSSP',
      'NWSS',
      'NREVSS',
      'CDC surveillance',
    ],
  };
}

function methodologyFaqs(disclaimers) {
  return [
    {
      q: 'Are these thresholds defined by the CDC?',
      a: `<p>No. The breakpoints, weights and cut points on this page are FluTrack's own transparent editorial thresholds, chosen to reflect typical seasonal ranges in the underlying CDC products. They are not official CDC classifications, and no government agency sets or endorses them. ${escapeHtml(
        disclaimers.notAffiliated
      )}</p>`,
    },
    {
      q: 'Why is wastewater weighted more heavily than lab positivity?',
      a: `<p>Wastewater viral activity typically leads clinical reporting by roughly 5–7 days, making it the earliest reliable read on where activity is heading, so it carries the highest weight (0.30). Test positivity is weighted lowest (0.20) because it reflects testing behavior — who decides to get tested — as much as underlying prevalence.</p>`,
    },
    {
      q: 'What happens when a signal is missing for my state?',
      a: `<p>The composite is a weighted average over whichever signals are actually reported. If a signal is unavailable, its weight is dropped and the remaining weights are renormalized, so the score always reflects a proper average of the data on hand. FluTrack also records which signals contributed.</p>`,
    },
    {
      q: 'How current is the data behind the threat level?',
      a: `<p>${escapeHtml(
        disclaimers.trendNotLive
      )} Surveillance updates weekly, and each week's figures generally reflect illness from one to two weeks earlier. That is why FluTrack leads with the trend rather than a single day's count. See our <a href="/data-sources/">data sources</a> for the specific CDC systems.</p>`,
    },
    {
      q: 'Is the respiratory threat level a prediction or medical advice?',
      a: `<p>Neither. It is a descriptive summary of recent, reported surveillance data — not a forecast and not clinical guidance. ${escapeHtml(
        disclaimers.notMedical
      )}</p>`,
    },
  ];
}

/** Strip tags for the plain-text answers required by FAQ structured data. */
function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
