import { describe, expect, it } from 'vitest';

import {
  normalizeRichText,
  parseRichText,
  renderRichTextHostHtml,
  renderRichTextHtml,
  richTextToPlainText,
} from './rich-text';

describe('resume rich text', () => {
  it('renders bold text, ordered lists, bullet lists, and up to three indent levels', () => {
    const value = [
      '**Led** platform delivery',
      '- First result',
      '\t- Nested result',
      '\t\t\t1. Deep numbered result',
      '\t\t\t\t- Clamped result',
    ].join('\n');

    const html = renderRichTextHtml(value);

    expect(html).toContain('<strong>Led</strong> platform delivery');
    expect(html).toContain('<ul');
    expect(html).toContain('<ol');
    expect(html).toContain('data-indent="1"');
    expect(html).toContain('data-indent="3"');
    expect(html).not.toContain('data-indent="4"');
  });

  it('normalizes legacy markers deterministically and escapes arbitrary HTML', () => {
    const unsafe = '<img src=x onerror=alert(1)>\r\n  -  **Result**  ';
    const once = normalizeRichText(unsafe);
    const twice = normalizeRichText(once);

    expect(twice).toBe(once);
    expect(renderRichTextHtml(once)).not.toContain('<img');
    expect(renderRichTextHtml(once)).toContain('&lt;img');
  });

  it('returns readable plain text for DOCX and AI fallbacks', () => {
    expect(richTextToPlainText('**Impact**\n\t- Saved 20%')).toBe('Impact\nSaved 20%');
  });

  it('only recognizes a list marker when whitespace follows it', () => {
    expect(parseRichText('2024.Achievement\n-text')).toEqual([
      { kind: 'paragraph', indent: 0, text: '2024.Achievement' },
      { kind: 'paragraph', indent: 0, text: '-text' },
    ]);
    expect(parseRichText('2024. Achievement\n- text')).toEqual([
      { kind: 'ordered', indent: 0, text: 'Achievement' },
      { kind: 'bullet', indent: 0, text: 'text' },
    ]);
  });

  it('renders phrasing-safe rich text for existing paragraph and list-item hosts', () => {
    const html = renderRichTextHostHtml('Intro\n\t- **Saved** 20%\n\t1. Shipped');

    expect(html).toContain('<span');
    expect(html).toContain('data-kind="bullet"');
    expect(html).toContain('data-kind="ordered"');
    expect(html).toContain('data-indent="1"');
    expect(html).toContain('<strong>Saved</strong>');
    expect(html).toContain('>• </span>');
    expect(html).toContain('>1. </span>');
    expect(html).not.toMatch(/<(?:p|ul|ol|li|div)(?:\s|>)/);
  });

  it('counts ordered items independently by indent within one logical list', () => {
    const html = renderRichTextHostHtml([
      '1. Root one',
      '\t1. Child one',
      '1. Root two',
      'Paragraph boundary',
      '1. New list',
      '- Bullet boundary',
      '\t\t\t\t1. Another list',
    ].join('\n'));
    const markers = [...html.matchAll(/data-rich-text-marker="true">([^<]+)<\/span>/g)]
      .map((match) => match[1].trim());

    expect(markers).toEqual(['1.', '1.', '2.', '1.', '•', '1.']);
    expect(html).toContain('data-kind="ordered" data-indent="3"');
    expect(html).not.toContain('data-indent="4"');
  });

  it('keeps a parent ordered counter across nested bullet items', () => {
    const html = renderRichTextHostHtml([
      '1. Root one',
      '\t- Child bullet',
      '1. Root two',
    ].join('\n'));
    const markers = [...html.matchAll(/data-rich-text-marker="true">([^<]+)<\/span>/g)]
      .map((match) => match[1].trim());

    expect(markers).toEqual(['1.', '•', '2.']);
  });
});
