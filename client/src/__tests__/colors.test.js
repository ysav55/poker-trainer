import { describe, it, expect } from 'vitest';
import { colors } from '../lib/colors.js';

describe('colors', () => {
  it('exports all required token keys', () => {
    const required = [
      'bgPrimary', 'bgSurface', 'bgSurfaceRaised', 'bgSurfaceHover',
      'textPrimary', 'textSecondary', 'textMuted',
      'gold', 'goldHover', 'goldSubtle',
      'success', 'error', 'warning', 'info',
      'borderDefault', 'borderStrong',
    ];
    for (const key of required) {
      expect(colors).toHaveProperty(key);
      expect(typeof colors[key]).toBe('string');
    }
  });

  it('all values are valid CSS color strings', () => {
    for (const [key, value] of Object.entries(colors)) {
      expect(value).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\(.+\))$/);
    }
  });
});
