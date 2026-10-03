import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/csp-report.js';

const URL_UNDER_TEST = 'https://flutrack.example/api/csp-report';
const MAX_BODY_BYTES = 64 * 1024;

/** Capture the handler's log output so the filter can be asserted. */
async function captureWarnings(run) {
  const lines = [];
  const original = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));
  try {
    const res = await run();
    return { res, lines };
  } finally {
    console.warn = original;
  }
}

function reportRequest(payload, contentType = 'application/csp-report', extraHeaders = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new Request(URL_UNDER_TEST, {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...extraHeaders },
    body,
  });
}

/** A single well-formed `report-uri` payload. */
function cspReport(fields) {
  return { 'csp-report': { ...fields } };
}

const realViolation = {
  'effective-directive': 'script-src',
  'blocked-uri': 'https://evil.example/track.js',
  'document-uri': 'https://flutrack.example/',
  'script-sample': 'malware()',
};

// --- content type gate ---------------------------------------------------- //

test('a non-report content type is refused with 415', async () => {
  for (const type of ['text/plain', 'text/html', 'application/xml', 'multipart/form-data']) {
    const res = await onRequestPost({ request: reportRequest(realViolation, type) });
    assert.equal(res.status, 415, `refuses ${type}`);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  }
});

test('a missing content type is refused with 415', async () => {
  const request = new Request(URL_UNDER_TEST, { method: 'POST', body: '{}' });
  const res = await onRequestPost({ request });
  assert.equal(res.status, 415);
});

test('every documented report transport is accepted', async () => {
  for (const type of [
    'application/csp-report',
    'application/reports+json',
    'application/json',
    'application/csp-report; charset=utf-8',
    'APPLICATION/CSP-REPORT',
  ]) {
    const { res } = await captureWarnings(() =>
      onRequestPost({ request: reportRequest(cspReport(realViolation), type) })
    );
    assert.equal(res.status, 204, `accepts ${type}`);
  }
});

// --- body size gate ------------------------------------------------------- //

test('an oversized declared Content-Length is refused before the body is read', async () => {
  const request = reportRequest(cspReport(realViolation), 'application/csp-report', {
    'Content-Length': String(MAX_BODY_BYTES + 1),
  });
  const res = await onRequestPost({ request });
  assert.equal(res.status, 413);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('an oversized body is refused even when Content-Length understates it', async () => {
  // Content-Length is a claim, not a guarantee: the bytes actually received
  // are re-checked, so an attacker cannot lie their way past the bound.
  const padded = { 'csp-report': { ...realViolation, 'blocked-uri': `https://evil.example/${'a'.repeat(MAX_BODY_BYTES)}` } };
  const request = reportRequest(padded, 'application/csp-report', { 'Content-Length': '10' });
  const res = await onRequestPost({ request });
  assert.equal(res.status, 413);
});

test('a body just under the limit is accepted', async () => {
  const filler = 'a'.repeat(1000);
  const { res } = await captureWarnings(() =>
    onRequestPost({ request: reportRequest(cspReport({ ...realViolation, sample: filler })) })
  );
  assert.equal(res.status, 204);
});

// --- malformed payloads ---------------------------------------------------- //

test('a body that is not JSON is refused with 400', async () => {
  const res = await onRequestPost({ request: reportRequest('{ not json', 'application/csp-report') });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('an empty body is refused with 400', async () => {
  const res = await onRequestPost({ request: reportRequest('', 'application/csp-report') });
  assert.equal(res.status, 400);
});

// --- response shape -------------------------------------------------------- //

test('a handled report is acknowledged with an empty 204 and no CORS header', async () => {
  const { res } = await captureWarnings(() =>
    onRequestPost({ request: reportRequest(cspReport(realViolation)) })
  );
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '', 'the browser gets an acknowledgement, not a payload');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null, 'reports are same-origin; no CORS is emitted');
});

test('the log line names the directive, the blocked URI, and the page', async () => {
  const { res, lines } = await captureWarnings(() =>
    onRequestPost({ request: reportRequest(cspReport(realViolation)) })
  );
  assert.equal(res.status, 204);
  assert.equal(lines.length, 1, 'exactly one line per real violation');
  assert.equal(
    lines[0],
    '[csp] script-src blocked https://evil.example/track.js on https://flutrack.example/ — sample: malware()'
  );
});

test('the log line carries no visitor identity', async () => {
  // A violation report is a policy signal, not a visitor record.
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(cspReport(realViolation)),
      env: { CF: { connectingIp: '203.0.113.5' } },
    })
  );
  assert.ok(!lines[0].includes('203.0.113.5'), 'no IP is logged');
  assert.ok(!/cookie|user-agent/i.test(lines[0]), 'no cookie or UA is logged');
});

// --- Reporting API envelopes ---------------------------------------------- //

test('only csp-violation envelopes are extracted from a Reporting API payload', async () => {
  const { res, lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        [
          { type: 'csp-violation', body: realViolation },
          { type: 'network-error', body: { uri: 'https://flutrack.example/x.js', error: 'dns' } },
          { type: 'deprecation', body: { id: 'old-thing' } },
        ],
        'application/reports+json'
      ),
    })
  );
  assert.equal(res.status, 204);
  assert.equal(lines.length, 1, 'non-CSP report types are ignored');
  assert.match(lines[0], /script-src/);
});

test('several violations in one payload are logged individually', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        [
          { type: 'csp-violation', body: { ...realViolation, 'blocked-uri': 'https://a.example/1.js' } },
          { type: 'csp-violation', body: { ...realViolation, 'blocked-uri': 'https://b.example/2.js' } },
        ],
        'application/reports+json'
      ),
    })
  );
  assert.equal(lines.length, 2);
  assert.match(lines[0], /a\.example/);
  assert.match(lines[1], /b\.example/);
});

test('envelopes with a missing or non-object body are skipped', async () => {
  const { res, lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        [
          { type: 'csp-violation' },
          { type: 'csp-violation', body: null },
          { type: 'csp-violation', body: 'a string' },
          { type: 'csp-violation', body: realViolation },
        ],
        'application/reports+json'
      ),
    })
  );
  assert.equal(res.status, 204);
  assert.equal(lines.length, 1, 'only the well-formed body is reported');
});

// --- noise filtering -------------------------------------------------------- //

test('extension-injected violations are not logged', async () => {
  const noisy = [
    'chrome-extension://abcdefghijklmnop/ext.js',
    'moz-extension://abcdef/script.js',
    'safari-web-extension://abcdef/script.js',
    'safari-extension://abcdef/script.js',
    'webkit-extension://abcdef/script.js',
    'ms-browser-extension://abcdef/script.js',
    'about:blank',
    'data:text/html,<h1>hi</h1>',
  ];
  for (const blockedUri of noisy) {
    const { res, lines } = await captureWarnings(() =>
      onRequestPost({ request: reportRequest(cspReport({ ...realViolation, 'blocked-uri': blockedUri })) })
    );
    assert.equal(res.status, 204, `still acknowledged: ${blockedUri}`);
    assert.equal(lines.length, 0, `suppressed as extension noise: ${blockedUri}`);
  }
});

test('real third-party violations are still logged alongside noise', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        [
          { type: 'csp-violation', body: { ...realViolation, 'blocked-uri': 'chrome-extension://abc/x.js' } },
          { type: 'csp-violation', body: { ...realViolation, 'blocked-uri': 'https://cdn.example/sdk.js' } },
        ],
        'application/reports+json'
      ),
    })
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /cdn\.example/);
});

test('an https violation whose path merely mentions an extension is not suppressed', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        cspReport({ ...realViolation, 'blocked-uri': 'https://evil.example/chrome-extension.js' })
      ),
    })
  );
  assert.equal(lines.length, 1, 'the filter anchors on the scheme, not a substring');
});

// --- field normalization ---------------------------------------------------- //

test('missing fields fall back to "unknown" rather than being dropped', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({ request: reportRequest({ 'csp-report': {} }) })
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[csp] unknown blocked unknown on unknown');
});

test('both transports\' own field spellings are accepted', async () => {
  // `report-uri` posts kebab-case; the Reporting API posts camelCase. Each
  // transport's own spelling is normalized to one shape.
  const kebab = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest({
        'csp-report': {
          'violated-directive': 'img-src',
          'blocked-uri': 'https://tracker.example/pixel',
          'document-uri': 'https://flutrack.example/state/california/',
        },
      }),
    })
  );
  assert.equal(
    kebab.lines[0],
    '[csp] img-src blocked https://tracker.example/pixel on https://flutrack.example/state/california/'
  );

  const camel = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        [
          {
            type: 'csp-violation',
            body: {
              effectiveDirective: 'img-src',
              blockedURL: 'https://tracker.example/pixel',
              documentURL: 'https://flutrack.example/state/california/',
            },
          },
        ],
        'application/reports+json'
      ),
    })
  );
  assert.equal(
    camel.lines[0],
    '[csp] img-src blocked https://tracker.example/pixel on https://flutrack.example/state/california/'
  );
});

test('effective-directive wins over violated-directive when both are present', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest({
        'csp-report': {
          'effective-directive': 'script-src-elem',
          'violated-directive': 'default-src',
          'blocked-uri': 'https://evil.example/a.js',
        },
      }),
    })
  );
  assert.match(lines[0], /^\[csp\] script-src-elem blocked/);
});

test('an omitted sample is simply absent from the line', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({ request: reportRequest(cspReport({ ...realViolation, 'script-sample': '' })) })
  );
  assert.ok(!lines[0].includes('sample:'), 'no dangling sample clause');
});

test('every field is clamped to a bounded length', async () => {
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        cspReport({
          'effective-directive': 'd'.repeat(200),
          'blocked-uri': 'b'.repeat(600),
          'document-uri': 'c'.repeat(600),
          'script-sample': 's'.repeat(400),
        })
      ),
    })
  );
  // An unbounded field would let a single report flood the Workers log.
  assert.equal(
    lines[0],
    `[csp] ${'d'.repeat(64)} blocked ${'b'.repeat(256)} on ${'c'.repeat(256)} — sample: ${'s'.repeat(128)}`
  );
});

test('control characters in reported values become spaces, not newlines', async () => {
  // A report is attacker-reachable; an embedded newline would forge log lines.
  const { lines } = await captureWarnings(() =>
    onRequestPost({
      request: reportRequest(
        cspReport({ ...realViolation, 'blocked-uri': 'https://evil.example/a.js\u000A[csp] forged line' })
      ),
    })
  );
  assert.equal(lines.length, 1, 'a newline cannot forge a second log line');
  assert.ok(!lines[0].includes('\n'));
  assert.ok(lines[0].includes('https://evil.example/a.js [csp] forged line'));
});

// --- shapes that carry nothing to log -------------------------------------- //

test('a payload with no recognizable report is acknowledged but not logged', async () => {
  for (const payload of [{}, { unrelated: true }, { 'csp-report': null }, []]) {
    const { res, lines } = await captureWarnings(() =>
      onRequestPost({ request: reportRequest(payload, 'application/reports+json') })
    );
    assert.equal(res.status, 204, `acknowledges ${JSON.stringify(payload)}`);
    assert.equal(lines.length, 0);
  }
});

test('a JSON scalar body is acknowledged without throwing', async () => {
  for (const payload of ['null', '42', '"text"', 'true']) {
    const { res, lines } = await captureWarnings(() =>
      onRequestPost({ request: reportRequest(payload, 'application/reports+json') })
    );
    assert.equal(res.status, 204, `acknowledges ${payload}`);
    assert.equal(lines.length, 0);
  }
});

test('the endpoint is read-only: nothing is echoed back to the sender', async () => {
  const secretish = 'https://flutrack.example/secret-path';
  const { res } = await captureWarnings(() =>
    onRequestPost({ request: reportRequest(cspReport({ ...realViolation, 'document-uri': secretish })) })
  );
  assert.equal(await res.text(), '', 'no reflection of submitted data');
});
