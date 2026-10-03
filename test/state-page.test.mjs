import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statePage } from '../build/pages/state.mjs';
import { generateSnapshot } from '../build/lib/snapshot.mjs';
import { computeModel } from '../src/scripts/model.js';
import { nationalSignals } from '../src/scripts/aggregate.js';
import { states } from '../src/scripts/states-data.js';
import { stateChip } from '../src/scripts/render.js';
import { site } from '../build/lib/site.mjs';

const snap = generateSnapshot();

/** The context the build hands each page template. */
function makeCtx(overrides = {}) {
  const models = new Map();
  for (const st of states) {
    const data = snap.states[st.abbr];
    models.set(st.abbr, { model: computeModel(data), signals: nationalSignals([data]) });
  }
  return {
    site,
    weekEnding: snap.weeks.at(-1),
    provenance: snap.provenance,
    states,
    models,
    render: { stateChip },
    ...overrides,
  };
}

const ctx = makeCtx();
const find = (abbr) => states.find((s) => s.abbr === abbr);

// --- the route contract ---------------------------------------------------- //

test('a state report is emitted at the documented URL contract', () => {
  const state = find('CA');
  const page = statePage(ctx, state);
  assert.equal(page.path, '/state/california/');
  assert.equal(page.ogType, 'article');
  assert.equal(page.ogImage, '/assets/og/california.svg');
  assert.match(page.title, /^California flu, RSV & COVID activity$/);
  assert.ok(page.description.includes('California'));
  assert.ok(page.scripts.includes('/assets/js/app.js'));
});

test('every jurisdiction renders a state report at its own slug', () => {
  const paths = new Set();
  for (const st of states) {
    const page = statePage(ctx, st);
    assert.equal(page.path, `/state/${st.slug}/`, `${st.abbr} uses its slug`);
    assert.ok(!paths.has(page.path), `no two states share the path ${page.path}`);
    paths.add(page.path);
  }
  assert.equal(paths.size, 51);
});

// --- page shape ------------------------------------------------------------ //

test('a state report has exactly one h1 and no unresolved markup', () => {
  for (const st of states) {
    const { body } = statePage(ctx, st);
    assert.equal((body.match(/<h1[\s>]/g) || []).length, 1, `${st.abbr} has exactly one h1`);
    assert.ok(!/\{\{\s*[\w.]+\s*\}\}/.test(body), `${st.abbr} has no template markers`);
    assert.ok(!body.includes('undefined'), `${st.abbr} does not leak "undefined"`);
  }
});

test('the state name is escaped wherever it is interpolated', () => {
  const hostile = {
    abbr: 'ZZ',
    name: 'X"<script>alert(1)</script>',
    slug: 'x',
    hhsRegion: 'test',
  };
  const local = makeCtx();
  local.models.set('ZZ', { model: computeModel(snap.states.CA), signals: nationalSignals([snap.states.CA]) });
  const { body } = statePage(local, hostile);
  assert.ok(!body.includes('<script>alert(1)</script>'), 'no raw script tag is emitted');
  assert.ok(body.includes('&lt;script&gt;'), 'the name is HTML-escaped');
});

test('the masthead names the state and the illness it covers', () => {
  const state = find('TX');
  const { body } = statePage(ctx, state);
  assert.ok(body.includes('<h1>Texas flu, RSV &amp; COVID-19 activity</h1>'));
  assert.ok(body.includes('data-state="TX"'), 'the threat card is tagged for hydration');
  assert.ok(body.includes(`data-week="${snap.weeks.at(-1)}"`), 'the report week is exposed to the client');
});

// --- structured data -------------------------------------------------------- //

test('breadcrumbs walk Home > States > this state with absolute URLs', () => {
  const state = find('NY');
  const [crumbs] = statePage(ctx, state).jsonld;
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  assert.deepEqual(
    crumbs.itemListElement.map((c) => [c.position, c.name, c.item]),
    [
      [1, 'Home', `${site.origin}/`],
      [2, 'States', `${site.origin}/states/`],
      [3, 'New York', `${site.origin}/state/new-york/`],
    ]
  );
});

test('FAQ structured data answers are plain text, not markup', () => {
  const state = find('FL');
  const faq = statePage(ctx, state).jsonld.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq.mainEntity.length >= 4, 'the per-state questions are present');
  for (const q of faq.mainEntity) {
    assert.ok(!/[<>]/.test(q.acceptedAnswer.text), `answer is stripped of tags: ${q.acceptedAnswer.text.slice(0, 40)}`);
    assert.ok(!q.acceptedAnswer.text.includes('undefined'));
  }
  // The visible page keeps the markup for the <details> bodies.
  assert.ok(statePage(ctx, state).body.includes('<details class="faq-item">'));
});

test('the state report declares a dated WebPage node', () => {
  const state = find('WA');
  const page = statePage(ctx, state).jsonld.find((b) => b['@type'] === 'WebPage');
  assert.equal(page.url, `${site.origin}/state/washington/`);
  assert.ok(page.name.includes('Washington'));
});

test('all three JSON-LD blocks are serializable and share the schema context', () => {
  const blocks = statePage(ctx, find('MA')).jsonld;
  assert.equal(blocks.length, 3);
  for (const b of blocks) {
    assert.equal(b['@context'], 'https://schema.org');
    assert.doesNotThrow(() => JSON.stringify(b), 'each block is valid JSON-LD');
  }
});

// --- neighbor comparison ---------------------------------------------------- //

test('nearby states are same-region, exclude the state itself, and are capped', () => {
  const state = find('CA');
  const { body } = statePage(ctx, state);
  const strip = body.slice(body.indexOf('comparison-strip'));
  // A state chip links to its report; recover the neighbors from those links.
  const slugs = [...strip.matchAll(/href="\/state\/([a-z-]+)\/"/g)].map((m) => m[1]);
  const neighbors = slugs.map((slug) => ({ slug, state: states.find((s) => s.slug === slug) }));
  assert.ok(neighbors.length > 0, 'a region usually has neighbors');
  for (const { slug, state: n } of neighbors) {
    assert.ok(n, `the strip only links to real states (${slug})`);
    assert.notEqual(n.abbr, 'CA', 'the state is never its own neighbor');
    assert.equal(n.hhsRegion, state.hhsRegion, `${n.abbr} is in the same HHS region`);
  }
  assert.ok(neighbors.length <= 6, 'the strip stays short');
});

test('a state with no same-region neighbors still renders', () => {
  // An isolated region exercises the empty-neighbors branch.
  const isolated = { abbr: 'ZZ', name: 'Testland', slug: 'testland', hhsRegion: 'nowhere' };
  const local = makeCtx();
  local.models.set('ZZ', { model: computeModel(snap.states.CA), signals: nationalSignals([snap.states.CA]) });
  const { body } = statePage(local, isolated);
  assert.ok(body.includes('<h1>Testland flu, RSV &amp; COVID-19 activity</h1>'));
  assert.ok(!body.includes('undefined'));
  assert.ok(!body.includes('You can also compare nearby states'), 'no dangling comparison sentence');
});

// --- edge cases -------------------------------------------------------------- //

test('a state with no model data renders a no-data page rather than throwing', () => {
  const state = find('OR');
  const local = makeCtx();
  local.models.set('OR', {
    model: { level: null, label: 'No data', trend: { direction: 'flat', label: 'No data', changePct: 0 }, pathogens: {}, _series: [] },
    signals: { edCombinedSeries: [], wastewaterSeries: [], positivityCombined: null, weekEnding: snap.weeks.at(-1), pathogens: {} },
  });
  const { body } = statePage(local, state);
  assert.equal((body.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(body.includes('data-sev="0"'), 'the severity attribute falls back to 0');
  assert.ok(body.includes('No data'));
  assert.ok(!body.includes('undefined'));
});

test('a rising and a falling trend are both rendered with a signed change', () => {
  const local = makeCtx();
  const base = computeModel(snap.states.CA);
  const render = (trend) => {
    const c = makeCtx();
    c.models.set('CA', { model: { ...base, trend }, signals: nationalSignals([snap.states.CA]) });
    return statePage(c, find('CA')).body;
  };
  const up = render({ direction: 'up', label: 'Rising', changePct: 14 });
  const down = render({ direction: 'down', label: 'Falling', changePct: -8 });
  const flat = render({ direction: 'flat', label: 'Holding steady', changePct: 0 });
  assert.ok(up.includes('Rising +14%'), 'a rise is signed with a plus');
  assert.ok(down.includes('Falling −8%'), 'a fall uses a true minus sign, not a hyphen');
  assert.ok(flat.includes('Holding steady'), 'a flat trend is not given a change');
  assert.ok(!flat.includes('no change +0%'));
});

test('the alert signup link is state-scoped so it can prefill the form', () => {
  const { body } = statePage(ctx, find('NV'));
  assert.ok(body.includes('href="/alerts/?state=NV"'));
});

test('report generation is deterministic', () => {
  const a = statePage(ctx, find('CO'));
  const b = statePage(ctx, find('CO'));
  assert.deepEqual(a, b, 'the same state renders byte-identically every build');
});
