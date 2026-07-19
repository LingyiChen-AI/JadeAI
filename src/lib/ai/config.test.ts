import { describe, expect, test } from 'vitest';

import en from '../../../messages/en.json';
import zh from '../../../messages/zh.json';
import { DEFAULT_AI_MODEL } from './config';

describe('AI configuration', () => {
  test('uses gpt-5.6-sol as the central default model', () => {
    expect(DEFAULT_AI_MODEL).toBe('gpt-5.6-sol');
    expect(en.settings.ai.defaultModelHint).toContain('gpt-5.6-sol');
    expect(zh.settings.ai.defaultModelHint).toContain('gpt-5.6-sol');
  });
});
