import { describe, expect, it } from 'vitest';
import { withResumePdfSlot } from './render-limit';

describe('resume PDF concurrency bound', () => {
  it('rejects excess renders and releases slots on success and failure', async () => {
    let finish!: () => void;
    let fail!: (error: Error) => void;
    const first = withResumePdfSlot(() => new Promise<void>(resolve => { finish = resolve; }));
    const second = withResumePdfSlot(() => new Promise<void>((_, reject) => { fail = reject; }));
    await expect(withResumePdfSlot(async () => 'excess')).rejects.toThrow('busy');
    finish();
    await first;
    await expect(withResumePdfSlot(async () => 'available')).resolves.toBe('available');
    const rejected = expect(second).rejects.toThrow('render failed');
    fail(new Error('render failed'));
    await rejected;
    await expect(withResumePdfSlot(async () => 'recovered')).resolves.toBe('recovered');
  });
});
