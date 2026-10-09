import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, signupBand, breadcrumbs, revisedOn, revisedLabel } from '../../lib/partials.mjs';
import { breadcrumbLd, faqLd } from '../../lib/seo.mjs';

/**
 * /faq/ — a comprehensive, plain-English FAQ.
 *
 * Grouped under three <h2> sections (Using FluTrack, The data, Trust & privacy)
 * of .faq-item <details> accordions. Every answer describes the DATA and the
 * project — no advice, diagnosis, or prescriptive instruction. The same
 * question/answer text drives a FAQPage JSON-LD block (plain-text answers via
 * stripTags), so the accordions and the structured data can never drift apart.
 */
export default function faq(ctx) {
  const { disclaimers } = ctx;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'FAQ', path: '/faq/' },
  ];

  const groups = faqGroups(disclaimers);

  // Flatten every group's questions for the FAQPage structured data.
  const allFaqs = groups.flatMap((g) => g.items);

  const sections = groups
    .map(
      (g) => `
      <h2 id="${escapeHtml(g.id)}" style="font-size: var(--step-2); margin-top: var(--space-2xl)">${escapeHtml(
        g.heading
      )}</h2>
      ${g.intro ? `<p class="text-secondary" style="margin-top: var(--space-xs)">${g.intro}</p>` : ''}
      <div style="margin-top: var(--space-md)">
        ${g.items
          .map(
            (f) =>
              `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`
          )
          .join('\n        ')}
      </div>`
    )
    .join('\n');

  const body = `
  ${pageHeader({
    eyebrow: 'FAQ',
    title: 'Questions about FluTrack, answered',
    lede:
      "FluTrack turns the CDC's weekly respiratory surveillance into one plain-English answer for your state. These are the questions people ask most about what that answer means, where it comes from, and how far it can be read.",
  })}

  <section class="section" style="padding-top: 0">
    <div class="container container--narrow">
      ${breadcrumbs(crumbs)}
      <p class="muted">Last updated: ${revisedLabel('/faq/')}</p>
      <p class="text-secondary">For the full computation behind every rating, see our
      <a href="/methodology/">methodology</a>; for each dataset that feeds it, see our
      <a href="/data-sources/">data sources</a>. Everything below describes what the surveillance
      data shows — it is not medical advice.</p>
      ${sections}

      <div class="callout callout--warn" role="note" style="margin-top: var(--space-2xl)">
        <p class="callout__title">${icon('clock')} Not medical advice</p>
        <p>${escapeHtml(disclaimers.notMedical)}</p>
      </div>
    </div>
  </section>

  ${signupBand()}
  `;

  return {
    title: 'FAQ: frequently asked questions',
    description:
      'Common questions about FluTrack — what the respiratory threat level means, where the CDC data comes from, the reporting lag, privacy and funding.',
    path: '/faq/',
    lastmod: revisedOn('/faq/'),
    body,
    ogType: 'article',
    changefreq: 'monthly',
    priority: 0.6,
    jsonld: [breadcrumbLd(crumbs), faqLd(allFaqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

/**
 * The FAQ content, grouped for both display and structured data.
 * Answers are HTML strings; keep them descriptive of the data only.
 */
function faqGroups(disclaimers) {
  return [
    {
      id: 'using-flutrack',
      heading: 'Using FluTrack',
      intro: 'What the rating means, how fresh it is, and how to follow a state.',
      items: [
        {
          q: 'What is the combined respiratory index?',
          a: `<p>It is a rating — from <strong>Minimal</strong> to <strong>Very High</strong> — of available flu, RSV and COVID-19 surveillance inputs for a state. It summarizes the dated observations, with a trend only when enough comparable history exists. It is not an influenza-only level, an infection count, a forecast or a personal risk score. Sample data is illustrative, and missing or stale observations cannot establish current conditions. Our <a href="/methodology/">methodology</a> documents the calculation.</p>`,
        },
        {
          q: 'How current is the data?',
          a: `<p>The index sources generally publish weekly, with source-specific schedules and reporting delays. ${escapeHtml(
            disclaimers.trendNotLive
          )} The observation period is separate from publication and retrieval dates: fetching September observations in October does not establish October conditions. The newest figures can be revised, and an older observation may still be the latest scheduled release.</p>`,
        },
        {
          q: 'Why does the data lag one to two weeks?',
          a: `<p>Surveillance figures are assembled from thousands of hospitals, laboratories and wastewater sites, then cleaned, aggregated and revised before the CDC publishes them. That pipeline takes time, so a given week's numbers generally reflect illness from one to two weeks earlier, and the most recent week or two can still shift as late reports arrive. ${escapeHtml(
            disclaimers.trendNotLive
          )} This is why FluTrack leads with the direction of travel rather than any single day's number.</p>`,
        },
        {
          q: 'How is the threat level calculated?',
          a: `<p>The model scores available wastewater viral activity, emergency-department visits and the Acute Respiratory Illness activity label from 0 to 100, blends them with fixed weights and maps the result to five levels. Laboratory positivity has a model weight but no live adapter; it appears only in illustrative samples. The trend compares the latest observation with the mean of up to three prior observations, not an ordinary week-over-week change. With insufficient history the trend is unknown. See our <a href="/methodology/">methodology</a> for each weight and threshold.</p>`,
        },
        {
          q: 'How do surge alerts work?',
          a: `<p>A surge alert is an optional email that flags when CDC data shows respiratory activity climbing in a state you follow. You pick a state, and FluTrack emails you when the trend for that state turns upward — at most about once a week, and never more often than the data warrants. You can set one up on the <a href="/alerts/">surge alerts</a> page and unsubscribe at any time. The alert reports what the data shows; it does not advise a course of action.</p>`,
        },
      ],
    },
    {
      id: 'the-data',
      heading: 'The data',
      intro: 'Where the numbers come from, what they can and cannot say, and how to reuse them.',
      items: [
        {
          q: 'Where does the data come from?',
          a: `<p>The implemented live index feeds are NSSP emergency-department visits and the Acute Respiratory Illness activity level, and NWSS wastewater viral activity, from <a href="https://data.cdc.gov/" rel="noopener">data.cdc.gov</a> through the existing ingestion service. Only usable observations contribute to a reading. NREVSS laboratory positivity is unavailable live; sample inputs are labeled as illustrative. Hospital admissions in the area card come from NHSN and are a separate measure, outside the index. Our <a href="/data-sources/">data sources</a> page documents each feed.</p>`,
        },
        {
          q: "Why don't you show exact case counts?",
          a: `<p>Because a precise, real-time case count does not exist in this data. Modern respiratory surveillance measures activity through proxies — the share of ER visits, test positivity, wastewater concentrations — rather than a confirmed tally of every infection, and each figure carries a reporting lag and later revisions. A single hard number would imply a precision the data cannot support, so FluTrack reports a directional level and trend instead. ${escapeHtml(
            disclaimers.trendNotLive
          )}</p>`,
        },
        {
          q: 'What is wastewater surveillance, and why does it matter?',
          a: `<p>The CDC's National Wastewater Surveillance System (NWSS) measures viral material in wastewater to produce a normalized activity index. It describes participating sewersheds, not infection counts, test positivity, ED visits or hospital admissions. Coverage differs across places and viruses; a local wastewater increase cannot establish a statewide or national trend. FluTrack's wastewater weight is an editorial choice documented in our <a href="/methodology/">methodology</a>.</p>`,
        },
        {
          q: 'Does missing data mean there is no illness?',
          a: `<p>No. Surveillance gaps describe missing coverage, not the absence of illness. Missing values are not zeros, an unavailable pathogen is not rated low, and insufficient history is not holding steady. A state or metro reading cannot substitute for independently measured city conditions, and a national trend cannot substitute for the selected state.</p>`,
        },
        {
          q: 'Why did you exclude some wastewater data?',
          a: `<p>WastewaterSCAN / SCAN data is licensed <strong>CC BY-NC 4.0</strong>, which permits non-commercial use only; FluTrack excludes it because the project is designed for commercial use. The existing conservative provenance filter also excludes Verily-marked rows. A provider name does not establish a dataset's license: the CDC's September 28, 2026 Verily testing-contract award is distinct from the WastewaterSCAN license and does not automatically identify its data as WastewaterSCAN data. Our <a href="/data-sources/">data sources</a> page explains the filter and its coverage limits.</p>`,
        },
        {
          q: 'Can I use FluTrack data?',
          a: `<p>The underlying CDC surveillance data is public-domain U.S. Government work and free for anyone to reuse — you can pull the same feeds directly from <a href="https://data.cdc.gov/" rel="noopener">data.cdc.gov</a>. FluTrack's presentation of it — the threat-level wording, the editorial thresholds, the design and the copy — is our own work; please attribute FluTrack and link back rather than republishing pages wholesale. For specific reuse, licensing or partnership questions, <a href="/contact/">contact us</a>.</p>`,
        },
      ],
    },
    {
      id: 'trust-privacy',
      heading: 'Trust & privacy',
      intro: 'Independence, funding, and what happens to your information.',
      items: [
        {
          q: 'Is this medical advice?',
          a: `<p>No. ${escapeHtml(
            disclaimers.notMedical
          )} FluTrack is a data-visualization utility that describes what public surveillance data shows in aggregate; it does not diagnose, treat, or recommend any course of action.</p>`,
        },
        {
          q: 'Are you affiliated with the CDC?',
          a: `<p>No. ${escapeHtml(
            disclaimers.notAffiliated
          )} FluTrack is built on the CDC's open, public-domain data, but building on government data does not imply that the government endorses this site.</p>`,
        },
        {
          q: 'How does FluTrack make money?',
          a: `<p>FluTrack is free to use and is supported by advertising and clearly disclosed affiliate links, where we may earn a commission on qualifying purchases at no extra cost to you. That revenue never influences the threat levels we report: the index is computed the same way regardless of who advertises, and it always reflects the CDC's figures alone. Our <a href="/affiliate-disclosure/">affiliate disclosure</a> explains the arrangement in full.</p>`,
        },
        {
          q: 'Is my data private?',
          a: `<p>FluTrack works without a login, and you never need an account to view any threat level. If you sign up for surge alerts, your email address is used only to send the alerts you asked for, and you can unsubscribe at any time. The full details of what is collected and how it is handled are in our <a href="/privacy/">privacy policy</a>.</p>`,
        },
      ],
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
