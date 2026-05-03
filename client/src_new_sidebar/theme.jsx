/* ── theme.jsx ──────────────────────────────────────────────────────────────
   Three distinct aesthetic directions for the poker table redesign.
   All three keep the exact same component tree & game-state shape — only
   tokens change. This keeps the system auditable for designers and
   trivial to wire into the real app (swap palette, not markup).
─────────────────────────────────────────────────────────────────────────── */

const THEMES = {
  velvet: {
    name: 'Velvet',
    subtitle: 'Obsidian · violet · amber — premium editorial',
    // canvas
    bg:          '#07070a',
    bgGrad:      'radial-gradient(1200px 700px at 50% -10%, #1a1428 0%, #0a0812 55%, #06060a 100%)',
    surface:     'rgba(20,18,28,0.72)',
    surface2:    'rgba(28,24,38,0.9)',
    border:      'rgba(255,255,255,0.07)',
    borderStrong:'rgba(255,255,255,0.14)',
    // type
    text:        '#ece9e3',
    textDim:     '#8a8794',
    textMuted:   '#5a5764',
    // accents
    accent:      '#c9a35d',      // warm amber, replaces generic gold
    accentSoft:  'rgba(201,163,93,0.14)',
    accentRim:   'rgba(201,163,93,0.35)',
    violet:      '#9b7cff',
    violetSoft:  'rgba(155,124,255,0.14)',
    // game signals
    positive:    '#4ad991',
    warning:     '#f5b25b',
    danger:      '#ff6b6b',
    info:        '#6aa8ff',
    // table
    feltBase:    'linear-gradient(180deg, #16121f 0%, #100c18 100%)',
    feltRim:     'linear-gradient(180deg, rgba(201,163,93,0.25), rgba(155,124,255,0.15))',
    feltGlow:    '0 40px 120px -40px rgba(155,124,255,0.25), inset 0 0 180px rgba(0,0,0,0.6)',
    feltInnerLine:'rgba(255,255,255,0.04)',
    tableShape:  'rounded-rect', // pill-rect hybrid
    // card
    cardFace:    '#f4f1e8',
    cardInk:     '#1a1a1f',
    cardRed:     '#c24545',
    cardBack:    'linear-gradient(135deg, #2a1e44 0%, #1a1228 100%)',
    cardBackInk: 'rgba(155,124,255,0.65)',
    // chips
    chipCore:    '#c9a35d',
    chipEdge:    '#8a6e3a',
  },
  arcade: {
    name: 'Arcade',
    subtitle: 'Neon cyan · magenta — high-contrast, esports energy',
    bg:          '#050810',
    bgGrad:      'radial-gradient(1100px 600px at 50% 0%, #0a1428 0%, #050812 60%, #03050c 100%)',
    surface:     'rgba(8,14,26,0.78)',
    surface2:    'rgba(12,20,36,0.95)',
    border:      'rgba(120,200,255,0.10)',
    borderStrong:'rgba(120,200,255,0.28)',
    text:        '#e8f4ff',
    textDim:     '#7d90a8',
    textMuted:   '#4a5568',
    accent:      '#5ef0ff',      // neon cyan
    accentSoft:  'rgba(94,240,255,0.12)',
    accentRim:   'rgba(94,240,255,0.45)',
    violet:      '#ff5ec8',      // magenta (used as secondary accent)
    violetSoft:  'rgba(255,94,200,0.14)',
    positive:    '#5effb0',
    warning:     '#ffc65e',
    danger:      '#ff5e7a',
    info:        '#5ef0ff',
    feltBase:    'linear-gradient(180deg, #0a1528 0%, #050a18 100%)',
    feltRim:     'linear-gradient(180deg, rgba(94,240,255,0.35), rgba(255,94,200,0.22))',
    feltGlow:    '0 0 140px -20px rgba(94,240,255,0.25), inset 0 0 200px rgba(0,0,0,0.65)',
    feltInnerLine:'rgba(94,240,255,0.06)',
    tableShape:  'hex',
    cardFace:    '#f1f7ff',
    cardInk:     '#0a1020',
    cardRed:     '#ff3864',
    cardBack:    'linear-gradient(135deg, #0a2840 0%, #05101c 100%)',
    cardBackInk: 'rgba(94,240,255,0.75)',
    chipCore:    '#5ef0ff',
    chipEdge:    '#2a8aa0',
  },
  linen: {
    name: 'Linen',
    subtitle: 'Cream · ink — editorial daylight, calm',
    bg:          '#f0ece3',
    bgGrad:      'radial-gradient(1100px 650px at 50% -10%, #faf6ec 0%, #ede7d8 60%, #e4ddca 100%)',
    surface:     'rgba(255,252,244,0.9)',
    surface2:    '#fffcf4',
    border:      'rgba(30,24,18,0.10)',
    borderStrong:'rgba(30,24,18,0.22)',
    text:        '#1c1814',
    textDim:     '#6b6558',
    textMuted:   '#9a9484',
    accent:      '#b8432a',      // burnt orange
    accentSoft:  'rgba(184,67,42,0.10)',
    accentRim:   'rgba(184,67,42,0.40)',
    violet:      '#3a4a2e',      // deep olive (secondary)
    violetSoft:  'rgba(58,74,46,0.10)',
    positive:    '#3a7a4a',
    warning:     '#c08030',
    danger:      '#b8432a',
    info:        '#3a5a7a',
    feltBase:    'linear-gradient(180deg, #f7f2e6 0%, #ebe3d0 100%)',
    feltRim:     'linear-gradient(180deg, rgba(184,67,42,0.30), rgba(58,74,46,0.18))',
    feltGlow:    '0 40px 80px -30px rgba(30,24,18,0.18), inset 0 0 100px rgba(30,24,18,0.04)',
    feltInnerLine:'rgba(30,24,18,0.05)',
    tableShape:  'rounded-rect',
    cardFace:    '#fffdf7',
    cardInk:     '#1c1814',
    cardRed:     '#b8432a',
    cardBack:    'linear-gradient(135deg, #b8432a 0%, #8a2f1a 100%)',
    cardBackInk: 'rgba(255,253,247,0.85)',
    chipCore:    '#b8432a',
    chipEdge:    '#7a2a18',
  },
};

window.THEMES = THEMES;
