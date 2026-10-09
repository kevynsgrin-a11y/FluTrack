import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeZip,
  storableZip3,
  resolveLocation,
  pickMaxShare,
  crosswalkFromCensus,
  crosswalkFromHud,
  countyLabel,
  stateForCounty,
  RESTRICTED_ZIP3,
} from '../src/server/geo.js';
import { ipHash, dailySalt, checkRateLimit, burstCheck, isoWeek, utcDay, LIMIT_PER_HOUR, LIMIT_PER_DAY } from '../src/server/privacy.js';
import { rotateSalts } from '../workers/ingest/src/maintenance.js';
import { kv } from './helpers/cloudflare.mjs';

// --- ZIP handling ---------------------------------------------------------- //

test('normalizeZip accepts 5-digit and ZIP+4, rejects everything else', () => {
  assert.equal(normalizeZip(' 92101 '), '92101');
  assert.equal(normalizeZip('92101-1234'), '92101');
  for (const bad of ['9210', '921011', 'abcde', '', null, '92101-12']) assert.equal(normalizeZip(bad), null, String(bad));
});

test('a ZIP3 is only storable outside the restricted (<= 20,000 people) areas', () => {
  assert.equal(storableZip3('92101'), '921');
  assert.equal(RESTRICTED_ZIP3.has('036'), true);
  assert.equal(storableZip3('03601'), null);
});

test('multi-county ZIP: the county with the largest share wins; ties go to the lower FIPS', () => {
  const best = pickMaxShare([
    { zip: '12345', county: '36001', weight: 0.3 },
    { zip: '12345', county: '36093', weight: 0.7 },
    { zip: '54321', county: '55002', weight: 0.5 },
    { zip: '54321', county: '55001', weight: 0.5 },
  ]);
  assert.equal(best.get('12345').county, '36093');
  assert.equal(best.get('54321').county, '55001');
});

test('Census ZCTA-county relationship rows → one county per ZIP, by land area', () => {
  const head = 'OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|FUNCSTAT_ZCTA5_20|OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|AREAWATER_COUNTY_20|MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|AREALAND_PART|AREAWATER_PART';
  const row = (zip, county, land) => `1|${zip}|ZCTA5 ${zip}|0|0|G6350|B5|S|1|${county}|X County|0|0|G4020|H1|A|${land}|0`;
  const text = [head, '||||||||1|01003|Baldwin County|0|0|G4020|H1|A|5|0', row('92101', '06073', 900), row('92101', '06065', 10), row('03601', '33019', 50)].join('\n');
  const rows = crosswalkFromCensus(text);
  assert.deepEqual(rows.find((r) => r.zip5 === '92101'), { zip5: '92101', county_fips: '06073', state: 'CA', zip3: '921', zip3_pop_over_20k: 1 });
  assert.equal(rows.find((r) => r.zip5 === '03601').zip3_pop_over_20k, 0);
  assert.equal(rows.length, 2, 'rows without a ZCTA are skipped');
});

test('HUD crosswalk rows → one county per ZIP, by residential ratio', () => {
  const rows = crosswalkFromHud('ZIP,COUNTY,RES_RATIO\n10001,36061,0.9\n10001,36047,0.1\n');
  assert.equal(rows[0].county_fips, '36061');
});

test('county labels follow local naming', () => {
  assert.equal(countyLabel('06073'), 'San Diego County');
  assert.equal(countyLabel('22071'), 'Orleans Parish');
  assert.equal(stateForCounty('06073'), 'CA');
  assert.equal(countyLabel('99999'), null);
});

// --- Location resolution / US-only ---------------------------------------- //

const lookupZip = async (zip) => ({ '92101': { zip5: '92101', county_fips: '06073', state: 'CA', zip3: '921', zip3_pop_over_20k: 1 } })[zip] || null;

test('non-US visitors are refused: "FluFollower is US-only for now."', async () => {
  const r = await resolveLocation({ cf: { country: 'GB' }, lookupZip });
  assert.deepEqual(r, { ok: false, status: 403, error: 'us_only', message: 'FluFollower is US-only for now.' });
  const withZip = await resolveLocation({ zip: '92101', cf: { country: 'CA' }, lookupZip });
  assert.equal(withZip.error, 'us_only', 'a report from abroad is refused even with a US ZIP');
});

test('a read-only lookup from abroad may name a US ZIP explicitly', async () => {
  const r = await resolveLocation({ zip: '92101', cf: { country: 'DE' }, lookupZip, allowZipFromAbroad: true });
  assert.equal(r.ok, true);
});

test('location: confirmed ZIP first, then request.cf postal code, then region', async () => {
  const z = await resolveLocation({ zip: '92101', cf: { country: 'US', postalCode: '10001' }, lookupZip });
  assert.equal(z.location.county_fips, '06073');
  assert.equal(z.location.source, 'zip');
  const ip = await resolveLocation({ cf: { country: 'US', postalCode: '92101' }, lookupZip });
  assert.equal(ip.location.county_name, 'San Diego County');
  assert.equal(ip.location.source, 'ip');
  const region = await resolveLocation({ cf: { country: 'US', regionCode: 'TX', postalCode: '00000' }, lookupZip });
  assert.equal(region.location.state, 'TX');
  assert.equal(region.location.county_fips, null);
  const bad = await resolveLocation({ zip: '9210', cf: { country: 'US' }, lookupZip });
  assert.equal(bad.error, 'bad_zip');
  const missing = await resolveLocation({ zip: '99999', cf: { country: 'US' }, lookupZip });
  assert.equal(missing.error, 'zip_not_found');
});

// --- Hashing, salts and limits -------------------------------------------- //

test('same IP, same day → same hash; next day → a different hash', async () => {
  const store = kv();
  const day1 = new Date('2026-10-09T10:00:00Z');
  const day1b = new Date('2026-10-09T23:59:00Z');
  const day2 = new Date('2026-10-10T00:01:00Z');
  const a = await ipHash(store, '203.0.113.7', day1);
  const b = await ipHash(store, '203.0.113.7', day1b);
  const c = await ipHash(store, '203.0.113.7', day2);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await ipHash(store, '203.0.113.8', day1), 'different IPs differ');
  for (const v of store.store.values()) assert.doesNotMatch(v, /203\.0\.113/, 'the raw IP is never stored');
});

test('salt rotation deletes every earlier salt and keeps today', async () => {
  const store = kv();
  for (const d of ['2026-10-07', '2026-10-08', '2026-10-09']) await dailySalt(store, d);
  const deleted = await rotateSalts(store, new Date('2026-10-09T08:00:00Z'));
  assert.equal(deleted, 2);
  assert.deepEqual([...store.store.keys()].filter((k) => k.startsWith('salt:')), ['salt:2026-10-09']);
});

test(`rate limit: ${LIMIT_PER_HOUR} per hour and ${LIMIT_PER_DAY} per day per hash`, async () => {
  const store = kv();
  const t = (h) => new Date(`2026-10-09T${String(h).padStart(2, '0')}:10:00Z`);
  for (let i = 0; i < LIMIT_PER_HOUR; i += 1) assert.equal((await checkRateLimit(store, 'h1', t(9))).ok, true);
  assert.equal((await checkRateLimit(store, 'h1', t(9))).ok, false, '4th in the same hour');
  assert.equal((await checkRateLimit(store, 'h1', t(10))).ok, true);
  assert.equal((await checkRateLimit(store, 'h1', t(11))).ok, true, '5th in the day');
  assert.equal((await checkRateLimit(store, 'h1', t(12))).ok, false, '6th in the day');
  assert.equal((await checkRateLimit(store, 'h2', t(12))).ok, true, 'other hashes unaffected');
});

test('burst check quarantines a county hour far above its daily mean, and a busy network', async () => {
  const store = kv();
  const now = new Date('2026-10-09T15:00:00Z');
  let q = false;
  for (let i = 0; i < 7; i += 1) q = await burstCheck(store, { countyFips: '06073', trailingDailyMean: 1 }, now);
  assert.equal(q, true, '7 in an hour vs a mean of 1/day');
  assert.equal(await burstCheck(store, { countyFips: '06001', trailingDailyMean: 1 }, now), false);
  const busy = kv();
  let asn = false;
  for (let i = 0; i < 61; i += 1) asn = await burstCheck(busy, { asn: 64500 }, now);
  assert.equal(asn, true);
});

test('ISO week and UTC day labels carry no time of day', () => {
  assert.equal(isoWeek(new Date('2026-10-09T12:00:00Z')), '2026-W41');
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
  assert.equal(utcDay(new Date('2026-10-09T23:59:59Z')), '2026-10-09');
});
