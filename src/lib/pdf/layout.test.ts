import { describe, expect, it } from 'vitest';
import { parsePdfLayout, PdfLayoutError } from './layout';

describe('parsePdfLayout', () => {
  it.each([
    ['', 'a4'],
    ['fitOnePage=true', 'fit-one-page'],
    ['fitOnePage=false', 'a4'],
    ['fitOnePage=1', 'a4'],
    ['layout=a4', 'a4'],
    ['layout=fit-one-page', 'fit-one-page'],
    ['layout=continuous', 'continuous'],
    ['layout=a4&fitOnePage=false', 'a4'],
    ['layout=fit-one-page&fitOnePage=true', 'fit-one-page'],
  ])('resolves %s to %s', (query, expected) => {
    expect(parsePdfLayout(new URLSearchParams(query))).toBe(expected);
  });

  it.each([
    'layout=unknown', 'layout=', 'layout=A4',
    'layout=a4&fitOnePage=true', 'layout=fit-one-page&fitOnePage=false',
    'layout=continuous&fitOnePage=true', 'layout=continuous&fitOnePage=false',
    'layout=a4&layout=continuous', 'fitOnePage=true&fitOnePage=false',
  ])('rejects ambiguous or unsupported parameters: %s', query => {
    expect(() => parsePdfLayout(new URLSearchParams(query))).toThrow(PdfLayoutError);
  });
});
