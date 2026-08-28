import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  decodePng,
  encodePng,
  encodePngIndexed,
  cropTop,
  paintedBounds,
  flatTrailingRows,
  brightBounds,
} from '../build/lib/png.mjs';
import { SIGNALS } from '../build/lib/site.mjs';
import { SIGNAL_WEIGHTS } from '../src/scripts/threat-index.js';

// ---------------------------------------------------------------------------
// build/lib/png.mjs is hand-written binary-format code that six committed
// assets and five build gates now depend on. These are the cases that were
// found by inspection to be wrong, or that a guard silently relied on.
// ---------------------------------------------------------------------------

/** Solid w×h RGBA buffer. */
function solid(w, h, [r, g, b, a = 255]) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

test('encode/decode round-trips RGBA exactly', () => {
  const w = 7;
  const h = 5;
  const src = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    src[i * 4] = (i * 7) % 256;
    src[i * 4 + 1] = (i * 13) % 256;
    src[i * 4 + 2] = (i * 29) % 256;
    src[i * 4 + 3] = i % 3 === 0 ? 0 : 255;
  }
  const out = decodePng(encodePng(src, w, h, { alpha: true }));
  assert.equal(out.width, w);
  assert.equal(out.height, h);
  assert.equal(out.colorType, 6);
  assert.deepEqual(Buffer.from(out.rgba), src);
});

test('encoding without alpha composites over the given background', () => {
  // A fully transparent pixel must land on the background colour, not on black.
  const src = solid(2, 2, [10, 20, 30, 0]);
  const out = decodePng(encodePng(src, 2, 2, { alpha: false, background: [255, 255, 255] }));
  assert.equal(out.colorType, 2);
  assert.deepEqual([...out.rgba.subarray(0, 4)], [255, 255, 255, 255]);
});

test('indexed encode round-trips a small palette losslessly', () => {
  const w = 8;
  const h = 4;
  const src = Buffer.alloc(w * h * 4);
  const colors = [
    [12, 107, 65],
    [155, 28, 28],
    [255, 255, 255],
  ];
  for (let i = 0; i < w * h; i += 1) {
    const c = colors[i % colors.length];
    src[i * 4] = c[0];
    src[i * 4 + 1] = c[1];
    src[i * 4 + 2] = c[2];
    src[i * 4 + 3] = 255;
  }
  const out = decodePng(encodePngIndexed(src, w, h, 256));
  assert.equal(out.colorType, 3);
  assert.deepEqual(Buffer.from(out.rgba), src);
});

test('reserved colours survive quantisation exactly even when rare', () => {
  // One pixel of a brand colour in a field of another. An area-weighted median
  // cut drops it; reserving the slot must not. This is the defect that made the
  // share card's "Very High" legend swatch depend on the week's data.
  const w = 64;
  const h = 8;
  const src = solid(w, h, [200, 220, 230]);
  const rare = [155, 28, 28];
  src[0] = rare[0];
  src[1] = rare[1];
  src[2] = rare[2];
  const out = decodePng(encodePngIndexed(src, w, h, 8, [rare]));
  assert.deepEqual([...out.rgba.subarray(0, 3)], rare);
});

/** Hand-assemble an 8-bit indexed PNG, so decode paths can be tested directly. */
function buildIndexedPng({ width, height, palette, scanlines, trns }) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i += 1) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette)),
    ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []),
    chunk('IDAT', deflateSync(Buffer.from(scanlines))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('decode honours tRNS on an indexed image', () => {
  // 2×1 indexed, palette [red, green], tRNS makes entry 0 transparent.
  // Ignoring tRNS made transparent artwork read as opaque, which defeated the
  // "maskable icons must be full-bleed opaque" guard.
  const png = buildIndexedPng({
    width: 2,
    height: 1,
    palette: [255, 0, 0, 0, 255, 0],
    trns: [0],
    scanlines: [0, 0, 1], // filter 0, then index 0, index 1
  });
  const out = decodePng(png);
  assert.equal(out.rgba[3], 0, 'palette entry 0 must decode transparent via tRNS');
  assert.equal(out.rgba[7], 255, 'entries past tRNS are opaque');
});

test('paintedBounds finds a transparent bottom band', () => {
  const w = 4;
  const h = 10;
  const buf = solid(w, h, [1, 2, 3, 255]);
  for (let y = 7; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) buf[(y * w + x) * 4 + 3] = 0;
  }
  const b = paintedBounds(buf, w, h);
  assert.equal(b.blankBottomRows, 3);
  assert.equal(b.paintedHeight, 7);
});

test('flatTrailingRows catches truncation on an OPAQUE image', () => {
  // The alpha-based measure is structurally blind here — every pixel is opaque.
  // This is the case that made the truncation guard vacuous on the two assets
  // that were deliberately made opaque.
  const w = 6;
  const h = 10;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      const dead = y >= 7;
      buf[p] = dead ? 255 : x * 10; // real rows vary across x; dead rows do not
      buf[p + 1] = dead ? 255 : 80;
      buf[p + 2] = dead ? 255 : 90;
      buf[p + 3] = 255;
    }
  }
  assert.equal(paintedBounds(buf, w, h).blankBottomRows, 0, 'alpha measure cannot see this');
  assert.equal(flatTrailingRows(buf, w, h), 3, 'flat-row measure must see it');
});

test('flatTrailingRows does not flag artwork that reaches the edge', () => {
  const w = 6;
  const h = 6;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      buf[p] = x * 9;
      buf[p + 1] = y * 9;
      buf[p + 2] = 40;
      buf[p + 3] = 255;
    }
  }
  assert.equal(flatTrailingRows(buf, w, h), 0);
});

test('brightBounds measures the farthest painted pixel, not the bbox corner', () => {
  // A single bright pixel on the vertical centre line: its radius is its
  // distance along one axis only. Measuring bbox corners instead over-estimates
  // for any non-rectangular glyph, which wrongly failed a compliant icon.
  const w = 101;
  const h = 101;
  const buf = solid(w, h, [0, 0, 0, 255]);
  const x = 50;
  const y = 10;
  const p = (y * w + x) * 4;
  buf[p] = 255;
  buf[p + 1] = 255;
  buf[p + 2] = 255;
  const g = brightBounds(buf, w, h);
  assert.equal(Math.round(g.maxRadius), 40);
});

test('cropTop keeps exactly the requested rows', () => {
  const w = 3;
  const buf = solid(w, 10, [5, 6, 7, 255]);
  assert.equal(cropTop(buf, w, 4).length, w * 4 * 4);
});

test('decode rejects an out-of-range palette index rather than silently blackening it', () => {
  // Hand-built: a 2-entry palette with the image data referencing entry 200.
  // Previously this decoded to opaque black, contradicting the module's own
  // "throws rather than silently mis-decoding" contract.
  const png = buildIndexedPng({
    width: 2,
    height: 1,
    palette: [255, 0, 0, 0, 255, 0],
    scanlines: [0, 0, 200],
  });
  assert.throws(() => decodePng(png), /palette entry 200/);
});

// ---------------------------------------------------------------------------
// The signal list is a compliance invariant, not a style choice: pages that
// enumerate three of the four sources contradicted /methodology/ on 54 of 69
// pages. Nothing previously asserted the constant matches the scoring model.
// ---------------------------------------------------------------------------

test('SIGNALS names every weighted signal, including ARI', () => {
  const weighted = Object.keys(SIGNAL_WEIGHTS);
  assert.equal(weighted.length, 4, 'the model must still blend exactly four signals');
  for (const variant of ['plain', 'withSystems']) {
    const text = SIGNALS[variant].toLowerCase();
    assert.match(text, /emergency-department visits/, `${variant} names ED visits`);
    assert.match(text, /wastewater viral activity/, `${variant} names wastewater`);
    assert.match(text, /test positivity/, `${variant} names positivity`);
    assert.match(text, /acute respiratory illness/, `${variant} names ARI`);
  }
});

test('SIGNALS.withSystems attributes each signal to a surveillance system', () => {
  for (const sys of ['NSSP', 'NWSS', 'NREVSS']) {
    assert.ok(SIGNALS.withSystems.includes(sys), `withSystems names ${sys}`);
  }
});
