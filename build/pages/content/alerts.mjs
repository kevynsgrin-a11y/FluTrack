import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd, faqLd } from '../../lib/seo.mjs';

/**
 * /alerts/ — landing page for the free "surge alert" email list (the product's
 * key retention wedge). Leads with the header, features the signupBand as the
 * primary CTA, then explains how it works in three steps and sets expectations
 * plainly: a weekly directional heads-up from CDC data — never an emergency or
 * medical alert. Sterile data-visualizer voice; describes the data, never
 * prescribes. Sanctioned disclaimer wording is pulled from ctx.disclaimers.
 */
export default function alerts(ctx) {
  const { disclaimers } = ctx;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Surge alerts', path: '/alerts/' },
  ];

  // Trust-focused Q&A — answers describe what the alert is, never what to do.
  const faqs = [
    {
      q: 'How often will I hear from you?',
      a: `<p>At most about once a week, and only when CDC data shows your state's respiratory trend turning upward. When activity is flat or easing, we stay quiet — there is no weekly newsletter and no digest to wade through.</p>`,
    },
    {
      q: 'Is a surge alert an emergency or a medical alert?',
      a: `<p>No. A surge alert is a directional heads-up derived from CDC surveillance data, which is reported with a lag of roughly one to two weeks. It describes what the trend is doing — not what you should do about it — and it is not a substitute for advice from a qualified health provider.</p>`,
    },
    {
      q: 'Will you sell or share my email address?',
      a: `<p>No. We ask only for your email and the state you want to watch, we do not sell or share your address, and every alert includes a one-click unsubscribe. See our <a href="/privacy/">Privacy Policy</a> for the full detail.</p>`,
    },
    {
      q: 'Is it really free?',
      a: `<p>Yes. FluTrack is a free, ad-supported utility, and the surge alert is part of that — no account, no payment, no catch.</p>`,
    },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Surge alerts',
    title: 'Know when respiratory illness starts climbing near you',
    lede:
      "FluTrack's free surge alert watches the CDC's weekly surveillance data for your state and emails you when flu, RSV or COVID-19 activity turns upward — at most about once a week, no spam, and only when the trend actually changes.",
  })}

  ${signupBand()}

  <section class="section" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">How it works</p>
        <h2>Set it once — then we watch for you</h2>
        <p class="text-secondary">We read the CDC every week so you don't have to. No account, no login.</p>
      </div>
      <div class="steps">
        <div class="step">
          <h3>Pick your state</h3>
          <p class="text-secondary">Tell us which state to watch and where to send the email. There is nothing to install and no account to create.</p>
        </div>
        <div class="step">
          <h3>We watch the CDC signals</h3>
          <p class="text-secondary">Each week we read the CDC's public-domain surveillance — emergency-department visits, lab test positivity and wastewater viral activity — and recompute your state's combined threat level. <a href="/methodology/">See the method →</a></p>
        </div>
        <div class="step">
          <h3>You get a heads-up when the trend turns up</h3>
          <p class="text-secondary">When the data shows activity climbing, we send a short, plain-English summary of what changed. When it is flat or falling, your inbox stays quiet.</p>
        </div>
      </div>
    </div>
  </section>

  ${prose(`
    <h2>A heads-up, not an alarm</h2>
    <p>A surge alert is a directional signal, not a real-time warning. It reflects the same public CDC surveillance FluTrack shows on every state page, so it tells you which way respiratory activity is <em>trending</em> in your state — not that anything is happening at this precise moment. It is not an emergency notification, and it is not a medical alert.</p>
    <p class="text-secondary">${escapeHtml(disclaimers.trendNotLive)}</p>
    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>

    <h2>Your email, and nothing more</h2>
    <p>Signing up asks for exactly two things — your email address and the state you want to watch — and we use them for exactly one purpose: sending your surge alerts. We do not sell or share your address, and every email carries a one-click unsubscribe, so you can leave the list at any time. The full detail lives in our <a href="/privacy/">Privacy Policy</a>.</p>

    <h2>Independent, not official</h2>
    <p>Surge alerts are built entirely on the CDC's open, public-domain data, but FluTrack is an independent project with no affiliation, funding relationship, or special access.</p>
    <div class="callout">
      <p class="callout__title">${icon('check')} No CDC affiliation</p>
      <p class="text-secondary">${escapeHtml(disclaimers.notAffiliated)}</p>
    </div>
  `)}

  <section class="section" style="background: var(--bg-elevated); border-block: 1px solid var(--border)">
    <div class="container container--narrow">
      <h2 style="font-size: var(--step-2)">Common questions</h2>
      <div style="margin-top: var(--space-md)">
        ${faqs
          .map(
            (f) => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><div class="faq-item__body">${f.a}</div></details>`
          )
          .join('')}
      </div>
    </div>
  </section>
  `;

  return {
    title: 'Surge alerts',
    description:
      'Free FluTrack surge alerts email you when CDC data shows flu, RSV or COVID-19 activity climbing in your state — at most weekly, no spam, not medical advice.',
    path: '/alerts/',
    body,
    changefreq: 'monthly',
    priority: 0.6,
    jsonld: [breadcrumbLd(crumbs), faqLd(faqs.map((f) => ({ q: f.q, a: stripTags(f.a) })))],
  };
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
