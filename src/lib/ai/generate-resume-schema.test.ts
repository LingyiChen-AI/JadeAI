import { describe, expect, test } from 'vitest';

import { generateResumeInputSchema } from './generate-resume-schema';

describe('generateResumeInputSchema template binding', () => {
  test('accepts a public client choice', () => {
    expect(generateResumeInputSchema.parse({
      jobTitle: 'Engineer',
      binding: { kind: 'public', templateSlug: 'classic', version: '1.0.0' },
    }).binding).toEqual({ kind: 'public', templateSlug: 'classic', version: '1.0.0' });
  });

  test('rejects trusted public internals supplied by a client', () => {
    expect(generateResumeInputSchema.safeParse({
      jobTitle: 'Engineer',
      binding: {
        kind: 'public',
        templateSlug: 'classic',
        version: '1.0.0',
        versionId: 'forged',
      },
    }).success).toBe(false);
  });
});
