import { escapeHtml } from '../../../src/scripts/util.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd, organizationLd } from '../../lib/seo.mjs';

/**
 * /contact/ — E-E-A-T transparency page. Gives a real, published contact route
 * for every kind of message (general questions, data corrections, press,
 * partnerships), states the corrections commitment plainly, and draws a hard
 * line: FluTrack is an independent data-visualization utility, not affiliated
 * with the CDC and not a medical service. Sterile data-visualizer voice — it
 * describes how to reach us, it never gives medical guidance.
 */
export default function contact(ctx) {
  const { site, disclaimers } = ctx;
  const email = site.publisher.email;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Contact', path: '/contact/' },
  ];

  // Each route is a real mailbox destination with a pre-filled subject so a
  // message lands in the right place and a real person can route it quickly.
  const routes = [
    {
      title: 'General questions',
      desc:
        "Something on the site you'd like explained, a reading you're not sure how to read, or feedback on FluTrack itself — send it here and a real person will read it.",
      subject: 'General question',
      cta: 'Ask a question',
    },
    {
      title: 'Data corrections',
      desc:
        "Spotted a figure that looks wrong, a state that seems mislabeled, or a trend that doesn't match the CDC source? Flag it and we'll investigate.",
      subject: 'Data correction',
      cta: 'Report a correction',
    },
    {
      title: 'Press & media',
      desc:
        'Journalists and researchers can reach us for background on how the threat level is built, the public-domain sources behind it, or a specific figure.',
      subject: 'Press inquiry',
      cta: 'Contact for press',
    },
    {
      title: 'Advertising & partnerships',
      desc:
        'Advertising, syndication and partnership inquiries are welcome. Commercial relationships never influence the threat levels we report or how we describe the data.',
      subject: 'Partnership inquiry',
      cta: 'Start a conversation',
    },
  ];

  const routeCards = routes.map((r) => routeCard(email, r)).join('\n      ');

  const body = `
  ${pageHeader({
    eyebrow: 'Contact',
    title: 'Get in touch with FluTrack',
    lede:
      'Questions, corrections, press inquiries and partnership ideas are all welcome. Pick the route that fits and a real person will read what you send.',
  })}

  <section class="section" style="padding-top: 0">
    <div class="container container--narrow">
      <p class="text-secondary">The fastest way to reach us is email. Write to <a href="mailto:${escapeHtml(
        email
      )}"><strong>${escapeHtml(
    email
  )}</strong></a>, or use one of the routes below to land your message in the right place.</p>
      <div class="grid-2" style="margin-top: var(--space-xl)">
      ${routeCards}
      </div>
    </div>
  </section>

  ${prose(`
    <h2>Our corrections commitment</h2>
    <p>Accuracy is the whole point of a data utility, so we take corrections seriously. When you report something that looks wrong, we compare FluTrack's figure against the underlying CDC surveillance source, confirm whether the discrepancy is real, and fix confirmed errors promptly — usually on the next weekly refresh, and sooner where a page is materially misleading. Where a change alters what a page said, we note the correction rather than quietly editing it away.</p>
    <p>One distinction worth naming: surveillance data is routinely <em>revised</em> as later reports arrive, and FluTrack's numbers move with those revisions automatically. That is the data updating as designed, not an error. A genuine mistake — a miscomputed index, a mislabeled state, a broken source link — is something we want to hear about, and something we will correct.</p>

    <h2>For medical concerns</h2>
    <p>FluTrack is a data-visualization utility, not a medical service. We cannot answer questions about your symptoms, offer a diagnosis, or advise on testing, vaccination or treatment, and we cannot respond to medical emergencies. Messages about a personal health situation are outside what this project can help with.</p>
    <div class="callout callout--warn" role="note">
      <p class="callout__title"><span aria-hidden="true">◷</span> Not a medical service</p>
      <p>For questions about your health, contact a qualified healthcare provider. If you think you are experiencing a medical emergency, call your local emergency number (911 in the United States) or go to the nearest emergency department. ${escapeHtml(
        disclaimers.notMedical
      )}</p>
    </div>

    <h2>Independent, not official</h2>
    <p>FluTrack is built entirely on the CDC's public-domain data, but it is an independent project with no affiliation, funding relationship, or special access. If you are trying to reach the CDC itself, this is not the place — we cannot relay messages to any government agency.</p>
    <div class="callout">
      <p class="callout__title"><span aria-hidden="true">✓</span> No CDC affiliation</p>
      <p class="text-secondary">${escapeHtml(disclaimers.notAffiliated)}</p>
    </div>
  `)}

  ${signupBand()}
  `;

  return {
    title: 'Contact',
    description:
      'Contact FluTrack for general questions, data corrections, press and partnership inquiries. Independent of the CDC, and not a medical service.',
    path: '/contact/',
    body,
    changefreq: 'monthly',
    priority: 0.5,
    jsonld: [breadcrumbLd(crumbs), organizationLd()],
  };
}

/** A single contact-route card with a pre-addressed mailto action. */
function routeCard(email, { title, desc, subject, cta }) {
  const href = `mailto:${escapeHtml(email)}?subject=${encodeURIComponent(subject)}`;
  return `<div class="card">
        <h2 style="font-size: var(--step-1)">${escapeHtml(title)}</h2>
        <p class="text-secondary" style="margin: var(--space-2xs) 0 var(--space-md)">${escapeHtml(
          desc
        )}</p>
        <a class="btn btn--secondary" href="${href}">${escapeHtml(cta)}</a>
      </div>`;
}
