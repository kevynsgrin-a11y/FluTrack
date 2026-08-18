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
