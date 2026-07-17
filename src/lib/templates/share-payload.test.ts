import { describe, expect, test } from 'vitest';

import type { Resume } from '@/types/resume';

import { sanitizeSharedResume } from './share-payload';

describe('sanitizeSharedResume', () => {
  test('redacts user, internal version and provenance fields while keeping safe render data', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const resume = {
      id: 'resume-internal', userId: 'user-internal', title: 'Shared', template: 'modern', themeConfig: {},
      isDefault: false, language: 'en', revision: 9, templateVersionId: 'version-internal', templateSource: 'public', templateSnapshot: null,
      sharePassword: 'password-hash', shareToken: 'token-internal', viewCount: 4, createdAt: now, updatedAt: now,
      sections: [{ id: 'section-internal', resumeId: 'resume-internal', type: 'summary', title: 'Summary', sortOrder: 0, visible: true, content: { text: 'Public text' }, createdAt: now, updatedAt: now }],
    } as unknown as Resume;

    const payload = sanitizeSharedResume(resume, {
      kind: 'legacy-react', source: 'public', slug: 'modern', version: '1.0.0', degraded: false,
      capabilities: { supportedSections: ['summary'], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: true, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'high-fidelity' },
    });
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      title: 'Shared', templateSource: 'public',
      resolvedTemplate: { kind: 'legacy-react', slug: 'modern', version: '1.0.0' },
      sections: [{ type: 'summary', title: 'Summary', content: { text: 'Public text' } }],
    });
    expect(serialized).not.toMatch(/user-internal|resume-internal|version-internal|password-hash|token-internal|section-internal|revision|viewCount|createdAt|updatedAt/);
  });
});
