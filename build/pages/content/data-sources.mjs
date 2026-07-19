import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /data-sources/ — the provenance page. Documents every public-domain CDC
 * surveillance feed that contributes to the threat level, and states plainly
 * why non-commercially licensed wastewater data (WastewaterSCAN / SCAN /
 * Verily, CC BY-NC 4.0) is deliberately excluded from this monetized site.
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
      cadence: 'Weekly, published Fridays',
    },
    {
      name: 'NSSP Acute Respiratory Illness (ARI) activity level',
      measures:
        'A categorical activity level for acute respiratory illness, reported on a scale from Very Low to Very High.',
      granularity: 'State',
      cadence: 'Weekly',
    },
    {
      name: 'NWSS Wastewater Viral Activity Level (WVAL)',
      measures:
        'A normalized viral-activity index built from pathogen concentrations in community wastewater — a leading indicator that can move ahead of clinical signals by days.',
      granularity: 'State / sewershed',
      cadence: 'Weekly',
    },
    {
      name: 'NREVSS laboratory test positivity',
      measures:
        'The share of respiratory laboratory tests that come back positive, by virus.',
      granularity: 'HHS region / state',
      cadence: 'Weekly',
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
    title: 'Every number here traces back to the CDC',
    lede:
      "FluTrack is assembled entirely from the CDC's own respiratory surveillance — the same open, public-domain feeds anyone can download. This page documents each dataset behind the threat level, the license it carries, and why we leave some sources out on purpose.",
  })}

  ${prose(`
    <p>The Centers for Disease Control and Prevention publish a great deal about respiratory illness every week, all of it in the public domain and all of it downloadable from <a href="https://data.cdc.gov/">data.cdc.gov</a>. FluTrack draws on four of those feeds and blends them into a single 0–4 threat level for your state. Nothing below is proprietary, and nothing sits behind a login — you can pull the very same inputs we do and check our work. How the signals are combined is documented separately in our <a href="/methodology/">methodology</a>.</p>

    <h2>The datasets behind the index</h2>
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
    )} That is why FluTrack emphasizes the direction of a trend rather than any single week's figure.</p>

    <h2>How the data reaches your browser</h2>
    <p>FluTrack runs a two-tier strategy so a page is useful the instant it loads, even if a government feed is briefly unreachable:</p>
    <ul>
      <li><strong>A bundled snapshot</strong> ships with the site and paints immediately. It is clearly labeled as illustrative sample data until a live refresh succeeds.</li>
      <li><strong>A live refresh</strong> then queries the CDC's public-domain Socrata (SODA) endpoints on <a href="https://data.cdc.gov/">data.cdc.gov</a> directly from your browser. When it succeeds, the snapshot is replaced and the provenance badge flips from <span class="badge badge--cached">Sample data</span> to <span class="badge badge--live"><span class="badge__dot"></span>Live CDC data</span>.</li>
    </ul>
    <p>Because the fetch happens client-side against open government endpoints, the data you see is the data the CDC published — no intermediary server re-hosts or reshapes it. CDC surveillance systems refresh weekly, typically on Fridays, and reported figures generally reflect illness from one to two weeks earlier.</p>

    <h2>Licensing and what we deliberately exclude</h2>
    <p>FluTrack uses <strong>only public-domain U.S. Government data</strong> — the CDC's own surveillance products, which carry no usage restrictions and can be reused by anyone, including on a commercial site. That constraint is a deliberate design choice, not an accident of what was easy to find.</p>
    <p>In particular, FluTrack <strong>deliberately excludes WastewaterSCAN (also referenced as SCAN or Verily) data</strong>. Those wastewater readings are licensed <strong>CC BY-NC 4.0</strong> — a non-commercial license. FluTrack is supported by advertising and affiliate links, which makes it a commercial use, so incorporating that data would violate its license terms. We therefore ingest only the CDC's own public-domain NWSS Wastewater Viral Activity Level product and leave the non-commercial networks out entirely.</p>
    <div class="callout">
      <p class="callout__title">${icon('check')} The exclusion is enforced in code</p>
      <p class="text-secondary">This is not left to good intentions. The ingestion pipeline runs a defensive source filter — <code>excludeNonCommercial()</code> in <code>src/scripts/data-sources.js</code> — that drops any wastewater row whose provenance references SCAN, WastewaterSCAN, Verily or the other non-commercial networks, so CC BY-NC 4.0 data can never surface on a monetized page even if it appeared in an upstream response.</p>
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
    body,
    changefreq: 'monthly',
    priority: 0.5,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
