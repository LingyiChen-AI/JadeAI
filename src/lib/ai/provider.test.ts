import { describe, it, expect } from 'vitest';
import {
  AIProvider,
  getDefaultBaseURL,
  getDefaultModel,
  AIConfigError,
  extractAIConfig,
} from './provider';

describe('AIProvider defaults', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1', 'gpt-4o'],
    ['anthropic', 'https://api.anthropic.com', 'claude-sonnet-4-20250514'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.0-flash'],
  ] as [AIProvider, string, string][])('returns defaults for %s', (provider, baseURL, model) => {
    expect(getDefaultBaseURL(provider)).toBe(baseURL);
    expect(getDefaultModel(provider)).toBe(model);
  });

  it('falls back to openai defaults for unexpected providers', () => {
    expect(getDefaultBaseURL('unknown' as AIProvider)).toBe('https://api.openai.com/v1');
    expect(getDefaultModel('unknown' as AIProvider)).toBe('gpt-4o');
  });
});

describe('extractAIConfig', () => {
  it('uses defaults when headers are missing', () => {
    const request = new Request('https://example.com/api/ai/chat');
    const config = extractAIConfig(request as unknown as import('next/server').NextRequest);

    expect(config.provider).toBe('openai');
    expect(config.baseURL).toBe(getDefaultBaseURL('openai'));
    expect(config.model).toBe(getDefaultModel('openai'));
    expect(config.apiKey).toBe('');
  });

  it('reads custom headers', () => {
    const request = new Request('https://example.com/api/ai/chat', {
      headers: {
        'x-provider': 'anthropic',
        'x-api-key': 'sk-test',
        'x-base-url': 'https://custom.example.com',
        'x-model': 'claude-test',
      },
    });
    const config = extractAIConfig(request as unknown as import('next/server').NextRequest);

    expect(config).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-test',
      baseURL: 'https://custom.example.com',
      model: 'claude-test',
    });
  });
});

describe('AIConfigError', () => {
  it('has the correct name', () => {
    const err = new AIConfigError('test');
    expect(err.name).toBe('AIConfigError');
    expect(err.message).toBe('test');
  });
});
