// ===========================================================================
// Symptom-report schema — the ONE definition of what a report may contain.
//
// Shared by the server (functions/api/report.js validates against it), the
// build (the no-JS form is rendered from it) and the browser widget. A field
// that is not listed here cannot be stored: parseReport() builds the record
// from these lists only, so free text, names, emails or a ZIP5 have nowhere
// to go.
//
// Classification follows the CDC's surveillance definitions:
//   ILI (influenza-like illness) = fever >= 100°F AND (cough OR sore throat)
//   COVID-like (syndromic)       = new loss of taste/smell
//                                  OR fever AND (cough OR shortness of breath)
// Both are self-reported symptom patterns, never a diagnosis.
// ===========================================================================

/** Symptom checkboxes: storage column → plain-English label. Order = form order. */
export const SYMPTOMS = Object.freeze([
  ['fever', 'Fever of 100°F or higher'],
  ['cough', 'Cough'],
  ['sore_throat', 'Sore throat'],
  ['body_aches', 'Body aches'],
  ['fatigue', 'Tiredness or fatigue'],
  ['congestion', 'Stuffy or runny nose'],
  ['headache', 'Headache'],
  ['chills', 'Chills'],
  ['gi', 'Nausea, vomiting or diarrhea'],
  ['taste_smell', 'New loss of taste or smell'],
  ['sob', 'Shortness of breath'],
]);

export const SYMPTOM_KEYS = Object.freeze(SYMPTOMS.map(([k]) => k));

export const ONSET = Object.freeze([
  ['today', 'Today'],
  ['1-2d', '1–2 days ago'],
  ['3-6d', '3–6 days ago'],
  ['7d+', '7 or more days ago'],
]);

export const AGE_BANDS = Object.freeze([
  ['0-4', '0–4'],
  ['5-17', '5–17'],
  ['18-49', '18–49'],
  ['50-64', '50–64'],
  ['65+', '65+'],
]);

export const VACCINATED = Object.freeze([
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
]);

export const TEST_TYPES = Object.freeze([
  ['none', 'No test'],
  ['home_flu', 'Home flu A/B test'],
  ['home_covid', 'Home COVID test'],
  ['home_combo', 'Home flu + COVID combo test'],
  ['clinic_rapid', 'Rapid test at a clinic'],
  ['pcr', 'PCR / lab test'],
]);

export const TEST_RESULTS = Object.freeze([
  ['positive_flu', 'Positive for flu'],
  ['positive_covid', 'Positive for COVID-19'],
  ['positive_both', 'Positive for both'],
  ['negative', 'Negative'],
  ['waiting', 'Waiting for result'],
]);

export const HOUSEHOLD = Object.freeze([
  ['0', 'No one else'],
  ['1', 'One other person'],
  ['2+', 'Two or more'],
]);

const keys = (list) => new Set(list.map(([k]) => k));
const ONSET_KEYS = keys(ONSET);
const AGE_KEYS = keys(AGE_BANDS);
const VAX_KEYS = keys(VACCINATED);
const TEST_KEYS = keys(TEST_TYPES);
const RESULT_KEYS = keys(TEST_RESULTS);
const HOUSEHOLD_KEYS = keys(HOUSEHOLD);

/** Checkbox-ish truthiness: form posts send "on"/"1"/"true"; JSON may send booleans. */
export function truthy(v) {
  if (Array.isArray(v)) return v.some(truthy);
  return v === true || v === 1 || v === '1' || v === 'on' || v === 'true' || v === 'yes';
}

/** ILI = fever AND (cough OR sore throat). Inputs are booleans or 0/1. */
export function isIli(r) {
  return Boolean(r.fever) && (Boolean(r.cough) || Boolean(r.sore_throat));
}

/** COVID-like = loss of taste/smell, OR fever AND (cough OR shortness of breath). */
export function isCovidLike(r) {
  return Boolean(r.taste_smell) || (Boolean(r.fever) && (Boolean(r.cough) || Boolean(r.sob)));
}

/** A reported positive flu / COVID test (self-reported; never "verified"). */
export function positiveFor(r) {
  const res = r.test_result;
  const tested = r.test_type && r.test_type !== 'none';
  return {
    flu: Boolean(tested) && (res === 'positive_flu' || res === 'positive_both'),
    covid: Boolean(tested) && (res === 'positive_covid' || res === 'positive_both'),
  };
}

const pick = (value, allowed) => {
  const v = value == null ? '' : String(value).trim();
  return allowed.has(v) ? v : null;
};

/**
 * Validate and normalize a submitted report. Returns { ok, errors, report }.
 * `report` holds ONLY schema fields; everything else in `input` is ignored.
 * Consent is required. A "fine" report carries no symptoms or onset.
 */
export function parseReport(input = {}) {
  const errors = [];
  const feeling = input.feeling === 'sick' ? 'sick' : input.feeling === 'fine' ? 'fine' : null;
  if (!feeling) errors.push('feeling');
  if (!truthy(input.consent)) errors.push('consent');

  const symptoms = {};
  for (const k of SYMPTOM_KEYS) symptoms[k] = feeling === 'sick' && truthy(input[k]) ? 1 : 0;

  const onset = feeling === 'sick' ? pick(input.onset_bucket, ONSET_KEYS) : null;
  const age = pick(input.age_band, AGE_KEYS);
  const vaccinated = pick(input.vaccinated, VAX_KEYS);
  const testType = pick(input.test_type, TEST_KEYS) || 'none';
  const testResult = testType === 'none' ? null : pick(input.test_result, RESULT_KEYS);
  const household = pick(input.household_sick, HOUSEHOLD_KEYS);

  // Optional fields arrive empty all the time; only a present-but-invalid
  // value is an error (a tampered request, not a person skipping a question).
  const invalid = (raw, val) => raw != null && String(raw).trim() !== '' && val == null;
  if (feeling === 'sick' && invalid(input.onset_bucket, onset)) errors.push('onset_bucket');
  if (invalid(input.age_band, age)) errors.push('age_band');
  if (invalid(input.vaccinated, vaccinated)) errors.push('vaccinated');
  if (invalid(input.test_type, pick(input.test_type, TEST_KEYS))) errors.push('test_type');
  if (testType !== 'none' && invalid(input.test_result, testResult)) errors.push('test_result');
  if (invalid(input.household_sick, household)) errors.push('household_sick');

  const report = {
    feeling,
    ...symptoms,
    onset_bucket: onset,
    age_band: age,
    vaccinated,
    test_type: testType,
    test_result: testResult,
    household_sick: household,
  };
  report.ili = isIli(report) ? 1 : 0;
  report.covid_like = isCovidLike(report) ? 1 : 0;
  return { ok: errors.length === 0, errors, report };
}
