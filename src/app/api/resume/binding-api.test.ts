import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveUser: vi.fn(),
  getUserIdFromRequest: vi.fn(() => 'fingerprint-a'),
  resolveTemplateForResume: vi.fn(),
  repository: {
    findAllByUserId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    createSection: vi.fn(),
    replaceContent: vi.fn(),
  },
}));

vi.mock('@/lib/auth/helpers', () => ({
  resolveUser: mocks.resolveUser,
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));
vi.mock('@/lib/db/repositories/resume.repository', () => ({
  resumeRepository: mocks.repository,
  ResumeRevisionConflictError: class ResumeRevisionConflictError extends Error {},
  InvalidResumeRevisionError: class InvalidResumeRevisionError extends Error {},
}));
vi.mock('@/lib/templates/resolve-template.server', () => ({
  resolveTemplateForResume: mocks.resolveTemplateForResume,
}));

import { POST as createResume } from './route';
import { PUT as updateResume } from './[id]/route';
import { hashManifest } from '@/lib/templates/normalize-manifest';

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'resume-a' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUser.mockResolvedValue({ id: 'user-a' });
  mocks.resolveTemplateForResume.mockResolvedValue({ kind: 'legacy-react', source: 'classic', slug: 'classic' });
  mocks.repository.create.mockResolvedValue({ id: 'resume-a', userId: 'user-a', sections: [] });
  mocks.repository.findById.mockResolvedValue({
    id: 'resume-a',
    userId: 'user-a',
    revision: 2,
    sections: [],
  });
  mocks.repository.replaceContent.mockResolvedValue({
    id: 'resume-a',
    userId: 'user-a',
    revision: 3,
    sections: [],
  });
});

describe('Resume binding API', () => {
  test('creates a Resume with the strict public choice and sections in one repository call', async () => {
    const sections = [{
      id: 'untrusted-client-id',
      type: 'summary',
      title: 'Summary',
      sortOrder: 0,
      visible: true,
      content: { text: 'Keep me' },
    }];
    const response = await createResume(request('/api/resume', {
      title: 'Public',
      binding: { kind: 'public', templateSlug: 'classic', version: '1.0.0' },
      sections,
    }) as never);

    expect(response.status).toBe(201);
    expect(mocks.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      title: 'Public',
      binding: { kind: 'public', templateSlug: 'classic', version: '1.0.0' },
      sections,
    }));
    expect(mocks.repository.createSection).not.toHaveBeenCalled();
  });

  test('rejects forged public internals before repository access', async () => {
    const response = await createResume(request('/api/resume', {
      binding: {
        kind: 'public',
        templateSlug: 'classic',
        version: '1.0.0',
        versionId: 'internal-version',
        manifestHash: 'f'.repeat(64),
      },
    }) as never);

    expect(response.status).toBe(400);
    expect(mocks.repository.create).not.toHaveBeenCalled();
  });

  test('derives the local snapshot on the server and rejects browser local IDs', async () => {
    const manifest = {
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
      typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
      colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
      spacing: { pageMarginMm: 12, sectionGapMm: 6 },
      sectionSlots: [{ sectionType: 'personal_info', placement: 'main', order: 0 }],
      sectionStyles: [],
      features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
    };
    const response = await createResume(request('/api/resume', {
      binding: { kind: 'local-snapshot', manifest },
    }) as never);
    expect(response.status).toBe(201);
    expect(mocks.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      binding: {
        kind: 'local-snapshot',
        snapshot: expect.objectContaining({
          manifest,
          manifestHash: hashManifest(manifest),
          capabilities: expect.objectContaining({ supportsAvatar: true, supportsHtml: true }),
        }),
      },
    }));

    vi.clearAllMocks();
    mocks.resolveUser.mockResolvedValue({ id: 'user-a' });
    const refused = await createResume(request('/api/resume', {
      binding: { kind: 'local-snapshot', localId: 'browser-only', manifest },
    }) as never);
    expect(refused.status).toBe(400);
    expect(mocks.repository.create).not.toHaveBeenCalled();
  });

  test('updates binding under the supplied revision and omission stays omitted', async () => {
    const chosen = await updateResume(request('/api/resume/resume-a', {
      expectedRevision: 2,
      binding: { kind: 'legacy', templateSlug: 'modern' },
    }) as never, context);
    expect(chosen.status).toBe(200);
    expect(mocks.repository.replaceContent).toHaveBeenLastCalledWith('resume-a', 2, {
      title: undefined,
      template: undefined,
      themeConfig: undefined,
      sections: undefined,
      binding: { kind: 'legacy', templateSlug: 'modern' },
    });

    await updateResume(request('/api/resume/resume-a', {
      expectedRevision: 2,
      title: 'Renamed',
    }) as never, context);
    expect(mocks.repository.replaceContent).toHaveBeenLastCalledWith('resume-a', 2, {
      title: 'Renamed',
      template: undefined,
      themeConfig: undefined,
      sections: undefined,
    });
  });
});
