import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';
import { processors, privacyEmail } from '../../lib/site.mjs';

/**
 * /vendors/ — the processor register.
 *
 * Every third party that touches a visitor's data, named by LEGAL ENTITY rather
 * than by role, with purpose, lawful basis, data categories, retention and the
 * route to deletion. It renders from the single `processors` array in
 * build/lib/site.mjs, which the Privacy Policy reads from too — so the register
 * and the policy cannot drift into describing the same vendor two ways.
 */
export default function vendors(ctx) {
  const { disclaimers } = ctx;
  const email = privacyEmail();

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Vendor Register', path: '/vendors/' },
  ];

  const classLabel = {
    essential: 'Essential',
    analytics: 'Analytics',
    advertising: 'Advertising',
  };

  const rows = processors
    .map(
      (p) => `<tr>
            <th scope="row">
              <strong>${escapeHtml(p.vendor)}</strong>
              <span class="muted" style="display:block">${escapeHtml(p.service)}</span>
            </th>
            <td>${escapeHtml(p.purpose)}</td>
            <td>${escapeHtml(p.basis)}</td>
            <td>${escapeHtml(p.dataCategories)}</td>
            <td>${escapeHtml(p.retention)}</td>
            <td>${escapeHtml(p.deletionPath)}</td>
            <td><span class="badge">${escapeHtml(classLabel[p.consentClass] || p.consentClass)}</span><span class="muted" style="display:block">${escapeHtml(
              p.status
            )}</span></td>
          </tr>`
    )
    .join('\n          ');

  const docLinks = processors
    .map(
      (p) =>
        `<li><strong>${escapeHtml(p.vendor)}</strong> — ${escapeHtml(
          p.service
        )}. <a href="${escapeHtml(p.docs)}" rel="noopener nofollow">Their privacy documentation ↗</a></li>`
    )
    .join('\n      ');

  const body = `
  ${pageHeader({
    eyebrow: 'Transparency',
    title: 'Vendor register',
    lede:
      'Every third party that touches data from this site, named by legal entity — what each one does, why we are allowed to use it, what it sees, how long it keeps it, and how to have it deleted.',
  })}

  <section class="section" style="padding-top: 0">
    <div class="container">
      <div class="callout">
        <p class="callout__title">${icon('check')} Named, not described by role</p>
        <p class="text-secondary">A privacy policy that describes vendors by category — “a reputable email provider”, “a privacy-respecting analytics service” — cannot be checked against what the site actually loads. This register names the legal entity behind each one, and is generated from the same configuration the Privacy Policy reads, so the two cannot disagree.</p>
      </div>

      <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table" style="margin-top: var(--space-lg)">
        <table>
          <caption class="visually-hidden">Processors, purposes, lawful bases, data categories, retention and deletion routes</caption>
          <thead>
            <tr>
              <th scope="col">Processor</th>
              <th scope="col">Purpose</th>
              <th scope="col">Lawful basis</th>
              <th scope="col">Data categories</th>
              <th scope="col">Retention</th>
              <th scope="col">Deletion path</th>
              <th scope="col">Class &amp; status</th>
            </tr>
          </thead>
          <tbody>
          ${rows}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  ${prose(
    `
    <h2>How to read the “class” column</h2>
    <ul>
      <li><strong>Essential</strong> — needed for the site to work or to stay secure. Not subject to a consent prompt, and documented here instead of being buried.</li>
      <li><strong>Analytics</strong> and <strong>Advertising</strong> — non-essential. Anything in these classes that writes to your device is denied until you record a decision on our <a href="/consent/">privacy choices</a> page. Cloudflare Web Analytics is classed as analytics but is cookieless and stores nothing on your device, so it never engages that gate; we list it here rather than pretending a prompt governs it.</li>
    </ul>

    <h2>Jurisdictional basis</h2>
    <p>FluTrack is operated from and hosted in the United States, and covers U.S. respiratory surveillance. Where the EU/UK GDPR applies, our lawful bases are the ones named in the table: <strong>consent</strong> for the surge-alert subscription and for the optional location lookup, which you can withdraw at any time, and <strong>legitimate interest</strong> for serving and securing the site and understanding aggregate usage. Under the California Consumer Privacy Act, we do not sell personal information and we do not share it for cross-context behavioral advertising. We honor Global Privacy Control as an opt-out signal where it applies.</p>

    <h2>Deletion and access requests</h2>
    <p>${
      email
        ? `Write to <a href="mailto:${escapeHtml(email)}">${escapeHtml(
            email
          )}</a> and tell us what you would like. We will honor requests to access, correct or delete the information associated with your email address.`
        : 'Use our <a href="/contact/">contact page</a> and tell us what you would like. We will honor requests to access, correct or delete the information associated with your email address.'
    } Where a row above says nothing is stored, there is genuinely no record to retrieve or erase — the “Use my location” lookup is discarded the moment it resolves to a state.</p>

    <h2>When this register changes</h2>
    <p>We review this register whenever the analytics or advertising implementation changes, whenever a processor is added or removed, and at each release. Changes are recorded in our <a href="/changelog/">corrections and changelog</a>. If you spot something here that does not match what the site actually loads, please tell us — that mismatch is exactly the problem this page exists to prevent.</p>

    <h2>Vendor documentation</h2>
    <ul>
      ${docLinks}
    </ul>

    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>
  `,
    { updated: 'August 2026' }
  )}
  `;

  return {
    title: 'Vendor Register',
    description:
      'Every processor FluTrack uses, named by legal entity, with purpose, lawful basis, data categories, retention and deletion path.',
    path: '/vendors/',
    body,
    changefreq: 'monthly',
    priority: 0.3,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
