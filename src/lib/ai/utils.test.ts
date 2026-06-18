import { describe, it, expect } from 'vitest';
import { dbMessagesToUIMessages } from './utils';

describe('dbMessagesToUIMessages', () => {
  it('restores reasoning part from metadata', () => {
    const messages = dbMessagesToUIMessages([
      {
        id: 'm1',
        role: 'assistant',
        content: 'Final answer',
        metadata: { reasoning: 'Let me think...' },
        createdAt: Date.now(),
      },
    ]);
    expect(messages[0].parts).toEqual([
      { type: 'reasoning', text: 'Let me think...' },
      { type: 'text', text: 'Final answer' },
    ]);
  });

  it('ignores empty reasoning metadata', () => {
    const messages = dbMessagesToUIMessages([
      {
        id: 'm1',
        role: 'assistant',
        content: 'Hi',
        metadata: { reasoning: '' },
        createdAt: Date.now(),
      },
    ]);
    expect(messages[0].parts).toEqual([{ type: 'text', text: 'Hi' }]);
  });
});
