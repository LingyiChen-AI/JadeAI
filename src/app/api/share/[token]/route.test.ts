import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findByToken: vi.fn(),
  incrementShareViewCount: vi.fn(),
  findById: vi.fn(),
  findByShareToken: vi.fn(),
  incrementResumeViewCount: vi.fn(),
  hashPassword: vi.fn(async (value: string) => `hashed:${value}`),
  resolveTemplateForResume: vi.fn(),
}));

vi.mock('@/lib/db/repositories/share.repository', () => ({
  shareRepository: { findByToken: mocks.findByToken, incrementViewCount: mocks.incrementShareViewCount },
}));
vi.mock('@/lib/db/repositories/resume.repository', () => ({
  resumeRepository: {
    findById: mocks.findById,
    findByShareToken: mocks.findByShareToken,
    incrementViewCount: mocks.incrementResumeViewCount,
  },
}));
vi.mock('@/lib/utils/share', () => ({ hashPassword: mocks.hashPassword }));
vi.mock('@/lib/templates/resolve-template.server', () => ({ resolveTemplateForResume: mocks.resolveTemplateForResume }));

import { GET } from './route';

function request(password?: string) {
  return new NextRequest(`http://localhost/api/share/token-1${password ? `?password=${password}` : ''}`);
}

function resume() {
  const now = new Date(0);
  return {
    id: 'resume-internal', userId: 'user-internal', title: 'Shared', template: 'modern', themeConfig: {},
    isDefault: false, language: 'en', revision: 3, templateVersionId: 'version-internal', templateSource: 'public', templateSnapshot: null,
    sharePassword: null, shareToken: 'legacy-token', viewCount: 5, createdAt: now, updatedAt: now,
    sections: [{ id: 'section-internal', resumeId: 'resume-internal', type: 'summary', title: 'Summary', sortOrder: 0, visible: true, content: { text: 'Share text' }, createdAt: now, updatedAt: now }],
  };
}

const resolved = {
  kind: 'legacy-react', source: 'public', slug: 'modern', version: '1.0.0', degraded: false,
  capabilities: { supportedSections: ['summary'], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: true, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'high-fidelity' },
};

describe('GET /api/share/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByShareToken.mockResolvedValue(null);
    mocks.resolveTemplateForResume.mockResolvedValue(resolved);
  });

  test('resolves and redacts a shared resume after access checks', async () => {
    mocks.findByToken.mockResolvedValue({ id: 'share-1', resumeId: 'resume-internal', isActive: true, password: null });
    mocks.findById.mockResolvedValue(resume());

    const response = await GET(request(), { params: Promise.resolve({ token: 'token-1' }) });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(mocks.resolveTemplateForResume).toHaveBeenCalledOnce();
    expect(body.resolvedTemplate).toMatchObject({ slug: 'modern', version: '1.0.0' });
    expect(serialized).not.toMatch(/user-internal|version-internal|legacy-token|section-internal|revision|viewCount/);
  });

  test('preserves password denial without resolving or disclosing resume data', async () => {
    mocks.findByToken.mockResolvedValue({ id: 'share-1', resumeId: 'resume-internal', isActive: true, password: 'hashed:right' });

    const response = await GET(request('wrong'), { params: Promise.resolve({ token: 'token-1' }) });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid password', passwordRequired: true });
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.resolveTemplateForResume).not.toHaveBeenCalled();
  });
});
