import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';
import { site, privacyEmail } from '../../lib/site.mjs';

/**
 * /changelog/ — the public record of corrections and methodology changes.
 *
 * A health-adjacent site that quietly edits pages has no way to prove it did
 * not quietly edit the numbers. This page exists so a correction leaves a
 * trace: what changed, when, and whether it altered a reading anyone saw.
 *
 * ENTRIES ARE APPEND-ONLY. Fix a wrong entry by adding a corrective one below
 * it, never by editing history — that is the whole point of keeping a record.
 * Every entry must be something that actually shipped.
 */
const ENTRIES = [
  {
    date: '2026-08-29',
    kind: 'Accountability',
    title: 'Corrected the publisher’s registered legal name, and published its address',
    body:
      'The publisher was recorded here as “Oak & Main LLC”. That is not the entity’s registered legal name: the publisher is Oak and Main Developers LLC, a California limited liability company. Every page that names the publisher now carries the correct name, and the registered mailing address is published on /about/, /contact/ and /privacy/ and in the site’s structured data. The 2026-08-18 entry below is left as written, because this record is append-only and that entry is an accurate account of what the site said at the time. Publishing a verifiable address also removes the obstacle to any commercial email: the law requires a valid physical postal address in one, and until now there was none to give.',
    affectsReadings: false,
  },
  {
    date: '2026-08-29',
    kind: 'Privacy',
    title: 'Set out the California privacy position explicitly',
    body:
      'The policy previously referred to the CCPA in passing, alongside the GDPR, without stating this site’s position under it. FluTrack is published from California, so the policy now names the single category of personal information collected (an email address and a chosen state, only if you submit the alert form), states plainly that it has never been sold or shared for cross-context behavioral advertising, describes how a request is verified and how long a response takes, and records that Global Privacy Control is honored automatically. The governing-law clause in the Terms of Use, previously left as “the state in which FluTrack is operated”, now names California.',
    affectsReadings: false,
  },
  {
    date: '2026-08-28',
    kind: 'Correction',
    title: 'Pages disagreed with the methodology about which signals are measured',
    body:
      'The state-page FAQ, /alerts/, /medical-disclaimer/, /affiliate-disclosure/ and the home page each named three CDC surveillance signals and omitted the Acute Respiratory Illness activity level, which carries a weight of 0.25 — while /methodology/ and /data-sources/ correctly documented four. Across the site 54 of 69 pages contradicted the published method about what the index actually measures. The wording now comes from one shared definition, and the build fails if any page enumerates the sources without the ARI level. No reading was computed incorrectly: the scoring model always used four signals. What was wrong was the description of it.',
    affectsReadings: false,
  },
  {
    date: '2026-08-28',
    kind: 'Correction',
    title: '“Nearby states” named states that are not nearby',
    body:
      'Every state page offered a list headed “Nearby states”, built by grouping states that share an HHS administrative region. HHS regions are administrative, not geographic, so California was told it could compare with Hawaii, Alaska with Idaho, and genuine bordering states such as Oregon were left out. The heading and the sentence now say what the grouping actually is — the HHS surveillance region — which is true whichever members are shown.',
    affectsReadings: false,
  },
  {
    date: '2026-08-28',
    kind: 'Correction',
    title: 'The social share card showed invented per-state severity',
    body:
      'The image used for link previews coloured each state on its map by a hash of that state’s own abbreviation, beneath a “Minimal → Very High” legend and with no indication the colours were not data. Anyone who saw FluTrack shared on social media saw fabricated severity for their state, with the site’s disclaimers stripped away by the preview. The map on that card now carries a single brand colour and claims only which places FluTrack covers and what scale it reports. The build fails if any severity colour reappears in the map area.',
    affectsReadings: false,
  },
  {
    date: '2026-08-28',
    kind: 'Interface',
    title: 'Every icon was cropped, and the favicon was blank',
    body:
      'The tool that renders the site’s icons and share card asked the browser for a window of a given size, but the browser reserved part of that height for its own interface, so each image was captured taller than it was drawn and lost its bottom rows. The favicon was reduced to a single painted row — an empty browser tab — and the app icons, home-screen icon and share card were all cut off. The renderer now measures that reservation rather than assuming it, and the build fails on any icon whose artwork does not reach the edge of its canvas. The Android home-screen icon, which had been an exact copy of the standard icon and was cropped by the system, is now a proper full-bleed variant.',
    affectsReadings: false,
  },
  {
    date: '2026-08-18',
    kind: 'Privacy',
    title: 'Named the analytics provider and every processor by legal entity',
    body:
      'The Privacy Policy said “if we enable analytics” and described vendors by role while Cloudflare Web Analytics was already live on the site. The policy now names Cloudflare, Inc. and the analytics product explicitly, a published vendor register at /vendors/ names every processor by legal entity with its lawful basis, retention and deletion route, and privacy@flufollower.com is published for access and deletion requests.',
    affectsReadings: false,
  },
  {
    date: '2026-08-18',
    kind: 'Privacy',
    title: 'Consent gate implemented rather than promised',
    body:
      'Advertising and analytics storage now start denied for every visitor, a recorded decision is required before any non-essential tag can load, Global Privacy Control is honored as an opt-out, and the choice is manageable at /consent/ with Reject all offered as prominently as Accept all. Previously this was policy language with no implementation behind it.',
    affectsReadings: false,
  },
  {
    date: '2026-08-18',
    kind: 'Correction',
    title: 'Stopped describing the bundled sample file as a downloadable dataset',
    body:
      'The home page’s Dataset structured data advertised /data/snapshot.json as a DataDownload while the page itself called it a sample fallback — which could make illustrative demonstration content look like a current public data product. The DataDownload is now emitted only for a verified published snapshot; while the artifact is illustrative it is labelled as an example in both the page and the structured data, which additionally carry the artifact’s version, generation date and the weeks it covers.',
    affectsReadings: false,
  },
  {
    date: '2026-08-18',
    kind: 'Accountability',
    title: 'Named the publisher and the responsible editor',
    body:
      'Pages attributed the methodology only to “FluTrack”. The site now names Oak & Main LLC as publisher, identifies the responsible editor role that maintains the index method, states plainly that nothing here is medically reviewed, and publishes a route for reporting data issues.',
    affectsReadings: false,
  },
  {
    date: '2026-08-18',
    kind: 'Security',
    title: 'Completed the security header baseline',
    body:
      'Added Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy, script-src-attr, manifest-src and worker-src directives, and first-party CSP violation reporting. The policy also now names the Cloudflare Web Analytics host it was previously blocking, so the beacon and the privacy policy describe the same reality.',
    affectsReadings: false,
  },
  {
    date: '2026-08-18',
    kind: 'Interface',
    title: 'Cached and offline pages now state their own freshness',
    body:
      'A page served from the offline cache could be mistaken for a current respiratory signal. Cached and offline views now carry an explicit notice naming the last verified snapshot and a visible retry control, and no new severity notification is raised while offline.',
    affectsReadings: false,
  },
  {
    date: '2026-07-25',
    kind: 'Correction',
    title: 'Sample data could be badged “Live CDC data”',
    body:
      'A live refresh that returned HTTP 200 but no usable rows could flip the provenance badge to “Live CDC data” while deterministic sample data was still on screen. The badge now requires at least 25 of 51 states to have actually been replaced and a valid week-ending date. Any reading seen with a “Live” badge before this fix may have been sample data.',
    affectsReadings: true,
  },
  {
    date: '2026-07-25',
    kind: 'Methodology',
    title: 'CDC “Extremely High” activity level no longer dropped',
    body:
      'A duplicate label-mapping helper did not recognise the CDC’s “Extremely High” ARI category, so that signal silently fell out of the composite and its 0.25 weight was renormalised across the others. The canonical mapping is now used everywhere. States reporting “Extremely High” before this fix were scored from three signals instead of four.',
    affectsReadings: true,
  },
  {
    date: '2026-07-25',
    kind: 'Correction',
    title: 'State pages no longer fell back to national data',
    body:
      'When a state had no rows for the current week, the page could render the national aggregate under that state’s name rather than saying so. Missing data is now shown as missing.',
    affectsReadings: true,
  },
  {
    date: '2026-07-19',
    kind: 'Methodology',
    title: 'Initial publication of the Respiratory Threat Level',
    body:
      'First public version of the composite index: a weighted average over wastewater viral activity (0.30), ARI activity level (0.25), emergency-department visits (0.25) and laboratory positivity (0.20), renormalised over whichever signals a state actually has, then bucketed into five levels. Full thresholds are published on the methodology page.',
    affectsReadings: false,
  },
];

export default function changelog(ctx) {
  const { disclaimers } = ctx;
  const email = privacyEmail();
  const dataEmail = site.publisher.email;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Corrections & Changelog', path: '/changelog/' },
  ];

  const items = ENTRIES.map(
    (e) => `<li class="changelog__item">
        <div class="changelog__meta">
          <time datetime="${escapeHtml(e.date)}">${escapeHtml(formatEntryDate(e.date))}</time>
          <span class="badge">${escapeHtml(e.kind)}</span>
          ${
            e.affectsReadings
              ? '<span class="badge badge--cached">Affected published readings</span>'
              : ''
          }
        </div>
        <h3>${escapeHtml(e.title)}</h3>
        <p class="text-secondary">${escapeHtml(e.body)}</p>
      </li>`
  ).join('\n      ');

  const body = `
  ${pageHeader({
    eyebrow: 'Accountability',
    title: 'Corrections & changelog',
    lede:
      'Every correction we make and every change to how the index is computed, recorded here in the open — including which ones altered a reading someone had already seen.',
  })}

  <section class="section" style="padding-top: 0">
    <div class="container container--narrow">
      <div class="callout">
        <p class="callout__title">${icon('check')} Two kinds of change, kept separate</p>
        <p class="text-secondary">Surveillance figures are <strong>revised</strong> as later reports arrive, and FluTrack’s numbers move with them automatically on the next weekly refresh. That is the data updating as designed and it is not logged here. This page records the other kind: a mistake in how we computed or described something, or a deliberate change to the method.</p>
      </div>

      <ol class="changelog" style="margin-top: var(--space-xl)">
      ${items}
      </ol>
    </div>
  </section>

  ${prose(
    `
    <h2>How to report something that looks wrong</h2>
    <p>If a figure here does not match the CDC source, or a page says something the data does not support, tell us: <a href="mailto:${escapeHtml(
      dataEmail
    )}?subject=${encodeURIComponent('Data issue')}">${escapeHtml(
      dataEmail
    )}</a>. We compare the reading against the underlying surveillance source, confirm whether the discrepancy is real, and fix confirmed errors promptly — usually on the next weekly refresh, and sooner where a page is materially misleading.</p>
    <p>Where a correction changed what a page said, it is recorded above rather than quietly edited away, and entries flagged <strong>“Affected published readings”</strong> are the ones where a number someone saw was wrong. Entries are append-only: a mistake in this log is fixed by adding a corrective entry, never by rewriting an old one.</p>
    <p>${
      email
        ? `Privacy access and deletion requests go to <a href="mailto:${escapeHtml(
            email
          )}">${escapeHtml(email)}</a> instead.`
        : 'Privacy requests go through our <a href="/contact/">contact page</a> instead.'
    } Who is accountable for this site is set out on our <a href="/about/">About page</a>.</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>
  `,
    { updated: 'August 2026' }
  )}
  `;

  return {
    title: 'Corrections & Changelog',
    description:
      'FluTrack’s public record of corrections and methodology changes, including which ones affected readings that had already been published.',
    path: '/changelog/',
    body,
    changefreq: 'monthly',
    priority: 0.4,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}

/** "2026-08-18" → "18 August 2026". Avoids build-time Date for stability. */
function formatEntryDate(iso) {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
