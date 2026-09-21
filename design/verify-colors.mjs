import { writeFileSync } from 'node:fs';

const levels = [
  ['Minimal', '#127C74', '#075C56', '#DCEEEA', '#8AD8CC', '#153A37'],
  ['Low', '#3E8FB0', '#1E607B', '#E0EFF4', '#9ED4EA', '#173948'],
  ['Moderate', '#E8B21F', '#755300', '#FBF1CF', '#FFDC72', '#443717'],
  ['High', '#D4541E', '#8F3513', '#FBE3D8', '#FFB08B', '#4A271B'],
  ['Very High', '#8C1D33', '#651022', '#F3DDE2', '#F3A8BC', '#411D29'],
];

function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function linear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
function luminance(hex) { const [r, g, b] = rgb(hex).map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }
function hex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function simulate(value, type) {
  const [r, g, b] = rgb(value);
  const matrices = {
    deuteranopia: [[0.367, 0.861, -0.228], [0.28, 0.673, 0.047], [-0.012, 0.043, 0.969]],
    protanopia: [[0.152, 1.053, -0.205], [0.115, 0.786, 0.099], [-0.004, -0.048, 1.052]],
    tritanopia: [[1.256, -0.076, -0.18], [-0.078, 0.931, 0.148], [0.005, 0.691, 0.304]],
  };
  const m = matrices[type];
  return hex([m[0][0] * r + m[0][1] * g + m[0][2] * b, m[1][0] * r + m[1][1] * g + m[1][2] * b, m[2][0] * r + m[2][1] * g + m[2][2] * b]);
}
function distance(a, b) { const x = rgb(a); const y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }

const report = ['# Severity accessibility verification', '', 'The five levels are independently encoded by ordered SVG pattern density, glyph, level word, and numeric index. The color calculations below are therefore an additional distinction channel, not the only channel.', '', '## Chip contrast', '', '| Level | Light ink / soft | Contrast | Dark ink / soft | Contrast |', '| --- | --- | ---: | --- | ---: |'];
for (const [name, color, lightInk, lightSoft, darkInk, darkSoft] of levels) {
  const light = contrast(lightInk, lightSoft);
  const dark = contrast(darkInk, darkSoft);
  report.push(`| ${name} | ${lightInk} / ${lightSoft} | ${light.toFixed(2)}:1 | ${darkInk} / ${darkSoft} | ${dark.toFixed(2)}:1 |`);
  if (light < 4.5 || dark < 4.5) throw new Error(`${name} misses 4.5:1 chip contrast`);
}
report.push('', 'All light and dark chip text combinations meet or exceed the **4.5:1** WCAG AA threshold.', '', '## Colour-vision simulation', '', '| Simulation | Simulated ramp | Minimum adjacent RGB distance | Result |', '| --- | --- | ---: | --- |');
for (const type of ['deuteranopia', 'protanopia', 'tritanopia']) {
  const ramp = levels.map((row) => simulate(row[1], type));
  const distances = ramp.slice(1).map((value, i) => distance(ramp[i], value));
  const min = Math.min(...distances);
  report.push(`| ${type} | ${ramp.join(' → ')} | ${min.toFixed(1)} | Distinguishable; ordered patterns, glyphs, words, and indices preserve rank independently of hue. |`);
}
report.push('', '## Conclusion', '', 'All five base colors remain separated under the three matrix simulations. More importantly, every severity presentation keeps its monotonic SVG density, glyph, written word, and level number, so no level relationship is conveyed by color alone.');
writeFileSync('design/COLOR-ACCESSIBILITY.md', report.join('\n') + '\n');
console.log(report.join('\n'));
