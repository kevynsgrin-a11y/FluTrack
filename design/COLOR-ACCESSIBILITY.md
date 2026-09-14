# Severity accessibility verification

The five levels are independently encoded by ordered SVG pattern density, glyph, level word, and numeric index. The color calculations below are therefore an additional distinction channel, not the only channel.

## Chip contrast

| Level | Light ink / soft | Contrast | Dark ink / soft | Contrast |
| --- | --- | ---: | --- | ---: |
| Minimal | #075C56 / #DCEEEA | 6.53:1 | #8AD8CC / #153A37 | 7.55:1 |
| Low | #1E607B / #E0EFF4 | 5.91:1 | #9ED4EA / #173948 | 7.61:1 |
| Moderate | #755300 / #FBF1CF | 6.21:1 | #FFDC72 / #443717 | 8.72:1 |
| High | #8F3513 / #FBE3D8 | 6.36:1 | #FFB08B / #4A271B | 7.41:1 |
| Very High | #651022 / #F3DDE2 | 9.85:1 | #F3A8BC / #411D29 | 7.78:1 |

All light and dark chip text combinations meet or exceed the **4.5:1** WCAG AA threshold.

## Colour-vision simulation

| Simulation | Simulated ramp | Minimum adjacent RGB distance | Result |
| --- | --- | ---: | --- |
| deuteranopia | #575e76 → #6a7ab0 → #e7ba23 → #8f751e → #413d31 | 67.1 | Distinguishable; ordered patterns, glyphs, words, and indices preserve rank independently of hue. |
| protanopia | #6e6f74 → #7c89b2 → #d8aa17 → #735d1b → #292c34 | 68.7 | Distinguishable; ordered patterns, glyphs, words, and indices preserve rank independently of hue. |
| tritanopia | #008379 → #239a99 → #ff9886 → #fe4244 → #a41824 | 52.7 | Distinguishable; ordered patterns, glyphs, words, and indices preserve rank independently of hue. |

## Conclusion

All five base colors remain separated under the three matrix simulations. More importantly, every severity presentation keeps its monotonic SVG density, glyph, written word, and level number, so no level relationship is conveyed by color alone.
