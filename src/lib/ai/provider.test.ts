import { describe, expect, it } from 'vitest';
import { normalizeAIBaseURL } from './provider';

describe('normalizeAIBaseURL', () => {
  it('adds /v1 for an OpenAI-compatible host URL', () => {
    expect(normalizeAIBaseURL('openai', 'https://api.dadakeji.com')).toBe('https://api.dadakeji.com/v1');
  });

  it('preserves an existing OpenAI-compatible API path', () => {
    expect(normalizeAIBaseURL('openai', 'https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });

  it('does not rewrite non-OpenAI provider URLs', () => {
    expect(normalizeAIBaseURL('anthropic', 'https://api.anthropic.com/')).toBe('https://api.anthropic.com');
  });
});
