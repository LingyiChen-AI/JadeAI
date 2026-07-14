import { describe, expect, it } from 'vitest';
import {
  GIT_URL_PLACEHOLDER,
  restoreGitHostingUrls,
  sanitizeResumeForModel,
  serializeResumeForModel,
} from './model-context';

describe('model resume context Git URL isolation', () => {
  it('redacts supported Git hosts and protocols at any nesting depth without mutating input', () => {
    const source = {
      website: 'https://example.com/portfolio',
      sections: [{
        content: {
          urls: [
            'https://github.com/acme/secret.git?tab=readme#top',
            'HTTP://GITLAB.COM/acme/internal',
            'ssh://git@gitee.com/acme/private.git',
            'git://bitbucket.org/acme/private.git',
            'git@github.com:acme/private.git',
          ],
          note: 'Source: https://code.github.com/acme/hidden',
        },
      }],
    };
    const snapshot = structuredClone(source);

    const sanitized = sanitizeResumeForModel(source);
    const serialized = JSON.stringify(sanitized);

    expect(source).toEqual(snapshot);
    expect(serialized).not.toMatch(/github|gitlab|gitee|bitbucket|acme\/secret|acme\/private|acme\/hidden/i);
    expect(serialized).toContain('https://example.com/portfolio');
    expect(serialized.match(new RegExp(GIT_URL_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(6);
  });

  it('omits cyclic values instead of leaking or throwing', () => {
    const source: Record<string, unknown> = { name: 'Resume' };
    source.self = source;

    expect(sanitizeResumeForModel(source)).toEqual({ name: 'Resume' });
  });

  it('serializes a detached model context', () => {
    expect(serializeResumeForModel({ url: 'https://github.com/owner/repo' }))
      .toBe(`{"url":"${GIT_URL_PLACEHOLDER}"}`);
  });

  it('restores exact persisted Git URLs by stable item id while retaining translated text', () => {
    const original = {
      items: [
        { id: 'one', name: 'Original', url: 'https://github.com/acme/one.git?x=1' },
        { id: 'two', name: 'Second', repoUrl: 'git@gitlab.com:acme/two.git' },
      ],
    };
    const translated = {
      items: [
        { id: 'two', name: '第二个', repoUrl: GIT_URL_PLACEHOLDER },
        { id: 'one', name: '已翻译' },
      ],
    };

    const restored = restoreGitHostingUrls(original, translated);

    expect(restored.items[0]).toEqual({
      id: 'two',
      name: '第二个',
      repoUrl: 'git@gitlab.com:acme/two.git',
    });
    expect(restored.items[1]).toEqual({
      id: 'one',
      name: '已翻译',
      url: 'https://github.com/acme/one.git?x=1',
    });
  });
});
