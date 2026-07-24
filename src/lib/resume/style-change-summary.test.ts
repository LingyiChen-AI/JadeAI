import { describe, expect, it } from 'vitest';
import { styleChangeKeys } from './style-change-summary';

const change = (fieldPath: string, sectionId = '__resume_style__') => ({ sectionId, fieldPath }) as never;

describe('styleChangeKeys', () => {
  it('maps changed style fields once and ignores content changes', () => {
    expect(styleChangeKeys([
      change('themeConfig.primaryColor'),
      change('themeConfig.lineSpacing'),
      change('themeConfig.margin.top'),
      change('content.text', 'summary'),
    ])).toEqual(['primaryColor', 'lineSpacing', 'margin']);
  });

  it('returns no keys for no changes', () => expect(styleChangeKeys([])).toEqual([]));
});
