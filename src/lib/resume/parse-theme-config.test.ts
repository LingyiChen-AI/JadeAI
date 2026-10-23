import { describe, expect, it } from 'vitest';
import { parseThemeConfig } from './parse-theme-config';

describe('legacy theme configuration', () => {
  it('decodes serialized defaults and preserves existing theme objects', () => {
    expect(parseThemeConfig('{}')).toEqual({});
    expect(parseThemeConfig('{"lineSpacing":1.7,"accentColor":"#123456"}'))
      .toEqual({ lineSpacing: 1.7, accentColor: '#123456' });
    const theme = { lineSpacing: 1.7 };
    expect(parseThemeConfig(theme)).toBe(theme);
    expect(parseThemeConfig(undefined)).toBeNull();
    expect(parseThemeConfig(null)).toBeNull();
  });

  it('heals previously saved character keys while preserving later layout changes', () => {
    const characters = Object.fromEntries(Array.from('{"accentColor":"#123456"}', (character, index) => [index, character]));
    const theme = { ...characters, lineSpacing: 1.6, sectionSpacing: 18 };
    const before = structuredClone(theme);
    expect(parseThemeConfig(theme)).toEqual({ accentColor: '#123456', lineSpacing: 1.6, sectionSpacing: 18 });
    expect(theme).toEqual(before);
  });

  it('does not silently strip arbitrary unknown keys', () => {
    const theme = { 0: 'unrelated', customOption: 'invalid' };
    expect(parseThemeConfig(theme)).toBe(theme);
  });

  it.each(['invalid', '[]', '123', 'true'])('rejects invalid theme JSON: %s', value => {
    expect(() => parseThemeConfig(value)).toThrow('Invalid resume theme');
  });
});
