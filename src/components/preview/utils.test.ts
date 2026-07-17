import { describe, expect, it } from 'vitest';

import { md } from './utils';

describe('preview markdown rendering', () => {
  it('renders host-safe indented ordered lists while escaping raw HTML', () => {
    const html = md('Intro\n\t1. <img src=x onerror=alert(1)> **Led migration**');

    expect(html).toContain('data-kind="ordered"');
    expect(html).toContain('data-indent="1"');
    expect(html).toContain('>1. </span>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<strong>Led migration</strong>');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<(?:p|ul|ol|li|div)(?:\s|>)/);
  });
});
