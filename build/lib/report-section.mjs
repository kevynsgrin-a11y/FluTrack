// ===========================================================================
// Home-page "Check your area / Report how you feel" section — server-rendered,
// fully usable without JavaScript:
//   * "Check my area" is a GET form to /api/area (HTML result page without JS)
//   * the report is a POST form to /api/report. Consent comes first; "I feel
//     fine" is a single submit button; "I feel sick" is a <details> disclosure
//     holding the symptom questions, so it opens without JS too.
// src/scripts/report-widget.js upgrades both in place when JS runs.
//
// Field names and options come from src/scripts/report-schema.js — the same
// lists the server validates against. No ad slot may sit in or beside this
// section (see home.mjs).
// ===========================================================================

import { escapeHtml } from '../../src/scripts/util.js';
import { SYMPTOMS, ONSET, AGE_BANDS, VACCINATED, TEST_TYPES, TEST_RESULTS, HOUSEHOLD } from '../../src/scripts/report-schema.js';

const esc = escapeHtml;

const select = (name, label, options, { hint = '', blank = 'Prefer not to say' } = {}) => `
      <div class="field">
        <label class="field__label" for="rf-${name}">${esc(label)}</label>
        <select class="select" id="rf-${name}" name="${name}">
          <option value="">${esc(blank)}</option>
          ${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}
        </select>${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
      </div>`;

const radios = (name, legend, options) => `
      <fieldset class="field report__radios">
        <legend class="field__label">${esc(legend)}</legend>
        <div class="cluster">${options
          .map(([v, l]) => `<label class="choice"><input type="radio" name="${name}" value="${esc(v)}"><span>${esc(l)}</span></label>`)
          .join('')}</div>
      </fieldset>`;

export function reportSection({ siteKey = '', enabled = true } = {}) {
  const canReport = enabled && Boolean(siteKey);
  const symptomBoxes = SYMPTOMS.map(
    ([k, l]) => `<label class="choice choice--box"><input type="checkbox" name="${k}" value="1"><span>${esc(l)}</span></label>`
  ).join('');

  const reportForm = canReport
    ? `<form class="report__form" method="post" action="/api/report" data-report-form data-sitekey="${esc(siteKey)}">
      <h3 class="report__h">Report how you feel</h3>
      <p class="text-secondary">Anonymous and quick. Your report joins a weekly count for your county — it never changes the CDC-based level.</p>
      <div class="report__hp" aria-hidden="true"><label for="rf-website">Website (leave blank)</label><input id="rf-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <input type="hidden" name="returning" value="0" data-returning>
      <div class="field">
        <label class="field__label" for="rf-zip">Your ZIP code <span class="muted">(optional)</span></label>
        <input class="input report__zip" id="rf-zip" name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code" placeholder="e.g. 92101">
        <span class="field__hint">Used once to find your county, then discarded. Leave blank to use your approximate location.</span>
      </div>
      <label class="choice choice--consent"><input type="checkbox" name="consent" value="1" required><span>I agree to share this anonymous report as described in the <a href="/consumer-health-data-privacy/">consumer health data privacy notice</a>.</span></label>
      <div class="report__turnstile" data-turnstile></div>
      <noscript><p class="field__hint">Sending a report needs JavaScript for a privacy-friendly bot check (Cloudflare Turnstile). You can still check your area without it.</p></noscript>
      <p class="report__q">How are you feeling today?</p>
      <div class="report__feeling">
        <button class="btn btn--primary btn--lg" type="submit" name="feeling" value="fine">I feel fine</button>
        <details class="report__sick" data-sick>
          <summary class="btn btn--secondary btn--lg">I feel sick</summary>
          <div class="report__sick-body">
            <fieldset class="field">
              <legend class="field__label">Which symptoms? <span class="muted">Tick all that apply.</span></legend>
              <div class="report__symptoms">${symptomBoxes}</div>
            </fieldset>
            ${select('onset_bucket', 'When did they start?', ONSET, { blank: 'Not sure' })}
            <details class="report__more">
              <summary>A few optional questions</summary>
              <div class="report__more-body">
                ${select('age_band', 'Age', AGE_BANDS)}
                ${radios('vaccinated', 'Flu shot this season?', VACCINATED)}
                ${select('test_type', 'Did you take a test?', TEST_TYPES, { blank: 'No test' })}
                ${select('test_result', 'Test result', TEST_RESULTS, { blank: 'No result yet', hint: 'Self-reported. We never treat it as verified.' })}
                ${select('household_sick', 'Others sick at home?', HOUSEHOLD)}
              </div>
            </details>
            <button class="btn btn--primary btn--lg" type="submit" name="feeling" value="sick">Send my report</button>
          </div>
        </details>
      </div>
      <p class="report__fine">One report per device per week. We keep your symptoms, age band, county and the week — never your name, email, exact location, IP address or full ZIP code. Raw reports are deleted after 90 days. <a href="/consumer-health-data-privacy/">How we handle it</a>.</p>
      <p class="form-status" data-report-status role="status" aria-live="polite"></p>
    </form>`
    : `<div class="report__form report__form--soon">
      <h3 class="report__h">Report how you feel</h3>
      <p class="text-secondary">Anonymous symptom reports open soon. Until then, check this week's CDC data for your area.</p>
      <p class="report__fine"><a href="/consumer-health-data-privacy/">How reports will be handled</a></p>
    </div>`;

  return `
  <section class="section report" id="check-area" aria-labelledby="check-area-title" data-report-section>
    <div class="container">
      <div class="section-head section-rule">
        <h2 id="check-area-title">Check your area <span aria-hidden="true">/</span> Report how you feel</h2>
        <p class="text-secondary">This week's CDC data for your county — hospital admissions, wastewater and the state level — plus an anonymous count of how people nearby feel.</p>
      </div>
      <div class="report__grid">
        <div class="report__check">
          <form method="get" action="/api/area" data-area-form>
            <h3 class="report__h">Check your area</h3>
            <label class="field__label" for="area-zip">ZIP code <span class="muted">(optional)</span></label>
            <div class="report__zip-row">
              <input class="input report__zip" id="area-zip" name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code" placeholder="e.g. 92101">
              <button class="btn btn--primary" type="submit">Check my area</button>
            </div>
            <p class="field__hint">Leave it blank and we'll use your approximate location. U.S. only.</p>
          </form>
          <div class="report__confirm" data-confirm hidden>
            <p>Looks like you're near <strong data-place></strong>. Correct?</p>
            <div class="cluster"><button class="btn btn--primary" type="button" data-confirm-yes>Yes</button><button class="btn btn--ghost" type="button" data-confirm-change>Change ZIP</button></div>
          </div>
          <p class="form-status" data-area-status role="status" aria-live="polite"></p>
        </div>
        ${reportForm}
      </div>
      <div class="report__result" data-result></div>
    </div>
  </section>`;
}
