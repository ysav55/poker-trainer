import { describe, it, expect } from 'vitest';
import { PLAYLIST_COLORS, generatePlaylistColor, withOpacity } from '../components/scenarios/PLAYLIST_COLORS.js';

describe('PLAYLIST_COLORS', () => {
  it('exports 8 seed colors', () => {
    expect(PLAYLIST_COLORS).toHaveLength(8);
    PLAYLIST_COLORS.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('generatePlaylistColor', () => {
  it('returns seed colors for indices 0–7', () => {
    PLAYLIST_COLORS.forEach((c, i) => {
      expect(generatePlaylistColor(i)).toBe(c);
    });
  });

  it('produces visually distinct colors for indices 0–20', () => {
    const results = Array.from({ length: 21 }, (_, i) => generatePlaylistColor(i));
    const unique = new Set(results);
    expect(unique.size).toBe(21);
  });

  it('generated hues are separated by roughly the golden angle', () => {
    const hueOf = (c) => {
      const m = c.match(/hsl\((\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : null;
    };
    const a = hueOf(generatePlaylistColor(8));
    const b = hueOf(generatePlaylistColor(9));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const delta = Math.abs(b - a);
    const normalized = Math.min(delta, 360 - delta);
    expect(normalized).toBeGreaterThan(80);
  });
});

describe('withOpacity', () => {
  it('converts hex to rgba', () => {
    expect(withOpacity('#f97316', 0.2)).toBe('rgba(249,115,22,0.2)');
  });

  it('converts hsl() to hsla()', () => {
    expect(withOpacity('hsl(137.51, 70%, 55%)', 0.2)).toBe('hsla(137.51, 70%, 55%,0.2)');
  });
});
