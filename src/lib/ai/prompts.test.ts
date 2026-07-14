import { describe, expect, it } from 'vitest';
import { getSystemPrompt } from './prompts';

describe('AI edit response instructions', () => {
  it('requires direct tool calls and exactly one brief completion summary', () => {
    const prompt = getSystemPrompt('');

    expect(prompt).toContain('call the appropriate tool immediately without a preamble');
    expect(prompt).toContain('provide exactly one brief summary');
    expect(prompt).not.toContain("Always explain what you're about to change");
  });
});
