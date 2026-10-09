import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, revisedOn, revisedLabel } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';
import { privacyEmail, contactHref } from '../../lib/site.mjs';

/**
 * /consumer-health-data-privacy/ — the separate consumer health data privacy
 * notice that Washington's My Health My Data Act (RCW 19.373) and similar laws
 * in Nevada and Connecticut expect to be linked prominently from the home page.
 * It covers ONLY the "Report how you feel" feature; everything else is in
 * /privacy/. Every statement here must stay true to the code:
 *   src/scripts/report-schema.js  (what a report can contain)
 *   functions/api/report.js       (what is stored, and how)
 *   src/server/community.js       (what is ever shown back)
 *   workers/ingest/src/maintenance.js (90-day deletion, salt rotation)
 */
export default function consumerHealthDataPrivacy(ctx) {
  const { site, disclaimers } = ctx;
  const email = privacyEmail();
  const mail = email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : `<a href="${contactHref()}">our contact page</a>`;
  const path = '/consumer-health-data-privacy/';
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Consumer health data privacy', path },
  ];

  const body = `
  ${pageHeader({
    title: 'Consumer health data privacy notice',
    lede:
      'How FluTrack handles the anonymous symptom reports you can send from the home page — what we collect, what we never collect, why, and for how long.',
  })}

  ${prose(
    `
    <div class="callout">
      <p class="callout__title">${icon('check')} The short version</p>
      <p class="text-secondary">A symptom report is anonymous. We keep the symptoms you tick, an age band, your county and the week — never your name, email, exact location, IP address or full ZIP code. Reports are only ever shown back as counts for a county, never below five reports, and never shared with or sold to anyone. Raw reports are deleted after 90 days.</p>
    </div>

    <p>This notice covers the “Report how you feel” feature on ${escapeHtml(site.origin.replace(/^https?:\/\//, ''))}. Symptom reports are <strong>consumer health data</strong> under laws such as Washington's My Health My Data Act, Nevada's SB 370 and Connecticut's consumer health data provisions, so we describe them separately from our general <a href="/privacy/">Privacy Policy</a>. FluTrack is not a health-care provider, and HIPAA does not apply to it. Sending a report is entirely optional: you can check your area without sending anything.</p>

    <h2>What we collect when you send a report</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th scope="col">Collected</th><th scope="col">Detail</th></tr></thead>
        <tbody>
          <tr><th scope="row">How you feel</th><td>“Fine” or “sick”</td></tr>
          <tr><th scope="row">Symptoms</th><td>Only the boxes you tick: fever of 100°F or higher, cough, sore throat, body aches, fatigue, congestion, headache, chills, nausea/vomiting/diarrhea, loss of taste or smell, shortness of breath — and roughly when they started</td></tr>
          <tr><th scope="row">Optional answers</th><td>Age band (0–4, 5–17, 18–49, 50–64, 65+), whether you had a flu shot this season, whether you took a test and its result, and how many others at home are sick</td></tr>
          <tr><th scope="row">Area</th><td>Your county and state. If your three-digit ZIP area has more than 20,000 people, its first three digits</td></tr>
          <tr><th scope="row">Time</th><td>The calendar day and week of the report — no time of day</td></tr>
          <tr><th scope="row">Abuse check</th><td>A one-way scrambled code made from your IP address and a random value that changes every day and is then deleted. It lets us limit reports to a few per day; it cannot be turned back into your IP address, and tomorrow the same connection produces a different code</td></tr>
        </tbody>
      </table>
    </div>

    <h2>What we never collect</h2>
    <ul>
      <li>Your name, email address, phone number, date of birth or any account — there are no accounts.</li>
      <li>Your exact location, GPS coordinates, street address or full five-digit ZIP code. If you type a ZIP code, it is used once to find your county and then discarded.</li>
      <li>Your IP address. It is used only to make the scrambled code above and is never stored.</li>
      <li>Any free text. The form has no text box for symptoms or comments.</li>
    </ul>

    <h2>Why we collect it</h2>
    <p>For one purpose only: to publish an <strong>aggregate</strong> community signal — how many people in a county reported this week, and what share described flu-like illness — alongside the CDC's official data. Community reports are self-reported and unverified. They never change the CDC-based level we show, and we never describe them as an outbreak.</p>

    <h2>How reports are shown</h2>
    <ul>
      <li>Fewer than <strong>5</strong> reports in a county for the week: nothing is shown except that there are fewer than five.</li>
      <li>5 to 19 reports: the number of reports, marked as too few to compare.</li>
      <li>20 or more: the share of reports meeting the CDC's influenza-like-illness definition (fever plus cough or sore throat).</li>
      <li>“Elevated community reports” appears only with at least 30 reports and a share at least twice the area's usual level.</li>
    </ul>
    <p>Counts are recalculated once a day, so no single report changes what anyone sees the moment it is sent. Reports flagged by our automated abuse checks are excluded.</p>

    <h2>Who we share it with</h2>
    <p><strong>No one, and we never sell it.</strong> Symptom reports are not shared with, sold to, or made available to advertisers, analytics companies, data brokers or any other third party, and they are never used for advertising or to target ads. They are not sent to Google Analytics or any other analytics tool.</p>
    <p>The only company that handles the data is our infrastructure provider, <strong>Cloudflare, Inc.</strong>, as a processor acting on our instructions: it hosts the site, stores reports in its D1 database and Workers KV, and runs <strong>Cloudflare Turnstile</strong>, a privacy-preserving check that the form is being used by a person rather than a bot. Turnstile does not use cookies for advertising and runs only once you start using the report form. The full list of processors is on our <a href="/vendors/">vendors page</a>.</p>

    <h2>How long we keep it</h2>
    <ul>
      <li><strong>Raw reports</strong> are deleted automatically after <strong>90 days</strong>.</li>
      <li><strong>Daily county totals</strong> (counts only, with no individual answers) are kept to compare this season with earlier weeks.</li>
      <li>The <strong>daily random value</strong> behind the abuse-check code is deleted once its day ends.</li>
    </ul>

    <h2>What stays on your device</h2>
    <p>After you send a report, your browser stores one entry, <code>ff_last_report</code>, holding only the time you reported. It is used to allow one report per device per week and is never sent to us. Clearing your browser's site data removes it.</p>

    <h2>Your rights and choices</h2>
    <p>Consent is required for each report — the box is never pre-ticked — and you can simply stop sending reports at any time. Because a report holds nothing that identifies you, we cannot look up or single out “your” reports later; that is by design. You can still contact us with any request about consumer health data — to ask what we hold, to ask for deletion, or to appeal a decision — at ${mail}, and we will answer within 45 days. Raw reports are deleted after 90 days regardless.</p>

    <h2>Contact</h2>
    <p>${escapeHtml(site.publisher.legalName)}, ${escapeHtml(site.publisher.address.street)}, ${escapeHtml(site.publisher.address.locality)}, ${escapeHtml(site.publisher.address.region)} ${escapeHtml(site.publisher.address.postalCode)} · ${mail}</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)} If you have trouble breathing, chest pain, confusion or bluish lips, call 911.</p>
    </div>
  `,
    { updated: revisedLabel(path) }
  )}
  `;

  return {
    title: 'Consumer health data privacy notice',
    description:
      'How FluTrack handles anonymous symptom reports: what is collected, what never is (no name, email, IP or full ZIP), 90-day deletion, no sale or sharing.',
    path,
    lastmod: revisedOn(path),
    body,
    changefreq: 'yearly',
    priority: 0.3,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
