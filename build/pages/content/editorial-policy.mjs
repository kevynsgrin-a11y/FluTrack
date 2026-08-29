import { escapeHtml } from '../../../src/scripts/util.js';
import { site } from '../../lib/site.mjs';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /editorial-policy/ — the document a search-quality rater looks for by name.
 *
 * This page invents no policy. Every rule on it already applied somewhere in
 * the site or its build; they were simply scattered across five pages, which
 * meant a reader had to reconstruct them to check whether the site follows its
 * own standards. Where a rule is enforced mechanically the page says so, since
 * "we are committed to accuracy" is worth nothing and "the build fails if a
 * sponsored link ships without its disclosure" can be checked.
 *
 * Keep this page honest by keeping it derived: the publisher name comes from
 * site config, and the enforcement table must describe checks that genuinely
 * exist in build/check.mjs and test/. If a gate is removed, remove its row.
 */
export default function editorialPolicy(ctx) {
  const { site: s } = ctx;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Editorial policy', path: '/editorial-policy/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Editorial policy',
    title: 'What FluTrack will and will not publish',
    lede:
      'The rules this site is written and built to, in one place — including which of them are enforced by the build rather than by good intentions.',
  })}

  ${prose(
    `
    <p>This page collects the rules FluTrack is written and built to. It is a consolidation, not a new policy: every rule below already applies somewhere in the site or its build. Where a rule is enforced mechanically, that is said plainly, so it can be checked.</p>

    <h2>What FluTrack publishes</h2>
    <p>FluTrack publishes one kind of statement: a description of what public-domain CDC respiratory surveillance data has already reported. For each state it shows a composite score from 0 to 100, a level from a fixed five-point scale — Minimal, Low, Moderate, High, Very High, with boundaries at scores of 20, 40, 60 and 80 — a direction of travel, and a separate breakdown for influenza, COVID-19 and RSV.</p>
    <p>The composite is a weighted average of four CDC surveillance signals: wastewater viral activity, weighted 0.30; the Acute Respiratory Illness activity level, 0.25; emergency-department visits, 0.25; and laboratory test positivity, 0.20. Signals are frequently missing for a given state and week. When one is absent its weight is dropped and the rest are renormalized, and each state page states how many of the four it had. The full method is at <a href="/methodology/">methodology</a>; the datasets are at <a href="/data-sources/">data sources</a>.</p>

    <h2>What FluTrack refuses to publish</h2>
    <ul>
      <li><strong>No medical advice.</strong> FluTrack does not tell a reader what to do about a reading. It recommends and endorses no test, treatment, vaccine, medication, device or course of action. The full statement is at <a href="/medical-disclaimer/">medical disclaimer</a>.</li>
      <li><strong>No individual risk claim.</strong> A reading is a state-wide, population-level indicator covering one reported week. It cannot account for any individual's history, exposures or circumstances.</li>
      <li><strong>No prediction.</strong> The index summarizes activity already reported. It is not a forecast and not a live case count. Surveillance carries a lag of roughly one to two weeks, so every reading is presented with the direction it is moving and the week it covers.</li>
      <li><strong>No implied CDC affiliation.</strong> FluTrack is an independent project, not affiliated with, endorsed by, or sponsored by the Centers for Disease Control and Prevention or any government agency.</li>
      <li><strong>No unlabelled figures.</strong> Every number, level and map colour is either derived from a reported value or labelled as sample data. A page ships with a bundled sample snapshot so it is legible before the live fetch returns; that snapshot declares itself as sample data, and the page carries a provenance badge saying so until a live refresh succeeds. Where a state reported nothing, the page says so rather than substituting a figure.</li>
    </ul>

    <h2>Where the numbers come from</h2>
    <p>FluTrack ingests only public-domain U.S. Government data. Its dataset registry names each CDC resource it queries — NSSP emergency-department visits, the NSSP Acute Respiratory Illness activity level, and the NWSS Wastewater Viral Activity Level — and records each licence as public domain.</p>
    <p>Three of the four signals are queried live. Laboratory test positivity carries a defined weight of 0.20, but there is currently no live adapter for it: it is present in the bundled sample snapshot and absent from a live refresh, in which case its weight is renormalised away like any other missing signal and the state page reports how many of the four it actually had. This gap is stated here rather than left to be inferred from a reading that silently rests on three inputs.</p>
    <p>A snapshot file ships with the site so a page is legible immediately. It declares itself sample data in its own contents, and a live refresh may replace that label with a live-CDC-data badge only once it has produced usable signals for at least 25 of the 51 jurisdictions, with a week-ending date in ISO form. That floor exists because a successful response carrying no usable rows once let sample data be badged as live — an error recorded in the <a href="/changelog/">changelog</a>.</p>

    <h2>Licensing: an editorial rule enforced in code</h2>
    <p>Some widely cited wastewater data — the WastewaterSCAN network, also referenced as SCAN or Verily — is published under a CC BY-NC 4.0 non-commercial licence. FluTrack is operated as a commercial, advertising-supported project, so using that data would be a commercial use whether or not an advertisement is being served on a given day. It is therefore excluded outright rather than conditionally. The exclusion is not left to intention: the ingestion code runs a provenance filter that drops any wastewater row whose source field names those networks or their academic partners, and it has unit tests.</p>

    <h2>The thresholds are FluTrack's own, not the CDC's</h2>
    <p>The breakpoints separating Minimal from Low from Moderate, and so on, are FluTrack's editorial choices, informed by typical seasonal ranges in the underlying CDC products. They are not CDC-defined cut points, and no government agency sets, reviews or endorses them. Different thresholds would give different levels from the same data. Every one of those numbers is published in full at <a href="/methodology/">methodology</a>, which is what makes the choice defensible: it can be disagreed with specifically.</p>
    <p>The trend rule is editorial in the same way. FluTrack compares the most recent week against the mean of the prior up-to-three weeks; a change of 8 percent or more either way is labelled rising or falling, and anything between is holding steady. The reported percentage is clamped at 200 percent, since a very small off-season base can otherwise produce a misleading number. With fewer than two data points the trend reads “Not enough data”.</p>

    <h2>Corrections</h2>
    <p>FluTrack separates two things both called corrections. Surveillance figures are routinely revised as later reports arrive; FluTrack's numbers move with them on the next weekly refresh. The other kind — a mistake in how FluTrack computed or described something, or a deliberate change to the method — is recorded at <a href="/changelog/">corrections and changelog</a>.</p>
    <p>That log is append-only: a wrong entry is fixed by adding a corrective entry beneath it, never by rewriting history. Each entry is dated, categorised, and flagged according to whether the correction affected a reading that had already been published. If a figure does not match its CDC source, the reporting route is on <a href="/about/">about</a> and at the foot of the changelog.</p>

    <h2>Nothing here is medically reviewed</h2>
    <p>No clinician reviews FluTrack's content, and the site states this rather than omitting it. The site configuration carries an explicit flag recording that the content is not medically reviewed; the accountability block on <a href="/about/">about</a> renders directly from that flag, and a test asserts it stays false. Implying a review that does not exist is the failure this arrangement prevents. The publisher — ${escapeHtml(
      s.publisher.legalName
    )} — and the responsible-editor role that maintains the index method are named on the same block.</p>

    <h2>How money is kept away from the data</h2>
    <p>FluTrack is free. It is designed to be funded by display advertising and disclosed affiliate links; no advertising is served on the site today, and no affiliate link currently ships. The rules below apply from the moment either does, and are set out at <a href="/affiliate-disclosure/">affiliate and advertising disclosure</a>. A commercial link may only be rendered by one shared component, which emits the disclosure immediately before the link, in fixed wording the caller cannot supply, and with a sponsored and nofollow relationship on the anchor by default. A state's reading is never sold, sponsored or adjusted, and the threat level is not available as an advertising targeting parameter; that page also rules out targeting on precise location, alert status, symptom or condition, pregnancy, age, or inferred vulnerability. And every third party that touches visitor data is named by legal entity at <a href="/vendors/">vendors</a> — with its purpose, lawful basis, data categories, retention and deletion route — rendered from a single processor register that the <a href="/privacy/">privacy policy</a> reads from as well, so the two documents cannot describe a vendor differently.</p>

    <h2>Which of these rules the build enforces</h2>
    <p>Several rules above are release gates. The build's QA step blocks the deploy, and runs on the deploy workflow as well as on continuous integration.</p>
    <table>
      <thead>
        <tr><th>Rule</th><th>How it is enforced</th></tr>
      </thead>
      <tbody>
        <tr><td>A sponsored link ships with its disclosure attached</td><td>The QA step fails on any anchor carrying a sponsored relationship without the disclosure text immediately before it</td></tr>
        <tr><td>No page lists the CDC signals while omitting the Acute Respiratory Illness level</td><td>The QA step reads every page sentence by sentence and fails on a list naming three of the four. Most of the site once contradicted the methodology page</td></tr>
        <tr><td>The privacy policy and the vendor register name the same processors</td><td>The QA step fails if either page omits a registered processor, because both tell the reader the two cannot disagree</td></tr>
        <tr><td>The share image does not appear to encode per-state severity</td><td>The QA step decodes the image and fails if more than a negligible number of severity-ramp pixels appear in its map area, since no real per-state data exists at build time</td></tr>
        <tr><td>Icons and the share card are not truncated or blank</td><td>The QA step decodes every generated image and fails if its artwork does not reach the edge of its canvas</td></tr>
        <tr><td>Every indexable page has a title, description and canonical — and a noindex page declares none</td><td>The QA step crawls the output and fails on a missing tag, a canonical on a noindex page, a dead link, or a contact address at a domain that can never receive mail</td></tr>
        <tr><td>The site claims no medical review it does not have</td><td>A test asserts the medically-reviewed flag is false</td></tr>
        <tr><td>The per-state evidence block contains no advice</td><td>A test asserts it matches no advice pattern, populated and empty alike</td></tr>
      </tbody>
    </table>
    <p>None of this makes FluTrack correct. It makes a particular set of failures loud instead of silent, which is a narrower claim and a more honest one.</p>
  `,
    { updated: 'August 2026' }
  )}

  ${signupBand()}
  `;

  return {
    title: 'Editorial policy',
    description:
      "What FluTrack publishes and refuses to publish, where the numbers come from, whose thresholds these are, and which editorial rules the build enforces.",
    path: '/editorial-policy/',
    body,
    changefreq: 'yearly',
    priority: 0.4,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
