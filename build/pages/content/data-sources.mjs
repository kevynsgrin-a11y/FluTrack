import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand, revisedOn } from '../../lib/partials.mjs';
import { breadcrumbLd, cdcDatasetLd } from '../../lib/seo.mjs';

/**
 * /data-sources/ — the provenance page. Documents every public-domain CDC
 * surveillance feed that contributes to the threat level, and states plainly
 * why WastewaterSCAN / SCAN data (CC BY-NC 4.0) is excluded, and distinguishes
 * that license from the broader provider labels excluded by the source filter.
 * Sterile data-visualizer voice: it describes the data, never prescribes.
 */
export default function dataSources(ctx) {
  const { site, disclaimers } = ctx;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Data sources', path: '/data-sources/' },
  ];

  // Each dataset row mirrors the registry in src/scripts/data-sources.js.
  const datasets = [
    {
      name: 'NSSP Emergency Department Visits',
      measures:
        'The share of emergency-department visits coded to influenza, RSV or COVID-19 — the workhorse clinical signal behind the index.',
      granularity: 'State',
      cadence: 'Weekly; source publication and observation dates can differ',
    },
    {
      name: 'NSSP Acute Respiratory Illness (ARI) activity level',
      measures:
        'A categorical activity level for broad acute respiratory illness; it is not specific to just influenza, RSV and COVID-19.',
      granularity: 'State',
      cadence: 'Weekly',
    },
    {
      name: 'NWSS Wastewater Viral Activity Level (WVAL)',
      measures:
        'A normalized viral-activity index from participating community wastewater sampling sites. FluTrack uses eligible-site state medians, not counts of infected people.',
      granularity: 'State / sewershed',
      cadence: 'Fridays, with previous-week observations; subject to revisions',
    },
    {
      name: 'NWSS Wastewater Viral Activity Level — by county (atcp-73re)',
      measures:
        'The same WVAL product read site by site for the “Check your area” card: a county’s influenza A reading is the median public-domain site serving it. WastewaterSCAN sites are excluded.',
      granularity: 'County (where a site exists)',
      cadence: 'Fridays, with previous-week observations; subject to revisions',
    },
    {
      name: 'NHSN hospital admission levels and rates (vdzy-6i9v)',
      measures:
        'Lab-confirmed influenza, COVID-19 and RSV hospital admissions per 100,000 people, with the CDC’s own level (Very Low to Very High). The “how severe” line on the area card.',
      granularity: 'State',
      cadence: 'Weekly, published Fridays',
    },
    {
      name: 'NHSN Hospital Respiratory Data — final (ua7e-t2fy) and preliminary (mpgq-jmmr)',
      measures:
        'Weekly admission counts and rates by state. The preliminary release is newer and revises recent weeks; both are stored and served by /api/official.',
      granularity: 'State',
      cadence: 'Final: Fridays. Preliminary: Wednesdays',
    },
    {
      name: 'NREVSS laboratory test positivity',
      measures:
        'The share of respiratory laboratory tests that come back positive, by virus. FluTrack has no live adapter for it yet, so a live reading rests on up to three signals; only the illustrative sample models it.',
      granularity: 'HHS region / state',
      cadence: 'Weekly',
    },
    {
      name: 'CDC epidemic trends (Rt) — COVID-19',
      measures:
        'The CDC’s modeled estimate of whether COVID-19 infections are growing, with its category from Growing to Declining, estimated from emergency-department visits. Direction only, not the burden of disease; shown beside a state’s readings and never part of the combined index.',
      granularity: 'State (and national)',
      cadence: 'Weekly model reports; fetched when the site is built',
    },
  ];

  const rows = datasets
    .map(
      (d) => `<tr>
            <th scope="row">${escapeHtml(d.name)}</th>
            <td>${escapeHtml(d.measures)}</td>
            <td>${escapeHtml(d.granularity)}</td>
            <td><span class="badge">Public Domain</span></td>
            <td>${escapeHtml(d.cadence)}</td>
          </tr>`
    )
    .join('\n          ');

  const body = `
  ${pageHeader({
    eyebrow: 'Data sources',
    title: 'Implemented CDC feeds, coverage and sample inputs',
    lede:
      "Live observations come from implemented CDC feeds; illustrative samples are labeled separately. This page distinguishes index inputs, separate area-card measures and unavailable feeds, with their geography and publication schedules.",
  })}

  ${prose(`
    <p>FluTrack's implemented index inputs are NSSP emergency-department visits, NSSP Acute Respiratory Illness activity and NWSS wastewater from <a href="https://data.cdc.gov/">data.cdc.gov</a>, read through the existing ingestion service. Up to three usable signals contribute to a live combined respiratory index; NREVSS laboratory positivity has no live adapter. The model can include positivity only in labeled illustrative samples. Our <a href="/methodology/">methodology</a> describes the unchanged weights and thresholds.</p>

    <h2>Index feeds, separate measures and unavailable inputs</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Dataset</th>
            <th scope="col">What it measures</th>
            <th scope="col">Granularity</th>
            <th scope="col">License</th>
            <th scope="col">Update cadence</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    <p class="text-secondary">Each source above is a weekly time series, not a live count. ${escapeHtml(
      disclaimers.trendNotLive
    )} A supported trend compares the latest observation with the mean of up to three prior observations,
    rather than an ordinary week-over-week change.</p>

    <h2>How the data reaches your screen</h2>
    <p>FluTrack works in three tiers, with provenance labels indicating whether a reading is observed or illustrative:</p>
    <ul>
      <li><strong>Built from the CDC feeds.</strong> A build attempts the implemented index feeds through the approved caching service and uses observations that pass coverage checks. A live-origin badge identifies reported inputs; their observation periods and age determine what they can support, not the build time.</li>
      <li><strong>A sample fallback.</strong> If usable observations cannot be obtained, a bundled illustrative snapshot can keep the interface usable. Those readings say <span class="badge badge--cached">Sample data</span>; any accompanying explanation describes an example, not actual state conditions.</li>
      <li><strong>A refresh in your browser.</strong> When the page you loaded holds sample data, or a newer CDC week may have been published since it was built, your browser fetches the same feeds and updates the page.</li>
    </ul>
    <h2>The “Check your area” card and /api/official</h2>
    <p>The county card reads a separate copy of the CDC data kept by FluTrack's own ingest service, which queries <a href="https://data.cdc.gov/">data.cdc.gov</a> directly every Wednesday and Friday afternoon (UTC). Each dataset is pulled, checked and stored on its own: one that fails, or returns too little to be a real weekly release, changes nothing, and the last good week stays in place with its own date. Missing data is shown as missing, never as zero, and anything more than 14 days past its week ending is flagged. The same official-only data is available as JSON at <code>/api/official?state=CA&amp;county=06073</code> (open to any site, with attribution to the CDC).</p>
    <p>Two further sources are built but switched off for now: the CDC's influenza A wastewater sample data (<code>ymmh-divb</code>), whose WastewaterSCAN rows are always dropped, and state influenza-like-illness rates from CDC ILINet as re-served by Carnegie Mellon's Delphi Epidata API. The CDC's FluSight forecasts, NREVSS regional positivity and California's CDPH respiratory dashboard are candidates for later.</p>

    <p>Both the build and browser use the caching copy at <code>ingest.oakandmain.dev</code>. Cache retrieval and source publication follow different schedules. An October retrieval of a September observation remains a September observation. Each metric retains its geography, observation period, publication date when supplied, retrieval timestamp and usable coverage; an absent source publication date is unknown rather than inferred from the build. Source fields named <code>buildnumber</code> or <code>date_updated</code> remain source build/update dates, not verified publication dates.</p>
    <p>The one exception is the CDC's epidemic-trend file. It is not a Socrata dataset and is not on the ingestion service, so the build fetches it directly from <code>cdc.gov</code> and checks its schema, dates and categories before using it. Your browser never fetches it. If it cannot be fetched or fails those checks, the epidemic-trend blocks are left out; they are never replaced by sample values, and pages built from sample data carry none. The figures behind every block are published as <code>/data/epidemic-trends.json</code>. <a href="/methodology/#epidemic-trend">How FluTrack shows it</a></p>

    <h2>Coverage and interpretation</h2>
    <p>Cases, laboratory positivity, wastewater viral activity, emergency-department visit percentages and hospital admission rates measure different things. Hospitalization data is displayed separately from the combined index. State observations do not independently measure a city, and participating sewersheds do not cover every resident. No data does not mean no illness. A fresh cache timestamp or a list of 51 jurisdiction keys does not establish usable observations for each pathogen or source.</p>
    <p>Weekly releases can be delayed or revised, and preliminary and final hospital products have different publication schedules. A missing week, insufficient trend history or stale observation is qualified rather than converted to zero or a stable trend. For current official context, see the CDC's <a href="https://www.cdc.gov/respiratory-viruses/data/" rel="noopener">respiratory data</a>, <a href="https://www.cdc.gov/respiratory-viruses/data/activity-levels.html" rel="noopener">activity levels</a> and <a href="https://www.cdc.gov/wastewater/respiratory-viruses/state.html?cove-tab=1" rel="noopener">state wastewater</a> pages. National trends and local changes cannot substitute for a selected state's observations.</p>

    <h3>Documented CDC surveillance gaps &mdash; October 2, 2026</h3>
    <ul>
      <li><strong>Wastewater contract transition.</strong> The CDC's <a href="https://www.cdc.gov/wastewater/respiratory-viruses/state.html?cove-tab=1" rel="noopener">state wastewater page, updated October 2, 2026</a>, says a new testing contract was awarded to Verily on September 28, 2026. CDC warned of a brief reporting gap affecting about 200 sites while sampling, testing and reporting restart. This notice alone does not establish why a September 26 observation is missing; each reading's own dates and coverage still apply.</li>
      <li><strong>Iowa NSSP reporting.</strong> The CDC's <a href="https://www.cdc.gov/respiratory-viruses/data/activity-levels.html" rel="noopener">activity-level data notes, updated October 2, 2026</a>, say Iowa's NSSP feed ended on May 6, 2026 following a change in health information exchange vendors. Only data through the week ending May 2 is considered; weeks ending May 9, 2026 and later show <em>Data Unavailable</em>. This reporting gap is not evidence of low illness activity.</li>
      <li><strong>Missouri's ARI baseline.</strong> The same October 2 CDC notes explain that data quality issues prevented use of Missouri's own historical data before MMWR Week 10 of 2025 (March 2&ndash;8). CDC used the rest of HHS Region 7 for that earlier portion of the historical baseline, and Missouri's own data from Week 10 onward, to calculate its 2026&ndash;27 activity levels. This is a caveat about CDC's categorical baseline, separate from FluTrack's editorial index thresholds.</li>
    </ul>

    <h3>Documented CDC surveillance gaps &mdash; October 9, 2026</h3>
    <ul>
      <li><strong>South Dakota emergency-department data.</strong> The CDC's <a href="https://www.cdc.gov/respiratory-viruses/data/activity-levels.html" rel="noopener">activity-level data page, updated October 9, 2026</a>, says no emergency-department visit data are available for South Dakota. The CDC estimates its epidemic trend from emergency-department visits, so FluTrack withholds that category for South Dakota, and for Iowa for the reason above, rather than show a direction label without the data it rests on. This reporting gap is not evidence of low illness activity.</li>
      <li><strong>No CDC trend estimate.</strong> The CDC does not estimate an epidemic trend where emergency-department data are too sparse, show recent anomalies, or fail its reliability checks. FluTrack says so in those cases; &ldquo;not estimated&rdquo; is not the same as &ldquo;not changing&rdquo;.</li>
    </ul>

    <h2>Licensing and what we deliberately exclude</h2>
    <p>FluTrack uses <strong>only public-domain U.S. Government data</strong> — the CDC's own surveillance products, which carry no usage restrictions and can be reused by anyone, including on a commercial site. That constraint is a deliberate design choice, not an accident of what was easy to find.</p>
    <p>FluTrack <strong>deliberately excludes WastewaterSCAN / SCAN data</strong> licensed <strong>CC BY-NC 4.0</strong>, which permits non-commercial use only. FluTrack is designed for commercial use, so those inputs are excluded. A provider name is not a license: the CDC's September 28, 2026 Verily testing-contract award is a distinct source context and does not automatically identify the resulting data as WastewaterSCAN data.</p>
    <div class="callout">
      <p class="callout__title">${icon('check')} The exclusion is enforced in code</p>
      <p class="text-secondary">The existing conservative provenance filter &mdash; <code>excludeNonCommercial()</code> in <code>src/scripts/data-sources.js</code> &mdash; excludes rows marked SCAN, WastewaterSCAN, Verily and certain partner labels. That filter also excludes Verily-marked rows beyond confirmed WastewaterSCAN provenance. The provider name or contract notice alone does not establish a dataset's license, and the contract notice alone does not explain a missing September 26 observation. Reported coverage describes only the rows retained by this filter.</p>
    </div>

    <h2>Independent, not official</h2>
    <p>Building on the CDC's open data does not make FluTrack a government product. We read the same public feeds available to everyone, with no affiliation, funding relationship, or special access.</p>
    <div class="callout">
      <p class="callout__title">${icon('check')} No CDC affiliation</p>
      <p class="text-secondary">${escapeHtml(disclaimers.notAffiliated)}</p>
    </div>
    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>
  `)}

  ${signupBand()}
  `;

  return {
    title: 'Data sources',
    description:
      "Every CDC dataset behind FluTrack's respiratory threat level — what each measures, its license and cadence — and why we exclude non-commercial data.",
    path: '/data-sources/',
    lastmod: revisedOn('/data-sources/'),
    body,
    changefreq: 'monthly',
    priority: 0.5,
    jsonld: [
      breadcrumbLd(crumbs),
      ...[
        ['vutn-jzwm', 'NSSP Emergency Department Visits — COVID-19, Flu, RSV', 'Weekly share of emergency-department visits for COVID-19, influenza and RSV, by state.'],
        ['f3zz-zga5', 'Level of Acute Respiratory Illness (ARI) Activity by State', 'Weekly categorical acute respiratory illness activity level, by state.'],
        ['atcp-73re', 'CDC Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV', 'Weekly wastewater viral activity level by sampling site and county.'],
        ['vdzy-6i9v', 'Weekly Hospital Respiratory Admission Levels and Rates by Jurisdiction (NHSN)', 'Weekly influenza, COVID-19 and RSV hospital admission rates and levels, by state.'],
        ['ua7e-t2fy', 'Weekly Hospital Respiratory Data (HRD) Metrics by Jurisdiction (NHSN)', 'Weekly hospital respiratory data, final release, by state.'],
        ['mpgq-jmmr', 'Weekly Hospital Respiratory Data (HRD) Metrics by Jurisdiction (NHSN), Preliminary', 'Weekly hospital respiratory data, preliminary release, by state.'],
      ].map(([id, name, description]) => cdcDatasetLd({ id, name, description })),
    ],
  };
}
