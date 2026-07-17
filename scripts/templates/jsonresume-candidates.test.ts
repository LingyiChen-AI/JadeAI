import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

type Candidate = {
  slug: string;
  batch: 'foundation-ats' | 'professional-industry' | 'creative-international';
  packageName: string;
  packageVersion: string;
  sourceUrl: string;
  preliminaryLicense: 'MIT' | 'ISC' | 'BSD-2-Clause' | 'BSD-3-Clause' | 'Apache-2.0';
  selectionReason: string;
};

const inventoryPath = path.resolve('scripts/templates/jsonresume-50-candidates.json');

describe('JSON Resume 50-theme candidate inventory', () => {
  it('freezes exactly 50 unique, licensed candidates in the approved batches', async () => {
    const candidates = JSON.parse(await readFile(inventoryPath, 'utf8')) as Candidate[];

    expect(candidates).toHaveLength(50);
    expect(new Set(candidates.map((candidate) => candidate.slug)).size).toBe(50);
    expect(new Set(candidates.map((candidate) => candidate.packageName)).size).toBe(50);
    expect(candidates.filter((candidate) => candidate.batch === 'foundation-ats')).toHaveLength(18);
    expect(candidates.filter((candidate) => candidate.batch === 'professional-industry')).toHaveLength(17);
    expect(candidates.filter((candidate) => candidate.batch === 'creative-international')).toHaveLength(15);

    for (const candidate of candidates) {
      expect(candidate.slug).toMatch(/^jsonresume-[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(candidate.packageName).toMatch(/^(?:@jsonresume\/)?jsonresume-theme-[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(candidate.packageVersion).toMatch(/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i);
      expect(candidate.sourceUrl).toMatch(/^https:\/\//);
      expect(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0']).toContain(candidate.preliminaryLicense);
      expect(candidate.selectionReason.trim().length).toBeGreaterThanOrEqual(12);
    }

    expect(candidates.map((candidate) => candidate.slug)).not.toContain('jsonresume-even');
    expect(candidates.map((candidate) => candidate.slug)).not.toContain('jsonresume-onepage');
  });
});
