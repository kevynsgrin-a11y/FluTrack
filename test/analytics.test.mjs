import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ga4Vendor, GA4_LOADER } from '../src/scripts/analytics.js';
import { site } from '../build/lib/site.mjs';

function fakeDom() {
  const appended = [];
  const doc = {
    head: { appendChild: (el) => appended.push(el) },
    createElement: (tag) => ({ tag }),
    querySelector: (sel) =>
      sel.startsWith('script[src^=') ? appended.find((el) => el.tag === 'script' && el.src?.startsWith(GA4_LOADER)) || null : null,
  };
  return { doc, win: {}, appended };
}

test('the per-site GA4 ID is configured for in-page delivery', () => {
  assert.equal(site.analytics.ga4MeasurementId, 'G-65H1FJWYLR');
});

test('GA4 is registered as a consent-gated analytics vendor', () => {
  const v = ga4Vendor('G-65H1FJWYLR', fakeDom().doc, {});
  assert.equal(v.category, 'analytics');
  assert.equal(typeof v.load, 'function');
});

test('load() configures the per-site ID and inserts exactly one gtag.js loader', () => {
  const { doc, win, appended } = fakeDom();
  const v = ga4Vendor('G-65H1FJWYLR', doc, win);
  v.load();
  v.load(); // a second call must not add a second loader
  const loaders = appended.filter((el) => el.tag === 'script');
  assert.equal(loaders.length, 1);
  assert.equal(loaders[0].src, `${GA4_LOADER}?id=G-65H1FJWYLR`);
  assert.equal(loaders[0].async, true);

  const configs = win.dataLayer.filter((a) => a[0] === 'config').map((a) => a[1]);
  assert.deepEqual([...new Set(configs)], ['G-65H1FJWYLR']);
  // gtag() pushes the Arguments object, which is what gtag.js expects.
  assert.equal(Object.prototype.toString.call(win.dataLayer[0]), '[object Arguments]');
});
