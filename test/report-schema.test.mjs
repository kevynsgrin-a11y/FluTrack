import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, isIli, isCovidLike, positiveFor, SYMPTOM_KEYS, truthy } from '../src/scripts/report-schema.js';

// --- ILI = fever AND (cough OR sore throat) -------------------------------- //

test('ILI truth table: fever and (cough or sore throat), all eight combinations', () => {
  for (const fever of [0, 1]) {
    for (const cough of [0, 1]) {
      for (const sore_throat of [0, 1]) {
        const expected = Boolean(fever && (cough || sore_throat));
        assert.equal(isIli({ fever, cough, sore_throat }), expected, `fever=${fever} cough=${cough} sore_throat=${sore_throat}`);
      }
    }
  }
});

test('ILI ignores symptoms outside its definition', () => {
  assert.equal(isIli({ fever: 1, body_aches: 1, chills: 1, headache: 1 }), false);
  assert.equal(isIli({ cough: 1, sore_throat: 1, chills: 1 }), false, 'no fever, no ILI');
});

test('COVID-like: loss of taste/smell alone, or fever with cough or shortness of breath', () => {
  assert.equal(isCovidLike({ taste_smell: 1 }), true);
  assert.equal(isCovidLike({ fever: 1, sob: 1 }), true);
  assert.equal(isCovidLike({ fever: 1, cough: 1 }), true);
  assert.equal(isCovidLike({ fever: 1, sore_throat: 1 }), false);
  assert.equal(isCovidLike({ cough: 1, sob: 1 }), false, 'no fever, no loss of taste/smell');
});

test('a reported positive test only counts when a test was taken', () => {
  assert.deepEqual(positiveFor({ test_type: 'home_combo', test_result: 'positive_both' }), { flu: true, covid: true });
  assert.deepEqual(positiveFor({ test_type: 'pcr', test_result: 'positive_flu' }), { flu: true, covid: false });
  assert.deepEqual(positiveFor({ test_type: 'none', test_result: 'positive_flu' }), { flu: false, covid: false });
});

// --- parseReport ----------------------------------------------------------- //

test('a sick report is classified server-side from its symptoms', () => {
  const { ok, report } = parseReport({ feeling: 'sick', fever: 'on', cough: '1', consent: 'on' });
  assert.equal(ok, true);
  assert.equal(report.ili, 1);
  assert.equal(report.covid_like, 1);
  assert.equal(report.fever, 1);
  assert.equal(report.sore_throat, 0);
});

test('consent is required, and an unchecked box is not consent', () => {
  assert.deepEqual(parseReport({ feeling: 'fine' }).errors, ['consent']);
  assert.deepEqual(parseReport({ feeling: 'fine', consent: '' }).errors, ['consent']);
  assert.deepEqual(parseReport({ feeling: 'fine', consent: 'false' }).errors, ['consent']);
  assert.equal(parseReport({ feeling: 'fine', consent: true }).ok, true);
});

test('feeling must be fine or sick', () => {
  assert.ok(parseReport({ consent: 1 }).errors.includes('feeling'));
  assert.ok(parseReport({ feeling: 'great', consent: 1 }).errors.includes('feeling'));
});

test('a "fine" report carries no symptoms or onset, even if the form sent some', () => {
  const { report } = parseReport({ feeling: 'fine', consent: 1, fever: 'on', cough: 'on', onset_bucket: 'today' });
  for (const k of SYMPTOM_KEYS) assert.equal(report[k], 0, k);
  assert.equal(report.onset_bucket, null);
  assert.equal(report.ili, 0);
});

test('bucketed answers accept only their listed values', () => {
  const ok = parseReport({ feeling: 'sick', consent: 1, onset_bucket: '3-6d', age_band: '65+', vaccinated: 'not_sure', household_sick: '2+' });
  assert.equal(ok.ok, true);
  assert.equal(ok.report.age_band, '65+');
  for (const [field, bad] of [['age_band', '37'], ['onset_bucket', 'yesterday'], ['vaccinated', 'maybe'], ['household_sick', '7'], ['test_type', 'blood']]) {
    const r = parseReport({ feeling: 'sick', consent: 1, [field]: bad });
    assert.ok(r.errors.includes(field), `${field}=${bad} is rejected`);
  }
});

test('blank optional answers are fine; a result without a test is dropped', () => {
  const r = parseReport({ feeling: 'sick', consent: 1, age_band: '', test_type: 'none', test_result: 'positive_flu' });
  assert.equal(r.ok, true);
  assert.equal(r.report.age_band, null);
  assert.equal(r.report.test_result, null);
});

test('fields outside the schema can never reach the record (no free text, no ZIP5, no identity)', () => {
  const { report } = parseReport({
    feeling: 'sick',
    consent: 1,
    fever: 1,
    zip: '92101',
    email: 'a@b.co',
    name: 'Pat',
    notes: 'free text',
    ip: '1.2.3.4',
    dob: '1990-01-01',
  });
  for (const k of ['zip', 'email', 'name', 'notes', 'ip', 'dob', 'consent']) assert.equal(k in report, false, k);
});

test('truthy() accepts the values browsers and JSON actually send', () => {
  for (const v of [true, 1, '1', 'on', 'true', 'yes', ['on']]) assert.equal(truthy(v), true, String(v));
  for (const v of [false, 0, '0', '', 'off', null, undefined, []]) assert.equal(truthy(v), false, String(v));
});
