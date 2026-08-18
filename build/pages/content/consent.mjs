import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';
import { privacyEmail } from '../../lib/site.mjs';

/**
 * /consent/ — the live preference centre for non-essential storage.
 *
 * This page exists so the consent mechanism is inspectable rather than
 * promised. The markup is server-rendered and readable with JavaScript off;
 * `src/scripts/consent.js` makes the controls live and records the decision.
 *
 * Reject all, Manage preferences and Accept all all carry the SAME button
 * class. Equal prominence is the requirement, and it is enforced here in the
 * markup rather than left to a stylesheet to honour.
 */
export default function consent(ctx) {
  const { site } = ctx;
  const email = privacyEmail();

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Your Privacy Choices', path: '/consent/' },
  ];

  const categories = [
    {
      key: 'analytics',
      title: 'Analytics storage',
      desc:
        'Storage used to measure how the site is used — for example, remembering that a visit is part of the same session. Nothing in this category runs today: our only measurement tool, Cloudflare Web Analytics, is cookieless and writes nothing to your device, so it never reaches this gate.',
    },
    {
      key: 'advertising',
      title: 'Advertising storage',
      desc:
        'Storage used by advertising partners to measure or personalise ads. Nothing in this category runs today: FluTrack currently serves no advertising. If that changes, no ad tag will load until you have made a choice here.',
    },
  ];

  const rows = categories
    .map(
      (c) => `<div class="consent-row">
        <div class="consent-row__control">
          <input type="checkbox" id="consent-${c.key}" name="${c.key}">
          <label for="consent-${c.key}"><strong>${escapeHtml(c.title)}</strong></label>
        </div>
        <p class="text-secondary consent-row__desc">${c.desc}</p>
      </div>`
    )
    .join('\n        ');

  const body = `
  ${pageHeader({
    eyebrow: 'Your privacy choices',
    title: 'What runs on your device, and when',
    lede:
      'FluTrack denies all non-essential storage until you say otherwise. This page shows exactly what that covers, what is currently running, and how to change it at any time.',
  })}

  <section class="section" style="padding-top: 0">
    <div class="container container--narrow">
      <div class="callout">
        <p class="callout__title">${icon('shield-check')} Denied by default, everywhere</p>
        <p class="text-secondary">Advertising and analytics storage start in a <strong>denied</strong> state for every visitor, not only where the law requires a prompt. Deciding per-country would mean locating you before we could decide what we are allowed to store about you, and getting it wrong fails in the direction that harms you. Denying by default needs no location signal at all.</p>
      </div>

      <form class="card consent-prefs" id="consent-preferences" style="margin-top: var(--space-lg)">
        <h2 style="font-size: var(--step-1)">Manage preferences</h2>
        <p class="text-secondary" data-consent-status style="margin-top: var(--space-2xs)">Current setting: all non-essential storage is denied. No decision has been recorded yet, and nothing non-essential has run.</p>

        <div class="consent-rows" style="margin-top: var(--space-lg)">
        ${rows}
        </div>

        <!-- Same class on all three: equal prominence is a requirement, not a
             styling preference, so it is fixed in the markup. -->
        <div class="cluster consent-actions" style="margin-top: var(--space-lg)">
          <button class="btn btn--secondary" type="button" data-consent="reject">Reject all</button>
          <button class="btn btn--secondary" type="button" data-consent="save">Save my choices</button>
          <button class="btn btn--secondary" type="button" data-consent="accept">Accept all</button>
        </div>
        <p class="muted" style="margin-top: var(--space-md)">
          <button class="linklike" type="button" data-consent="withdraw">Withdraw my decision and start over</button>
          — withdrawing is exactly as easy as granting, and returns you to denied-by-default.
        </p>

        <div class="callout" style="margin-top: var(--space-lg)">
          <p class="callout__title">${icon('check')} Global Privacy Control</p>
          <p class="text-secondary" data-consent-gpc>If your browser sends a Global Privacy Control signal, we treat it as a decision to reject non-essential storage, record it automatically, and never show you a prompt. You can still change it on this page.</p>
        </div>
      </form>
    </div>
  </section>

  ${prose(
    `
    <h2>The standard we hold ourselves to</h2>
    <p>These are the rules the site is built against, written down so they can be checked against what actually ships:</p>
    <ul>
      <li><strong>Nothing non-essential loads before a decision is recorded.</strong> The gate is consulted on every page, ahead of any page-specific script. A tag that is not registered against a granted category has no route to run.</li>
      <li><strong>A decision is a record, not a dismissal.</strong> We store the categories you chose, where the choice was made, and when — because “we had consent” is only meaningful if you can say what was asked and when it was answered.</li>
      <li><strong>Reject all is offered as prominently as Accept all</strong>, in the same visual weight, everywhere the choice appears.</li>
      <li><strong>Global Privacy Control is honored</strong> as an expressed opt-out wherever it applies.</li>
      <li><strong>Withdrawal is as easy as granting.</strong> One control clears the record and returns everything to denied.</li>
    </ul>

    <h2>What is <em>not</em> covered here</h2>
    <p>Some things are necessary for the site to work at all, and are not part of this choice. We list every one of them, by legal entity, in our <a href="/vendors/">vendor register</a>:</p>
    <ul>
      <li><strong>Your theme and last-viewed state</strong> — two small entries in your browser's own storage (<code>flutrack-theme</code>, <code>flutrack-state</code>). They never leave your device.</li>
      <li><strong>Your consent decision itself</strong> — stored as <code>flutrack-consent</code>, because we cannot honor a choice we do not remember.</li>
      <li><strong>Server logs and security</strong> — standard request records kept by our host for abuse prevention.</li>
      <li><strong>The surge-alert subscription</strong> — only if you submit the form, and only to send what you asked for.</li>
    </ul>
    <p>Cloudflare Web Analytics sits in an unusual spot worth naming plainly: it is <em>categorised</em> as analytics, but it is cookieless and stores nothing on your device, so it never engages this gate. We describe it in full in our <a href="/privacy/">Privacy Policy</a> and in the <a href="/vendors/">vendor register</a> rather than hiding it behind a prompt that would not actually govern it.</p>

    <h2>Questions or requests</h2>
    <p>${
      email
        ? `To ask what we hold, or to have it corrected or deleted, write to <a href="mailto:${escapeHtml(
            email
          )}">${escapeHtml(email)}</a> and a real person will answer.`
        : 'To ask what we hold, or to have it corrected or deleted, use our <a href="/contact/">contact page</a>.'
    } The full picture is in our <a href="/privacy/">Privacy Policy</a>.</p>
  `,
    { updated: 'August 2026' }
  )}
  `;

  return {
    title: 'Your Privacy Choices',
    description:
      'Manage FluTrack’s non-essential storage. Advertising and analytics storage are denied by default, Global Privacy Control is honored, and nothing loads before you decide.',
    path: '/consent/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
