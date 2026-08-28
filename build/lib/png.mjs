// ===========================================================================
// Minimal, dependency-free PNG decode/encode.
//
// Exists because the rasterizer's output has to be post-processed (cropped,
// flattened, re-encoded) and because build/check.mjs has to be able to open an
// image and assert on its pixels. Both were previously impossible without a
// dependency, which is how six truncated PNGs — including a blank favicon —
// shipped green through `npm run verify`.
//
// Scope: 8-bit non-interlaced PNGs, colour types 0/2/4/6. That covers
// everything Chromium's --screenshot emits and everything we write back. Any
// other form throws rather than silently mis-decoding.
// ===========================================================================

import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decode a PNG to straight RGBA8.
 * @param {Buffer} buf raw file bytes
 * @returns {{width:number,height:number,colorType:number,rgba:Buffer}}
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG (bad signature)');
  let pos = 8;
  let ihdr = null;
  let plte = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      plte = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  const { width, height, bitDepth, colorType, interlace } = ihdr;
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (need 8)`);
  if (interlace !== 0) throw new Error('unsupported interlaced PNG');
  const ch = CHANNELS[colorType];
  if (!ch) throw new Error(`unsupported PNG colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    throw new Error(`truncated PNG data: got ${raw.length} bytes, need ${expected}`);
  }

  // Un-filter in place into a contiguous scanline buffer.
  const lines = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    src.copy(cur);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      if (ft === 1) cur[i] = (cur[i] + a) & 0xff;
      else if (ft === 2) cur[i] = (cur[i] + b) & 0xff;
      else if (ft === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) cur[i] = (cur[i] + paeth(a, b, c)) & 0xff;
      else if (ft !== 0) throw new Error(`bad PNG filter type ${ft} on row ${y}`);
    }
    prev = cur;
  }

  // Normalise to RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, px = 0; px < width * height; px += 1) {
    const s = px * ch;
    let r;
    let g;
    let b;
    let a = 255;
    if (colorType === 3) {
      if (!plte) throw new Error('indexed PNG has no PLTE chunk');
      const o = lines[s] * 3;
      [r, g, b] = [plte[o], plte[o + 1], plte[o + 2]];
    } else if (colorType === 0) {
      r = g = b = lines[s];
    } else if (colorType === 4) {
      r = g = b = lines[s];
      a = lines[s + 1];
    } else if (colorType === 2) {
      [r, g, b] = [lines[s], lines[s + 1], lines[s + 2]];
    } else {
      [r, g, b, a] = [lines[s], lines[s + 1], lines[s + 2], lines[s + 3]];
    }
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
    i += 4;
  }
  return { width, height, colorType, rgba };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode straight RGBA8 to a PNG, choosing a filter per row (the standard
 * minimum-sum-of-absolute-differences heuristic) so flat vector art compresses
 * properly instead of shipping near-raw.
 *
 * @param {Buffer} rgba width*height*4 bytes
 * @param {number} width
 * @param {number} height
 * @param {{alpha?:boolean, background?:[number,number,number]}} opts
 *   alpha=false drops the alpha channel, compositing over `background`
 *   (default white). Use for images consumed by surfaces that flatten alpha.
 */
export function encodePng(rgba, width, height, opts = {}) {
  const alpha = opts.alpha !== false;
  const bg = opts.background || [255, 255, 255];
  const ch = alpha ? 4 : 3;
  const stride = width * ch;

  const lines = Buffer.alloc(height * stride);
  for (let px = 0; px < width * height; px += 1) {
    const s = px * 4;
    const d = px * ch;
    const a = rgba[s + 3];
    if (alpha) {
      lines[d] = rgba[s];
      lines[d + 1] = rgba[s + 1];
      lines[d + 2] = rgba[s + 2];
      lines[d + 3] = a;
    } else {
      // Composite source-over the flat background.
      const f = a / 255;
      lines[d] = Math.round(rgba[s] * f + bg[0] * (1 - f));
      lines[d + 1] = Math.round(rgba[s + 1] * f + bg[1] * (1 - f));
      lines[d + 2] = Math.round(rgba[s + 2] * f + bg[2] * (1 - f));
    }
  }

  const out = Buffer.alloc(height * (stride + 1));
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    let best = 0;
    let bestScore = Infinity;
    for (let ft = 0; ft < 5; ft += 1) {
      const dst = cand[ft];
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= ch ? cur[i - ch] : 0;
        const b = prev[i];
        const c = i >= ch ? prev[i - ch] : 0;
        let v;
        if (ft === 0) v = cur[i];
        else if (ft === 1) v = cur[i] - a;
        else if (ft === 2) v = cur[i] - b;
        else if (ft === 3) v = cur[i] - ((a + b) >> 1);
        else v = cur[i] - paeth(a, b, c);
        v &= 0xff;
        dst[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = ft;
      }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
    prev = cur;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Median-cut colour quantisation with Floyd–Steinberg dithering.
 *
 * Flat vector art with a couple of smooth gradients — which is exactly what the
 * OG card is — carries far fewer than 256 perceptually distinct colours, but
 * truecolour PNG still spends 3 bytes a pixel on it. Indexing costs 1.
 */
function quantize(rgba, width, height, maxColors) {
  const hist = new Map();
  for (let p = 0; p < width * height; p += 1) {
    const s = p * 4;
    const key = (rgba[s] << 16) | (rgba[s + 1] << 8) | rgba[s + 2];
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const entries = [...hist.entries()].map(([key, count]) => ({
    r: (key >> 16) & 0xff,
    g: (key >> 8) & 0xff,
    b: key & 0xff,
    count,
  }));

  let boxes = [entries];
  while (boxes.length < maxColors) {
    // Split the box with the largest weighted spread; stop when none can split.
    let bi = -1;
    let bestScore = 0;
    let bestCh = 'r';
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (box.length < 2) continue;
      let pixels = 0;
      const lo = { r: 255, g: 255, b: 255 };
      const hi = { r: 0, g: 0, b: 0 };
      for (const c of box) {
        pixels += c.count;
        for (const ch of ['r', 'g', 'b']) {
          if (c[ch] < lo[ch]) lo[ch] = c[ch];
          if (c[ch] > hi[ch]) hi[ch] = c[ch];
        }
      }
      for (const ch of ['r', 'g', 'b']) {
        const score = (hi[ch] - lo[ch]) * Math.log2(pixels + 1);
        if (score > bestScore) {
          bestScore = score;
          bi = i;
          bestCh = ch;
        }
      }
    }
    if (bi === -1) break;
    const box = boxes[bi];
    box.sort((a, b) => a[bestCh] - b[bestCh]);
    const total = box.reduce((n, c) => n + c.count, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i += 1) {
      acc += box[i].count;
      if (acc * 2 >= total) {
        cut = i + 1;
        break;
      }
    }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }

  const palette = boxes.map((box) => {
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const c of box) {
      n += c.count;
      r += c.r * c.count;
      g += c.g * c.count;
      b += c.b * c.count;
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });

  const nearest = (r, g, b) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // Dither in float space so gradient banding does not survive indexing.
  const work = new Float32Array(width * height * 3);
  for (let p = 0; p < width * height; p += 1) {
    work[p * 3] = rgba[p * 4];
    work[p * 3 + 1] = rgba[p * 4 + 1];
    work[p * 3 + 2] = rgba[p * 4 + 2];
  }
  const indices = new Uint8Array(width * height);
  const push = (x, y, er, eg, eb, f) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 3;
    work[i] += er * f;
    work[i + 1] += eg * f;
    work[i + 2] += eb * f;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const r = Math.max(0, Math.min(255, work[i]));
      const g = Math.max(0, Math.min(255, work[i + 1]));
      const b = Math.max(0, Math.min(255, work[i + 2]));
      const idx = nearest(r, g, b);
      indices[y * width + x] = idx;
      const er = r - palette[idx][0];
      const eg = g - palette[idx][1];
      const eb = b - palette[idx][2];
      push(x + 1, y, er, eg, eb, 7 / 16);
      push(x - 1, y + 1, er, eg, eb, 3 / 16);
      push(x, y + 1, er, eg, eb, 5 / 16);
      push(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return { palette, indices };
}

/**
 * Encode RGBA as an indexed (colour type 3) PNG. Alpha is discarded — indexed
 * output here is for fully opaque art only.
 */
export function encodePngIndexed(rgba, width, height, maxColors = 256) {
  const { palette, indices } = quantize(rgba, width, height, maxColors);
  const stride = width;
  const out = Buffer.alloc(height * (stride + 1));
  // Filtering an index plane is usually counter-productive (indices are not a
  // continuous signal), so try only None vs Sub and keep the better row.
  let prevRow = null;
  for (let y = 0; y < height; y += 1) {
    const row = indices.subarray(y * width, (y + 1) * width);
    let sumNone = 0;
    let sumSub = 0;
    for (let i = 0; i < stride; i += 1) {
      const v = row[i];
      sumNone += v < 128 ? v : 256 - v;
      const s = (v - (i >= 1 ? row[i - 1] : 0)) & 0xff;
      sumSub += s < 128 ? s : 256 - s;
    }
    const useSub = sumSub < sumNone;
    out[y * (stride + 1)] = useSub ? 1 : 0;
    for (let i = 0; i < stride; i += 1) {
      out[y * (stride + 1) + 1 + i] = useSub ? (row[i] - (i >= 1 ? row[i - 1] : 0)) & 0xff : row[i];
    }
    prevRow = row;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => {
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
  });
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Keep the top `rows` scanlines of an RGBA buffer. */
export function cropTop(rgba, width, rows) {
  return rgba.subarray(0, width * rows * 4);
}

/**
 * Bounding box of pixels with any opacity, plus a count of fully-transparent
 * rows at the bottom — the signature of the rasterizer truncation this module
 * exists to make impossible to ship again.
 */
export function paintedBounds(rgba, width, height) {
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    let rowHas = false;
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] !== 0) {
        rowHas = true;
        count += 1;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (rowHas) {
      if (top === -1) top = y;
      bottom = y;
    }
  }
  return {
    top,
    bottom,
    left: right === -1 ? -1 : left,
    right,
    count,
    paintedHeight: bottom === -1 ? 0 : bottom + 1,
    blankBottomRows: bottom === -1 ? height : height - 1 - bottom,
  };
}
