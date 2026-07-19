import { escapeHtml } from '../../../src/scripts/util.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /medical-disclaimer/ — the single most important compliance page for a YMYL
 * health-data site. States, clearly and repeatedly, what FluTrack is and is
 * not: general information about population-level CDC surveillance, never
 * medical advice, diagnosis, or treatment, and never a real-time or individual
 * risk assessment. Leads with a strong warning callout and an emergency notice.
 * Sterile data-visualizer voice; all legal wording drawn from ctx.disclaimers.
 */
export default function medicalDisclaimer(ctx) {
  const { disclaimers } = ctx;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Medical Disclaimer', path: '/medical-disclaimer/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Important notice',
    title: 'Medical Disclaimer',
    lede:
      'FluTrack is a data-visualization utility. It translates public-domain CDC surveillance into a plain-English picture of respiratory-illness activity — general information about a population, not guidance about your health. Please read this page in full before relying on anything the site reports.',
  })}

  ${prose(
    `
    <div class="callout callout--warn" role="note">
      <p class="callout__title"><span aria-hidden="true">⚠</span> This is not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>

    <p>FluTrack combines the CDC's weekly respiratory surveillance signals — emergency-department visits, laboratory test positivity and wastewater viral activity — into a single 0–4 threat level and a rising-or-falling trend for each state. That number describes how much flu, RSV and COVID-19 activity the CDC's data indicates across a whole population. It is background context for everyday decisions, and nothing on this page, or anywhere on this site, is intended to diagnose, treat, cure, or prevent any illness.</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title"><span aria-hidden="true">✚</span> In a medical emergency, call 911</p>
      <p>If you or someone else may be experiencing a medical emergency, call 911 or your local emergency number, or go to the nearest emergency department right away. Never use FluTrack — or any website — to judge whether a situation is an emergency, and never delay seeking care or disregard professional advice because of something you read here.</p>
    </div>

    <h2>For general information only</h2>
    <p>Everything FluTrack publishes is provided for general informational purposes. It is not a substitute for the professional judgment of a physician, nurse, pharmacist, or other qualified health provider who knows your history and circumstances. FluTrack does not recommend or endorse any specific test, treatment, vaccine, medication, procedure, or course of action, and it does not tell you what to do about the activity levels it reports. We describe what the CDC's data shows; decisions about your health belong between you and your clinician.</p>

    <h2>No doctor–patient relationship</h2>
    <p>Using FluTrack, reading its threat levels, or subscribing to its surge alerts does not create a doctor–patient, provider–patient, or any other professional or fiduciary relationship between you and FluTrack. We do not know who you are, we cannot evaluate your individual condition, and we provide no personalized medical opinion. If you have a question about your own health, or about anyone in your care, consult a qualified health provider.</p>

    <h2>A delayed weekly trend, not a real-time or personal risk score</h2>
    <p>${escapeHtml(disclaimers.trendNotLive)} The reading you see reflects the most recently reported week of surveillance, which typically describes illness circulating one to two weeks earlier — not the situation today, and not a live case count. FluTrack is designed to answer "which way is respiratory activity heading in my state," not "am I currently at risk," and it should never be read as a real-time or individual risk assessment.</p>

    <h2>Population-level surveillance, not your personal risk</h2>
    <p>The threat level is a state-wide, population-level indicator. It cannot account for your age, medical history, vaccination status, exposures, occupation, household, or local conditions, and it says nothing about whether you personally are infected or likely to become ill. A "Low" reading does not mean you are safe, and a "High" reading does not mean you are sick. Only a qualified health provider can assess your individual risk. FluTrack reflects the data; it does not reflect you.</p>

    <h2>Independent — not affiliated with the CDC</h2>
    <p>FluTrack is built entirely on the CDC's open, public-domain data, but it is an independent project with no official standing.</p>
    <div class="callout" role="note">
      <p class="callout__title"><span aria-hidden="true">✓</span> Independent, not official</p>
      <p class="text-secondary">${escapeHtml(disclaimers.notAffiliated)}</p>
    </div>
    <p>Nothing on FluTrack is an official public-health communication. For official guidance, recommendations, and health information, consult the CDC directly at <a href="https://www.cdc.gov/" rel="nofollow noopener">cdc.gov</a> or your state and local health department.</p>

    <h2>No guarantee of accuracy, completeness, or timeliness</h2>
    <p>Surveillance data is provisional and is routinely revised as later reports arrive, and translating it into a single index necessarily involves modeling choices. FluTrack makes no representation or warranty, express or implied, that the information on this site is accurate, complete, current, or error-free. Reporting gaps, delayed or restated CDC figures, and the inherent lag described above all mean the picture can shift. You rely on the information at your own discretion, and FluTrack is not liable for any decision made or action taken based on it. Where we can explain how the index is built, we do — on our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a> pages.</p>

    <h2>Always consult a qualified health provider</h2>
    <p>For any question about symptoms, prevention, testing, treatment, vaccination, or your risk — for yourself or anyone you care for — seek the advice of a physician or other qualified health provider. Do not disregard, avoid, or delay obtaining professional medical advice because of anything you have read on FluTrack.</p>

    <h2>Questions</h2>
    <p>If anything on this page is unclear, or you would like to reach a real person about how FluTrack works, please <a href="/contact/">contact us</a>. For questions about your health, please contact your health provider.</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title"><span aria-hidden="true">⚠</span> The bottom line</p>
      <p>FluTrack is general information about population-level respiratory-illness trends from public CDC surveillance data. ${escapeHtml(
        disclaimers.short
      )} In an emergency, call 911, and for guidance about your health, consult a qualified provider.</p>
    </div>
  `,
    { updated: 'July 2026' }
  )}

  ${signupBand()}
  `;

  return {
    title: 'Medical Disclaimer',
    description:
      'FluTrack is general information from public-domain CDC surveillance data — not medical advice, diagnosis, or treatment. Read our full medical disclaimer.',
    path: '/medical-disclaimer/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
