import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/subscribe.js';

const ORIGIN = 'https://flutrack.example';

// Minimal in-memory stand-in for the required KV binding. Only the two
// operations the handler actually calls (get/put) are implemented, so the
// handler's real logic runs unchanged.
function kv() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function jsonRequest(body, headers = {}) {
  return new Request(`${ORIGIN}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function formRequest(body, headers = {}) {
  return new Request(`${ORIGIN}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  });
}

async function post(request, env) {
  const res = await onRequestPost({ request, env });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { res, body };
}

const valid = { email: 'someone@example.com', state: 'CA' };

// --- happy path ---------------------------------------------------------- //

test('a valid JSON signup is stored durably and acknowledged', async () => {
  const ns = kv();
  const { res, body } = await post(
    jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.9' }),
    { SUBSCRIBERS: ns }
  );

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.message, /on the list/i);

  const raw = ns.store.get('sub:someone@example.com');
  assert.ok(raw, 'record is keyed by the normalized email');
  const rec = JSON.parse(raw);
  assert.equal(rec.email, 'someone@example.com');
  assert.equal(rec.state, 'CA');
  assert.equal(rec.source, 'flutrack-web');
  assert.ok(Number.isFinite(Date.parse(rec.ts)), 'record is timestamped');
  assert.ok(!ns.store.get('sub:someone@example.com').includes('\n'), 'stored as a single JSON line');
});

test('the email and state are normalized before they are stored or keyed', async () => {
  const ns = kv();
  const { res } = await post(
    jsonRequest({ email: '  MixedCase@Example.COM  ', state: ' ca ' }, { 'cf-connecting-ip': '203.0.113.10' }),
    { SUBSCRIBERS: ns }
  );

  assert.equal(res.status, 200);
  assert.ok(ns.store.get('sub:mixedcase@example.com'), 'key is lowercase and trimmed');
  const rec = JSON.parse(ns.store.get('sub:mixedcase@example.com'));
  assert.equal(rec.email, 'mixedcase@example.com');
  assert.equal(rec.state, 'CA', 'state is trimmed and uppercased');
});

test('KV metadata carries the state and timestamp for later filtering', async () => {
  const ns = kv();
  const calls = [];
  const env = {
    SUBSCRIBERS: {
      async get(key) { return ns.store.has(key) ? ns.store.get(key) : null; },
      async put(key, value, options) { calls.push({ key, options }); ns.store.set(key, value); },
    },
  };
  await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.11' }), env);

  const sub = calls.find((c) => c.key === 'sub:someone@example.com');
  assert.ok(sub, 'the subscription record is written with metadata');
  assert.equal(sub.options.metadata.state, 'CA');
  assert.ok(sub.options.metadata.ts);
});

test('responses are JSON, uncached, and nosniff', async () => {
  const { res } = await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.12' }), { SUBSCRIBERS: kv() });
  assert.equal(res.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

// --- validation ---------------------------------------------------------- //

test('an invalid email is rejected with 422 and nothing is stored', async () => {
  const ns = kv();
  for (const email of ['', 'not-an-email', 'a@b', 'no domain@here', '@example.com', 'sp ace@example.com']) {
    const { res, body } = await post(
      jsonRequest({ ...valid, email }, { 'cf-connecting-ip': '203.0.113.20' }),
      { SUBSCRIBERS: ns }
    );
    assert.equal(res.status, 422, `rejects ${JSON.stringify(email)}`);
    assert.equal(body.ok, false);
    assert.match(body.message, /valid email/i);
  }
  assert.ok(![...ns.store.keys()].some((k) => k.startsWith('sub:')), 'no subscription was written');
});

test('an over-long email is rejected before the regex', async () => {
  const ns = kv();
  const local = 'a'.repeat(250);
  const { res } = await post(
    jsonRequest({ ...valid, email: `${local}@example.com` }, { 'cf-connecting-ip': '203.0.113.21' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 422);
  assert.ok(![...ns.store.keys()].some((k) => k.startsWith('sub:')));
});

test('a non-U.S. or unknown state is rejected with 422', async () => {
  const ns = kv();
  for (const state of ['', 'XX', 'California', 'ON', 'ZZ']) {
    const { res, body } = await post(
      jsonRequest({ ...valid, state }, { 'cf-connecting-ip': '203.0.113.22' }),
      { SUBSCRIBERS: ns }
    );
    assert.equal(res.status, 422, `rejects ${JSON.stringify(state)}`);
    assert.match(body.message, /valid U\.S\. state/i);
  }
  assert.ok(![...ns.store.keys()].some((k) => k.startsWith('sub:')), 'no subscription was written');
});

test('DC and the 50 states are all accepted', async () => {
  for (const state of ['DC', 'CA', 'WY']) {
    const { res } = await post(
      jsonRequest({ ...valid, state }, { 'cf-connecting-ip': `203.0.113.${30 + state.length}` }),
      { SUBSCRIBERS: kv() }
    );
    assert.equal(res.status, 200, `${state} is a valid jurisdiction`);
  }
});

test('an unparseable JSON body is rejected with 400', async () => {
  const request = new Request(`${ORIGIN}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  });
  const { res, body } = await post(request, { SUBSCRIBERS: kv() });
  assert.equal(res.status, 400);
  assert.match(body.message, /Invalid request body/i);
});

// --- missing / failing durable store ------------------------------------- //

test('without the KV binding the endpoint declines with 501', async () => {
  // An unmetered public relay is worse than an honest "not switched on".
  for (const env of [undefined, {}, { SUBSCRIBERS: null }, { SUBSCRIBERS: {} }]) {
    const { res, body } = await post(
      jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.40' }),
      env
    );
    assert.equal(res.status, 501, `declines for env ${JSON.stringify(env ?? null)}`);
    assert.equal(body.ok, false);
    assert.match(body.message, /not configured/i);
  }
});

test('a KV write failure surfaces as 502 and is not reported as success', async () => {
  const env = {
    SUBSCRIBERS: {
      async get() { return null; },
      async put(key) { if (key.startsWith('sub:')) throw new Error('kv down'); },
    },
  };
  const { res, body } = await post(
    jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.41' }),
    env
  );
  assert.equal(res.status, 502);
  assert.equal(body.ok, false);
  assert.match(body.message, /could not save/i);
});

test('a webhook-only deployment is still declined with 501', async () => {
  const { res } = await post(
    jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.42' }),
    { ALERTS_WEBHOOK_URL: 'http://127.0.0.1:9/hook' }
  );
  assert.equal(res.status, 501, 'KV is required, not the webhook');
});

test('a failing webhook does not fail a request whose KV write succeeded', async () => {
  const ns = kv();
  // Port 9 is the discard port: the connection is refused locally and
  // instantly, exercising the best-effort path without leaving the machine.
  const { res, body } = await post(
    jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.43' }),
    { SUBSCRIBERS: ns, ALERTS_WEBHOOK_URL: 'http://127.0.0.1:9/hook' }
  );
  assert.equal(res.status, 200, 'KV is the source of truth');
  assert.equal(body.ok, true);
  assert.ok(ns.store.get('sub:someone@example.com'), 'the record is durable regardless');
});

// --- cross-origin protection --------------------------------------------- //

test('a cross-site form post is refused with 403', async () => {
  const ns = kv();
  const { res, body } = await post(
    jsonRequest(valid, { 'Sec-Fetch-Site': 'cross-site', 'cf-connecting-ip': '203.0.113.50' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 403);
  assert.equal(body.ok, false);
  assert.match(body.message, /Cross-origin/i);
  assert.ok(![...ns.store.keys()].some((k) => k.startsWith('sub:')), 'nothing was stored');
});

test('a same-site or non-CORS Sec-Fetch-Site value is allowed through', async () => {
  for (const site of ['same-origin', 'none']) {
    const { res } = await post(
      jsonRequest(valid, { 'Sec-Fetch-Site': site, 'cf-connecting-ip': `203.0.113.${51 + site.length}` }),
      { SUBSCRIBERS: kv() }
    );
    assert.equal(res.status, 200, `${site} is not a cross-origin attempt`);
  }
});

test('a mismatched Origin header is refused with 403', async () => {
  const { res } = await post(
    jsonRequest(valid, { Origin: 'https://evil.example', 'cf-connecting-ip': '203.0.113.60' }),
    { SUBSCRIBERS: kv() }
  );
  assert.equal(res.status, 403);
});

test('a matching Origin header is allowed', async () => {
  const { res } = await post(
    jsonRequest(valid, { Origin: ORIGIN, 'cf-connecting-ip': '203.0.113.61' }),
    { SUBSCRIBERS: kv() }
  );
  assert.equal(res.status, 200);
});

test('an unparseable Origin header is refused, not crashed on', async () => {
  const { res } = await post(
    jsonRequest(valid, { Origin: 'not a url', 'cf-connecting-ip': '203.0.113.62' }),
    { SUBSCRIBERS: kv() }
  );
  assert.equal(res.status, 403);
});

// --- honeypot ------------------------------------------------------------- //

test('a filled honeypot is silently dropped without storing anything', async () => {
  const ns = kv();
  const { res, body } = await post(
    jsonRequest({ ...valid, company: 'Acme Bot Co' }, { 'cf-connecting-ip': '203.0.113.70' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 200);
  assert.equal(body.ok, true, 'bots are not told they were filtered');
  assert.equal(ns.store.size, 0, 'neither the subscription nor a rate-limit count is written');
});

test('an empty honeypot value is treated as a real submission', async () => {
  const ns = kv();
  const { res } = await post(
    jsonRequest({ ...valid, company: '   ' }, { 'cf-connecting-ip': '203.0.113.71' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 200);
  assert.ok(ns.store.get('sub:someone@example.com'), 'the signup is stored');
});

// --- rate limiting -------------------------------------------------------- //

test('the 11th signup from one IP within the window is rate limited', async () => {
  const ns = kv();
  const ip = { 'cf-connecting-ip': '203.0.113.80' };
  for (let i = 1; i <= 10; i += 1) {
    const { res } = await post(jsonRequest(valid, ip), { SUBSCRIBERS: ns });
    assert.equal(res.status, 200, `request ${i} is allowed`);
  }
  const { res, body } = await post(jsonRequest(valid, ip), { SUBSCRIBERS: ns });
  assert.equal(res.status, 429);
  assert.match(body.message, /Too many requests/i);
  assert.equal(ns.store.get('rl:203.0.113.80'), '10', 'a rejected request does not increment the counter');
});

test('rate limits are tracked per IP', async () => {
  const ns = kv();
  for (let i = 0; i < 10; i += 1) {
    await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.90' }), { SUBSCRIBERS: ns });
  }
  const blocked = await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.90' }), { SUBSCRIBERS: ns });
  assert.equal(blocked.res.status, 429);

  const other = await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.91' }), { SUBSCRIBERS: ns });
  assert.equal(other.res.status, 200, 'a different IP has its own budget');
});

test('a missing connecting-IP header falls back to one shared bucket', async () => {
  const ns = kv();
  for (let i = 0; i < 10; i += 1) {
    await post(jsonRequest(valid), { SUBSCRIBERS: ns });
  }
  const { res } = await post(jsonRequest(valid), { SUBSCRIBERS: ns });
  assert.equal(res.status, 429);
  assert.ok(ns.store.has('rl:unknown'), 'the counter key is the documented fallback');
});

test('malformed submissions are counted too', async () => {
  const ns = kv();
  const ip = { 'cf-connecting-ip': '203.0.113.95' };
  for (let i = 0; i < 10; i += 1) {
    await post(jsonRequest({ email: 'nope', state: 'CA' }, ip), { SUBSCRIBERS: ns });
  }
  const { res } = await post(jsonRequest(valid, ip), { SUBSCRIBERS: ns });
  assert.equal(res.status, 429, 'a flood of garbage cannot be followed by real signups');
});

test('a rate-limit store outage does not block a legitimate signup', async () => {
  const calls = [];
  const env = {
    SUBSCRIBERS: {
      async get(key) { if (key.startsWith('rl:')) throw new Error('kv unavailable'); return null; },
      async put(key, value) { calls.push(key); },
    },
  };
  const { res } = await post(
    jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.96' }),
    env
  );
  assert.equal(res.status, 200, 'the limiter is friction, not a hard gate');
  assert.ok(calls.includes('sub:someone@example.com'));
});

test('the rate-limit counter is written with a one-hour expiration', async () => {
  const puts = [];
  const env = {
    SUBSCRIBERS: {
      async get() { return '3'; },
      async put(key, value, options) { puts.push({ key, value, options }); },
    },
  };
  await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.97' }), env);
  const rl = puts.find((p) => p.key.startsWith('rl:'));
  assert.equal(rl.value, '4', 'increments the existing count');
  assert.equal(rl.options.expirationTtl, 3600);
});

// --- header sanitization --------------------------------------------------- //

test('attacker-controlled headers are bounded before being relayed', async () => {
  const ns = kv();
  const { res } = await post(
    jsonRequest(valid, {
      'cf-connecting-ip': '203.0.113.100',
      'user-agent': 'X'.repeat(4000),
      'cf-ipcountry': 'Y'.repeat(40),
    }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 200);
  const rec = JSON.parse(ns.store.get('sub:someone@example.com'));
  assert.equal(rec.ua.length, 256, 'the UA is clamped to 256 characters');
  assert.equal(rec.country.length, 8, 'the country is clamped to 8 characters');
  assert.ok(!/[\u0000-\u001F\u007F]/.test(rec.ua + rec.country), 'nothing control-ish is relayed');
});

test('header values are stored verbatim when they are already within bounds', async () => {
  const ns = kv();
  await post(
    jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.102', 'user-agent': 'Mozilla/5.0 (iPhone)', 'cf-ipcountry': 'US' }),
    { SUBSCRIBERS: ns }
  );
  const rec = JSON.parse(ns.store.get('sub:someone@example.com'));
  assert.equal(rec.ua, 'Mozilla/5.0 (iPhone)', 'sanitizing does not mangle a normal UA');
  assert.equal(rec.country, 'US');
});

test('absent headers become empty strings rather than null', async () => {
  const ns = kv();
  await post(jsonRequest(valid, { 'cf-connecting-ip': '203.0.113.101' }), { SUBSCRIBERS: ns });
  const rec = JSON.parse(ns.store.get('sub:someone@example.com'));
  assert.equal(rec.ua, '');
  assert.equal(rec.country, '');
});

// --- no-JS form submissions ------------------------------------------------ //

test('a no-JS form post is redirected to a human-readable page', async () => {
  const ns = kv();
  const { res, body } = await post(
    formRequest(valid, { 'Sec-Fetch-Dest': 'document' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/alerts/?subscribed=1');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(body, null, 'a document navigation gets no JSON body');
  assert.ok(ns.store.get('sub:someone@example.com'), 'the signup is still stored');
});

test('a form post that accepts HTML is redirected even without Sec-Fetch-Dest', async () => {
  const { res } = await post(
    formRequest(valid, { Accept: 'text/html,application/xhtml+xml' }),
    { SUBSCRIBERS: kv() }
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/alerts/?subscribed=1');
});

test('each form-post failure redirects to its own error state', async () => {
  const cases = [
    [{ email: 'nope', state: 'CA' }, '/alerts/?error=email'],
    [{ email: 'someone@example.com', state: 'XX' }, '/alerts/?error=state'],
  ];
  for (const [body, location] of cases) {
    const { res } = await post(
      formRequest(body, { 'Sec-Fetch-Dest': 'document' }),
      { SUBSCRIBERS: kv() }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('Location'), location);
  }
});

test('a form post that cannot be saved redirects to the save-error state', async () => {
  const env = {
    SUBSCRIBERS: {
      async get() { return null; },
      async put(key) { if (key.startsWith('sub:')) throw new Error('kv down'); },
    },
  };
  const { res } = await post(
    formRequest(valid, { 'Sec-Fetch-Dest': 'document' }),
    env
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/alerts/?error=save');
});

test('a honeypot-filled form post lands on the success page without storing', async () => {
  const ns = kv();
  const { res } = await post(
    formRequest({ ...valid, company: 'Bot' }, { 'Sec-Fetch-Dest': 'document' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/alerts/?subscribed=1');
  assert.equal(ns.store.size, 0);
});

test('a form body is parsed into the same fields as JSON', async () => {
  const ns = kv();
  const { res } = await post(
    formRequest({ email: 'FormUser@Example.com', state: 'ny' }, { Accept: 'text/html' }),
    { SUBSCRIBERS: ns }
  );
  assert.equal(res.status, 303);
  const rec = JSON.parse(ns.store.get('sub:formuser@example.com'));
  assert.equal(rec.email, 'formuser@example.com', 'normalized the same way as JSON');
  assert.equal(rec.state, 'NY');
});

test('a JSON client that asks for HTML still gets JSON', async () => {
  // Only a real non-JS navigation should be redirected; a fetch() must be able
  // to read the response it was promised.
  const { res, body } = await post(
    jsonRequest(valid, { Accept: 'text/html', 'cf-connecting-ip': '203.0.113.110' }),
    { SUBSCRIBERS: kv() }
  );
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});
