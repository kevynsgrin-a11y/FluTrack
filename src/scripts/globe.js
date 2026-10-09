// ===========================================================================
// Landing globe — a 2.5-second payoff AFTER the result card, never a gate in
// front of it. Canvas orthographic projection with vendored d3-geo +
// topojson-client (geo-vendor.js) and pre-simplified geometry
// (/assets/geo/*.json).
//
// Budget: this file + geo-vendor.js + the geometry must stay <= 45 KB
// gzipped (build/check.mjs fails the build otherwise), and none of it loads
// with the page: report-widget.js imports it only once the result card is on
// screen and the browser is idle. The box it draws into has a fixed size from
// the first paint, so it never shifts layout.
//
// prefers-reduced-motion or Save-Data → one static frame, no animation.
// Purely decorative (aria-hidden): the result card says everything in text.
// ===========================================================================

import { geoOrthographic, geoPath, geoGraticule10, geoCentroid, geoInterpolate, feature } from './geo-vendor.js';
import { states } from './states-data.js';

const DURATION = 2400;
const geometry = () =>
  Promise.all(['/assets/geo/land-110m.json', '/assets/geo/us-states.json'].map((u) => fetch(u).then((r) => r.json())));

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export async function mountGlobe(el, { state, level } = {}) {
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = '1';
  const [landTopo, usTopo] = await geometry();
  const land = feature(landTopo, landTopo.objects.land);
  const usStates = feature(usTopo, usTopo.objects.states);
  const fips = states.find((s) => s.abbr === state)?.fips;
  const target = usStates.features.find((f) => String(f.id).padStart(2, '0') === fips) || null;
  const [lon, lat] = target ? geoCentroid(target) : [-98.5, 39.8];

  const size = Math.max(160, Math.round(el.clientWidth || 288));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const baseScale = size / 2 - 4;
  const projection = geoOrthographic().translate([size / 2, size / 2]).scale(baseScale).precision(0.6);
  const path = geoPath(projection, ctx);
  const graticule = geoGraticule10();
  const sev = Number.isFinite(level) ? Math.max(0, Math.min(4, level)) : null;
  const colors = {
    ocean: cssVar('--bg-sunken', '#e9e4d8'),
    land: cssVar('--border-strong', '#9aa5a6'),
    states: cssVar('--surface', '#ffffff'),
    line: cssVar('--border', '#cfd6d6'),
    target: sev != null ? cssVar(`--sev-${sev}`, '#0b7285') : cssVar('--brand-500', '#0b7285'),
    ink: cssVar('--text', '#102126'),
  };

  function draw(rotation, scale, pin = 0) {
    projection.rotate(rotation).scale(scale);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, baseScale, 0, 2 * Math.PI);
    ctx.clip();
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = colors.ocean;
    ctx.fill();
    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.beginPath();
    path(land);
    ctx.fillStyle = colors.land;
    ctx.fill();
    ctx.beginPath();
    path(usStates);
    ctx.fillStyle = colors.states;
    ctx.fill();
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (target) {
      ctx.beginPath();
      path(target);
      ctx.fillStyle = colors.target;
      ctx.fill();
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, baseScale, 0, 2 * Math.PI);
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (pin > 0 && target) {
      const p = projection([lon, lat]);
      if (p) {
        const drop = (1 - pin) * 18;
        ctx.beginPath();
        ctx.arc(p[0], p[1] - 10 - drop, 6, 0, 2 * Math.PI);
        ctx.moveTo(p[0] - 4, p[1] - 7 - drop);
        ctx.lineTo(p[0], p[1] - drop);
        ctx.lineTo(p[0] + 4, p[1] - 7 - drop);
        ctx.fillStyle = colors.target;
        ctx.fill();
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  const endScale = baseScale * 2.4;
  const finalRotation = [-lon, -lat];
  el.replaceChildren(canvas);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData === true;
  if (still) {
    draw(finalRotation, endScale, 1);
    return;
  }

  const start = [lon + 140, 15];
  const travel = geoInterpolate(start, [lon, lat]);
  const t0 = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / DURATION);
    const spin = ease(Math.min(1, t / 0.55)); // spin and ease toward the state
    const zoom = ease(Math.max(0, Math.min(1, (t - 0.45) / 0.45))); // then zoom in
    const pin = Math.max(0, Math.min(1, (t - 0.88) / 0.12)); // then drop the pin
    const [rl, rp] = travel(spin);
    draw([-rl, -rp], baseScale + (endScale - baseScale) * zoom, pin);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
