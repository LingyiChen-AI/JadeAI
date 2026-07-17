import { describe, expect, it } from 'vitest';

import {
  buildBeautifyContext,
  parseBeautifyFlag,
  shouldRegisterBeautifyTools,
} from './beautify';

const resume = {
  template: 'modern',
  templateSource: 'legacy',
  templateVersionId: null,
  themeConfig: {
    primaryColor: '#111111',
    accentColor: '#2563eb',
    fontFamily: 'Georgia',
    fontSize: 'medium',
    lineSpacing: 1.5,
    sectionSpacing: 16,
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
  },
};

describe('AI beautify authorization', () => {
  it('defaults missing beautify to false and rejects non-booleans', () => {
    expect(parseBeautifyFlag({})).toBe(false);
    expect(parseBeautifyFlag({ beautify: false })).toBe(false);
    expect(parseBeautifyFlag({ beautify: true })).toBe(true);
    expect(() => parseBeautifyFlag({ beautify: 'true' })).toThrow('invalid_beautify_flag');
  });

  it('does not expose style context or tools unless explicitly enabled', () => {
    expect(buildBeautifyContext(resume, false)).toBe('');
    expect(buildBeautifyContext(resume, 'true' as unknown as boolean)).toBe('');
    expect(shouldRegisterBeautifyTools(false)).toBe(false);

    const context = buildBeautifyContext(resume, true);
    expect(context).toContain('modern');
    expect(context).toContain('#111111');
    expect(context).not.toContain('Georgia');
    expect(shouldRegisterBeautifyTools(true)).toBe(true);
  });

  it('serializes only whitelisted template and theme fields', () => {
    const context = buildBeautifyContext({
      ...resume,
      template: 'not-a-template',
      templateSource: 'not-a-source',
      themeConfig: {
        primaryColor: '#111111',
        margin: { top: 20, diagonal: 999 },
        privateNote: 'do-not-expose',
      },
    }, true);

    expect(context).toContain('#111111');
    expect(context).toContain('"top":20');
    expect(context).not.toContain('not-a-template');
    expect(context).not.toContain('not-a-source');
    expect(context).not.toContain('diagonal');
    expect(context).not.toContain('do-not-expose');
  });
});
