import { describe, it, expect } from 'vitest';
import { getModel, AIConfigError } from './provider';

describe('getModel', () => {
  it('throws AIConfigError when apiKey is missing', () => {
    expect(() =>
      getModel({ provider: 'openai', apiKey: '', baseURL: '', model: 'gpt-4o' })
    ).toThrow(AIConfigError);
  });

  it('returns a DeepSeek model for deepseek provider', () => {
    const model = getModel({
      provider: 'deepseek',
      apiKey: 'sk-test',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-reasoner',
    });
    expect(model).toBeDefined();
    expect(model.modelId).toBe('deepseek-reasoner');
  });
});
