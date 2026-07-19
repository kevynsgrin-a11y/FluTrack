import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, signupBand, breadcrumbs } from '../../lib/partials.mjs';
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
      <p class="muted">Last updated: July 2026</p>
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
          q: 'What is the respiratory threat level?',
          a: `<p>It is a single, plain-English rating — from <strong>Minimal</strong> to <strong>Very High</strong> — that summarizes how much combined flu, RSV and COVID-19 activity the CDC's surveillance data shows in a given state, paired with a trend of whether that activity is rising, falling or holding steady. It is a descriptive summary of recently reported data — not a forecast, not a case count, and not a measure of any one person's risk. Our <a href="/methodology/">methodology</a> documents exactly how it is built.</p>`,
        },
        {
          q: 'How current is the data?',
          a: `<p>FluTrack refreshes weekly. CDC surveillance systems publish on a weekly cadence, typically on Fridays, and each refresh reflects the most recent reporting week available. ${escapeHtml(
            disclaimers.trendNotLive
          )} Because reporting is collected and revised over time, the newest figures describe recent weeks rather than the current day.</p>`,
        },
        {
          q: 'Why does the data lag one to two weeks?',
          a: `<p>Surveillance figures are assembled from thousands of hospitals, laboratories and wastewater sites, then cleaned, aggregated and revised before the CDC publishes them. That pipeline takes time, so a given week's numbers generally reflect illness from one to two weeks earlier, and the most recent week or two can still shift as late reports arrive. ${escapeHtml(
            disclaimers.trendNotLive
          )} This is why FluTrack leads with the direction of travel rather than any single day's number.</p>`,
        },
        {
          q: 'How is the threat level calculated?',
          a: `<p>Four public-domain CDC signals — wastewater viral activity, emergency-department visits, an acute-respiratory-illness activity label, and laboratory test positivity — are each scored from 0 to 100, blended by fixed weights into one composite score, and mapped to one of five levels. A separate rule compares the latest week against the prior few to set the trend. Every weight, threshold and cut point is published on our <a href="/methodology/">methodology</a> page, so the calculation can be checked rather than taken on faith.</p>`,
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
          a: `<p>Entirely from the CDC's own public-domain surveillance systems: NSSP for emergency-department visits and the acute-respiratory-illness activity level, NWSS for wastewater viral activity, and NREVSS for laboratory test positivity. All of it is downloadable by anyone from <a href="https://data.cdc.gov/" rel="noopener">data.cdc.gov</a>. Our <a href="/data-sources/">data sources</a> page documents each feed, and our <a href="/methodology/">methodology</a> explains how they are combined.</p>`,
        },
        {
          q: "Why don't you show exact case counts?",
          a: `<p>Because a precise, real-time case count does not exist in this data. Modern respiratory surveillance measures activity through proxies — the share of ER visits, test positivity, wastewater concentrations — rather than a confirmed tally of every infection, and each figure carries a reporting lag and later revisions. A single hard number would imply a precision the data cannot support, so FluTrack reports a directional level and trend instead. ${escapeHtml(
            disclaimers.trendNotLive
          )}</p>`,
        },
        {
          q: 'What is wastewater surveillance, and why does it matter?',
          a: `<p>Communities shed traces of respiratory viruses into their sewage, and the CDC's National Wastewater Surveillance System (NWSS) measures those concentrations to produce a normalized viral-activity level. It carries weight because it does not depend on who chooses to get tested, and it can move ahead of clinical signals by several days — making it one of the earliest reads on where activity is heading. For that reason FluTrack weights it most heavily of the four signals; the exact weight is on our <a href="/methodology/">methodology</a> page.</p>`,
        },
        {
          q: 'Why did you exclude some wastewater data?',
          a: `<p>Some widely cited wastewater networks — WastewaterSCAN, also referenced as SCAN or Verily — publish under a <strong>CC BY-NC 4.0</strong> license, which permits non-commercial use only. FluTrack is supported by advertising and affiliate links, which makes it a commercial use, so incorporating that data would breach the license terms. FluTrack therefore ingests only the CDC's own public-domain NWSS product and filters the non-commercial networks out in code. Our <a href="/data-sources/">data sources</a> page explains the exclusion in full.</p>`,
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
