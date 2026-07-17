import { describe, expect, test } from 'vitest';

import * as repositoryModule from './template.repository';

describe('template seed stable-version promotion', () => {
  test('requires explicit authorization before changing an existing stable version', () => {
    const plan = (repositoryModule as unknown as {
      planStableVersionUpdate?: (current: string | null, target: string, allowPromotion: boolean) => 'initialize' | 'keep' | 'promote';
    }).planStableVersionUpdate;

    expect(plan).toBeTypeOf('function');
    expect(plan!(null, 'template@1.0.0', false)).toBe('initialize');
    expect(plan!('template@1.0.0', 'template@1.0.0', false)).toBe('keep');
    expect(() => plan!('template@1.0.0', 'template@1.0.1', false)).toThrow('template_seed_stable_version_conflict');
    expect(plan!('template@1.0.0', 'template@1.0.1', true)).toBe('promote');
  });
});
