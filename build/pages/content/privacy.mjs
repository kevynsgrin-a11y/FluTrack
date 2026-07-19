import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /privacy/ — Privacy Policy. Required for YMYL trust and ad-network eligibility.
 * Written to be accurate to how the site actually works: CDC data is fetched
 * client-side, "use my location" resolves through the FCC geocoder on tap only
 * (coordinates never stored), and the only browser storage is two localStorage
 * keys (theme + last state). Sterile, plain-language legal voice — no medical
 * guidance, no invented third-party vendor names beyond the CDC and FCC.
 */
export default function privacy(ctx) {
  const { site, disclaimers } = ctx;
  const email = escapeHtml(site.publisher.email);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Privacy Policy', path: '/privacy/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Privacy',
    title: 'Privacy Policy',
    lede:
      'FluTrack is a data-visualization utility, not a data-collection business. This policy explains, in plain language, the little information we handle when you use the site — and the choices you have over it.',
  })}

  ${prose(
    `
    <p>This Privacy Policy describes how FluTrack (“FluTrack”, “we”, “us”) handles information when you visit ${escapeHtml(
      site.origin.replace(/^https?:\/\//, '')
    )} and use its features. We have written it to be read, not to be endured. If anything here is unclear, email us at <a href="mailto:${email}">${email}</a> and a real person will answer.</p>

    <div class="callout">
      <p class="callout__title">${icon('check')} The short version</p>
      <p class="text-secondary">You can read the CDC threat level for every state without giving us anything at all. We ask for an email address only if you choose to sign up for surge alerts. We do not sell your information, and we set no cross-site tracking cookies of our own.</p>
    </div>

    <h2>Who we are</h2>
    <p>FluTrack is an independent publisher that turns public-domain CDC respiratory surveillance data into a plain-English, state-level threat level for flu, RSV and COVID-19. We are the data controller responsible for the information described in this policy. ${escapeHtml(
      disclaimers.notAffiliated
    )}</p>
    <p>You can reach us about anything in this policy, including a request to access or delete your information, at <a href="mailto:${email}">${email}</a>.</p>

    <h2>What we collect</h2>
    <p>We collect as little as the site can function on. In practice that falls into three narrow categories.</p>

    <h3>Information you give us</h3>
    <p>The only personal information you actively provide is what you submit to the <a href="/alerts/">surge-alert</a> form: your <strong>email address</strong> and the <strong>state</strong> you want alerts for. We use those two fields solely to send the weekly-at-most alert you asked for. We do not require a name, a password, or an account.</p>

    <h3>Information collected automatically</h3>
    <p>Like almost every website, our hosting provider records standard <strong>server logs</strong> when a page is requested — typically your IP address, the time of the request, the page fetched, and your browser's user-agent string. These logs exist for security, abuse prevention, and understanding aggregate traffic. If we enable <strong>analytics</strong>, we use a privacy-respecting service configured to measure visits in aggregate rather than to build a profile of you across sites, and we do not attempt to identify individual visitors from it.</p>

    <h3>Approximate location — only when you ask for it</h3>
    <p>The home page offers a “Use my location” button. It does nothing unless you tap it and your browser then grants permission. If you do, your device provides approximate coordinates, which are sent once to the U.S. Federal Communications Commission's public <a href="https://geo.fcc.gov/">Area API geocoder</a> (<code>geo.fcc.gov</code>) purely to resolve which U.S. state you are in. That state is used to pre-select the picker for you and nothing more. <strong>We do not store your coordinates or your resolved location</strong> — the value is discarded as soon as the picker is set. If you never tap the button, no location is ever requested.</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col">Why we handle it</th>
            <th scope="col">How long we keep it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Email address</th>
            <td>To send the surge alerts you subscribe to</td>
            <td>Until you unsubscribe, then removed</td>
          </tr>
          <tr>
            <th scope="row">Chosen state</th>
            <td>To know which state's alerts to send you</td>
            <td>With your subscription; also cached in your own browser</td>
          </tr>
          <tr>
            <th scope="row">Server logs (IP, time, user-agent)</th>
            <td>Security, abuse prevention, aggregate traffic</td>
            <td>A short retention window, then deleted or anonymized</td>
          </tr>
          <tr>
            <th scope="row">Aggregate analytics (if enabled)</th>
            <td>To see which pages are useful</td>
            <td>Kept in aggregate; not tied to your identity</td>
          </tr>
          <tr>
            <th scope="row">Approximate location</th>
            <td>To resolve “Use my location” to a state</td>
            <td>Not stored — discarded after resolving</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Cookies and browser storage</h2>
    <p>FluTrack itself sets <strong>no cross-site tracking cookies</strong>. The only data the site keeps on your device is two small entries in your browser's <code>localStorage</code>, which stay on your machine and are never transmitted to us:</p>
    <ul>
      <li><code>flutrack-theme</code> — remembers whether you prefer the light or dark appearance.</li>
      <li><code>flutrack-state</code> — remembers the last state you looked at, so the picker can restore it on your next visit.</li>
    </ul>
    <p>Both are conveniences, not trackers. You can clear them at any time through your browser's “clear site data” controls, and the site will simply fall back to its defaults.</p>

    <h2>Advertising</h2>
    <p>FluTrack is free and is intended to be supported in part by advertising. When advertising is enabled, third-party advertising partners that serve ads on the site may set their own cookies or use similar technologies to measure and, in some cases, personalize the ads you see. Where required by law, non-essential advertising and analytics cookies will be gated behind a consent prompt. Those partners operate under their own privacy policies, which we do not control. You can manage or opt out of interest-based advertising from participating companies through the industry choice tools at the <a href="https://optout.aboutads.info/">Digital Advertising Alliance</a>, the <a href="https://optout.networkadvertising.org/">Network Advertising Initiative</a>, and, in Europe, <a href="https://www.youronlinechoices.eu/">Your Online Choices</a>. Most browsers also let you block or delete third-party cookies directly.</p>

    <h2>Affiliate links</h2>
    <p>Some pages may contain affiliate links, where we can earn a small commission if you buy something through them, at no extra cost to you. Following such a link may pass standard referral information to the destination merchant, governed by that merchant's own privacy policy. Affiliate revenue never influences the threat levels we report — the index always reflects the CDC's figures alone. We explain these relationships in full on our <a href="/affiliate-disclosure/">affiliate disclosure</a> page.</p>

    <h2>Third-party services</h2>
    <p>FluTrack is a static site, and we keep external dependencies deliberately few:</p>
    <ul>
      <li><strong>CDC open data</strong> — the surveillance figures are fetched directly from the CDC's public-domain endpoints on <a href="https://data.cdc.gov/">data.cdc.gov</a> by your own browser. That request goes to the CDC, not through a server of ours that could re-host or reshape it.</li>
      <li><strong>FCC Area API</strong> — used only for the optional “Use my location” lookup described above, and only when you tap it.</li>
      <li><strong>Our email provider</strong> — surge alerts are delivered through a reputable third-party email service that processes your email address on our behalf, under its own security and privacy commitments, solely to send the messages you requested.</li>
    </ul>
    <p>We describe these providers by role rather than by brand because vendors can change; in every case they are used only for the narrow purpose above and are not permitted to use your information for their own marketing.</p>

    <h2>Surge-alert emails and unsubscribing</h2>
    <p>If you subscribe to surge alerts, we will email you when CDC data shows respiratory activity climbing in your chosen state — at most about once a week, and often less. Every alert email includes a one-click unsubscribe link, and unsubscribing takes effect immediately. You can also ask us to remove you by emailing <a href="mailto:${email}">${email}</a>. Once you unsubscribe, we delete your email address and state from the alert list.</p>

    <h2>How long we keep information</h2>
    <p>We keep information only as long as it serves the purpose it was collected for. Subscription details (your email and state) are retained until you unsubscribe. Server logs are kept for a short operational window and then deleted or anonymized. Analytics are retained only in aggregate. Location data from the “Use my location” feature is never retained at all.</p>

    <h2>Children's privacy</h2>
    <p>FluTrack is a general-audience information site and is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us an email address through the alert form, contact us at <a href="mailto:${email}">${email}</a> and we will delete it.</p>

    <h2>Your privacy rights</h2>
    <p>Because we hold so little, exercising your rights is simple: email <a href="mailto:${email}">${email}</a> and tell us what you would like. We will honor requests to <strong>access</strong> the information associated with your email address, to <strong>correct</strong> it, or to <strong>delete</strong> it.</p>
    <p>Depending on where you live, you may have additional rights under laws such as the EU/UK General Data Protection Regulation (GDPR) or the California Consumer Privacy Act (CCPA). In plain terms, that means you can ask us what we hold about you, ask us to delete it, and object to certain uses — and we will not treat you differently for asking. <strong>We do not sell your personal information</strong>, and we do not share it for cross-context behavioral advertising in exchange for payment. Where the GDPR applies, our lawful bases are your consent (for alert emails, which you can withdraw at any time) and our legitimate interest in keeping the site secure and understanding aggregate usage.</p>

    <h2>International visitors and data transfers</h2>
    <p>FluTrack covers U.S. respiratory surveillance and is operated from, and hosted in, the United States. If you access the site from outside the United States, the limited information described here — for example, an email address you submit for alerts — will be processed in the United States, which may have different data-protection rules than your home country. By using the site or subscribing to alerts, you understand that this transfer takes place.</p>

    <h2>Changes to this policy</h2>
    <p>We may update this policy as the site evolves or as the law requires. When we do, we will revise the “Last updated” date at the top of this page, and for material changes we will make the update prominent rather than quietly editing it in. Continued use of FluTrack after an update means you accept the revised policy.</p>

    <h2>Contact us</h2>
    <p>Questions, access or deletion requests, and privacy concerns are all welcome at <a href="mailto:${email}">${email}</a>.</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>
  `,
    { updated: 'July 2026' }
  )}

  ${signupBand()}
  `;

  return {
    title: 'Privacy Policy',
    description:
      'How FluTrack handles your data: email only for surge alerts, no tracking cookies of ours, location used on tap and never stored — and your data rights.',
    path: '/privacy/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
