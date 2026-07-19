import { escapeHtml } from '../../../src/scripts/util.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /terms/ — Terms of Use. Required for YMYL trust and ad-network eligibility.
 * Plain but proper legal voice for an informational data-visualization utility:
 * the load-bearing clauses (no medical advice, not affiliated with the CDC, data
 * is a lagged trend provided AS IS) quote the centralized disclaimers verbatim so
 * the sanctioned wording stays identical everywhere. No invented company name or
 * jurisdiction beyond a neutral "United States". Sterile data-visualizer voice.
 */
export default function terms(ctx) {
  const { site, disclaimers } = ctx;
  const email = escapeHtml(site.publisher.email);
  const domain = escapeHtml(site.origin.replace(/^https?:\/\//, ''));

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Terms of Use', path: '/terms/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Terms',
    title: 'Terms of Use',
    lede:
      'These terms set out the simple agreement between you and FluTrack when you use this site — what FluTrack is, what it is not, and the reasonable limits that come with a free, informational utility built on public data.',
  })}

  ${prose(
    `
    <p>These Terms of Use (“Terms”) govern your access to and use of ${domain} and its features (together, the “Service”), operated by FluTrack (“FluTrack”, “we”, “us”). Please read them carefully. They are written to be understood, not to trip you up — but they are a binding agreement, so the plain wording still counts.</p>

    <div class="callout">
      <p class="callout__title"><span aria-hidden="true">✓</span> The short version</p>
      <p class="text-secondary">FluTrack is a free tool that translates public-domain CDC surveillance data into a plain-English respiratory threat level. It is information, not medical advice, and it is a weekly trend rather than a live count. Use it for your own understanding, don't pass it off as official or hammer our servers, and understand that it comes with no warranty.</p>
    </div>

    <h2>1. Acceptance of these Terms</h2>
    <p>By accessing or using the Service, you agree to be bound by these Terms and by our <a href="/privacy/">Privacy Policy</a>, which is incorporated here by reference. If you do not agree with any part of these Terms, please do not use the Service. If you use the Service on behalf of an organization, you represent that you are authorized to accept these Terms on its behalf.</p>

    <h2>2. What the Service is</h2>
    <p>FluTrack is an independent, informational data-visualization utility. Each week it reads public-domain respiratory-illness surveillance data published by the U.S. Centers for Disease Control and Prevention (CDC) and combines those signals into a single 0–4 threat level, with a rising-or-falling trend, for each U.S. state. You can read exactly which systems feed the index and how they are combined on our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a> pages. The Service describes what the data shows; it does not tell you what to do about it.</p>

    <h2>3. Not medical advice</h2>
    <p>This is the most important term on the page. FluTrack presents general information about population-level respiratory activity. It is not a diagnostic tool, it is not tailored to your circumstances, and it must never be used as a substitute for professional judgment.</p>
    <div class="callout callout--warn" role="note">
      <p class="callout__title"><span aria-hidden="true">◷</span> Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>
    <p>Nothing on the Service should be read as a recommendation to seek, obtain, or forgo any test, vaccination, medication, or other course of action. Any decision you make after reading FluTrack is your own, made in consultation with a qualified professional where appropriate.</p>

    <h2>4. Independence from the CDC</h2>
    <p>FluTrack is built entirely on the CDC's open data, but it is a separate, independent project with no affiliation to or endorsement from any government agency.</p>
    <div class="callout">
      <p class="callout__title"><span aria-hidden="true">✓</span> Independent, not official</p>
      <p class="text-secondary">${escapeHtml(disclaimers.notAffiliated)}</p>
    </div>
    <p>References to the CDC and to specific surveillance systems are made solely to credit and describe the underlying data sources. They do not imply any partnership, sponsorship, or review of the Service by those agencies.</p>

    <h2>5. Accuracy, timeliness and “as is” provision</h2>
    <p>The Service reflects surveillance data that is reported to the CDC on a delay and revised as later reports arrive. It is a directional indicator, not a real-time measurement.</p>
    <div class="callout callout--warn" role="note">
      <p class="callout__title"><span aria-hidden="true">◷</span> Trends, not real-time counts</p>
      <p>${escapeHtml(disclaimers.trendNotLive)}</p>
    </div>
    <p>The Service, and all information on it, is provided <strong>“as is” and “as available,” without warranties of any kind</strong>, whether express or implied. To the fullest extent permitted by law, we disclaim all warranties, including any implied warranties of merchantability, fitness for a particular purpose, non-infringement, and any warranty as to the <strong>accuracy, completeness, timeliness, or reliability</strong> of the data or the threat levels derived from it. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. You rely on the Service at your own discretion and risk.</p>

    <h2>6. Permitted use</h2>
    <p>FluTrack is free to read, and you are welcome to use it for your own personal, informational, or internal business purposes, and to link to it or share individual pages. You may also cite the threat levels in your own work, provided you attribute FluTrack and describe the figures accurately — for example, as a FluTrack index derived from public CDC surveillance data, not as an official CDC statistic.</p>

    <h2>7. Restrictions</h2>
    <p>To keep the Service available and honest for everyone, you agree not to:</p>
    <ul>
      <li>access the Service through automated means — scraping, crawling, or bulk requests — in a way that imposes an unreasonable or disproportionate load on our infrastructure, or that attempts to circumvent rate limits or other technical measures;</li>
      <li><strong>misrepresent the data as official</strong>, imply that FluTrack is affiliated with or endorsed by the CDC or any government agency, or present the FluTrack threat level as an authoritative government figure;</li>
      <li>remove, obscure, or alter any attribution, disclaimer, or notice that the Service is informational and not medical advice when reproducing our content;</li>
      <li>use the Service to develop a competing product by copying its presentation, design, or branding, as distinct from independently using the same underlying public data;</li>
      <li>interfere with or disrupt the Service, probe or test its vulnerabilities without authorization, or attempt to gain unauthorized access to any system or account; or</li>
      <li>use the Service for any unlawful purpose or in violation of these Terms.</li>
    </ul>
    <p>The underlying CDC data is in the public domain and is free for anyone to obtain directly from the sources we <a href="/data-sources/">document</a>. These restrictions concern how you interact with <em>our</em> Service and presentation, not your independent right to use the public data itself.</p>

    <h2>8. Intellectual property</h2>
    <p>It helps to separate two different things.</p>
    <p><strong>The underlying data is not ours.</strong> The surveillance figures FluTrack builds on are public-domain works of the U.S. Government. We claim no ownership over them, and nothing in these Terms restricts your right to obtain and use that public data directly.</p>
    <p><strong>The presentation is ours.</strong> The FluTrack name and branding, the design and layout of the site, the written copy, the specific way we compute and label the 0–4 threat level, and the overall arrangement of the Service are owned by FluTrack or its licensors and are protected by intellectual-property laws. Except for the personal and citation uses described above, you may not copy, reproduce, or reuse our presentation and branding without our permission.</p>

    <h2>9. Third-party and affiliate links</h2>
    <p>The Service links to third-party sites, including the CDC's own data portals, and may contain affiliate links through which we can earn a small commission if you make a purchase, at no extra cost to you. We do not control third-party sites and are not responsible for their content, products, or practices; visiting them is subject to their own terms and policies. Affiliate revenue never influences the threat levels we report — the index always reflects the CDC's figures alone. We explain these relationships in full on our <a href="/affiliate-disclosure/">affiliate disclosure</a> page.</p>

    <h2>10. Limitation of liability</h2>
    <p>To the fullest extent permitted by law, FluTrack and the people who work on it will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data, goodwill, or other intangible losses, arising out of or relating to your use of, or inability to use, the Service — including any decision made or action taken in reliance on the information it presents. Because the Service is provided free of charge, our total liability for any claim relating to the Service is limited, to the extent permitted by law, to one hundred U.S. dollars (US$100). Some jurisdictions do not allow certain limitations, so some of the above may not apply to you; in that case our liability is limited to the greatest extent permitted by law.</p>

    <h2>11. Indemnity</h2>
    <p>To the extent permitted by law, you agree to indemnify and hold harmless FluTrack and the people who work on it from any claims, losses, liabilities, and reasonable expenses (including legal fees) arising out of your misuse of the Service, your violation of these Terms, or your infringement of the rights of any third party.</p>

    <h2>12. Changes to the Service and to these Terms</h2>
    <p>FluTrack is an evolving project. We may change, suspend, or discontinue any part of the Service at any time, and we may update these Terms as the Service or the law changes. When we make a material change to these Terms, we will revise the “Last updated” date above and, where appropriate, make the change prominent rather than quietly editing it in. Your continued use of the Service after an update means you accept the revised Terms.</p>

    <h2>13. Governing law</h2>
    <p>These Terms are governed by the laws of the United States and of the state in which FluTrack is operated, without regard to conflict-of-law principles. You agree to resolve any dispute relating to the Service in the courts located in the United States, to the extent permitted by applicable law. If any provision of these Terms is found unenforceable, the remaining provisions will stay in full force.</p>

    <h2>14. Contact</h2>
    <p>Questions about these Terms are welcome. You can reach us at <a href="mailto:${email}">${email}</a>, and a real person will read it.</p>
  `,
    { updated: 'July 2026' }
  )}

  ${signupBand()}
  `;

  return {
    title: 'Terms of Use',
    description:
      'The Terms of Use for FluTrack: an informational data-visualization utility built on public CDC data — not medical advice, not official, provided as is.',
    path: '/terms/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
