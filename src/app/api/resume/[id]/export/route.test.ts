import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  resolveUser: vi.fn(),
  resolveTemplateForResume: vi.fn(),
  generateHtml: vi.fn(),
  generatePlainText: vi.fn(),
  generateDocxBuffer: vi.fn(),
  generatePdf: vi.fn(),
}));

vi.mock('@/lib/db/repositories/resume.repository', () => ({ resumeRepository: { findById: mocks.findById } }));
vi.mock('@/lib/auth/helpers', () => ({ resolveUser: mocks.resolveUser, getUserIdFromRequest: vi.fn(() => 'fingerprint') }));
vi.mock('@/lib/templates/resolve-template.server', () => ({ resolveTemplateForResume: mocks.resolveTemplateForResume }));
vi.mock('@/lib/pdf/generate-pdf', () => ({ generatePdf: mocks.generatePdf }));
vi.mock('./builders', () => ({ generateHtml: mocks.generateHtml }));
vi.mock('./plain-text', () => ({ generatePlainText: mocks.generatePlainText }));
vi.mock('./docx', () => ({ generateDocxBuffer: mocks.generateDocxBuffer }));

import { GET } from './route';
import { DocxFontEmbeddingError } from '@/lib/export/docx-fonts';

const resume = { id: 'resume-1', userId: 'user-1', title: 'Resume', template: 'modern', sections: [] };
const resolved = {
  kind: 'legacy-react', source: 'public', slug: 'modern', version: '1.0.0', degraded: false,
  capabilities: { docxFidelity: 'high-fidelity' },
};

function request(format: string) {
  return new NextRequest(`http://localhost/api/resume/resume-1/export?format=${format}`);
}

describe('GET /api/resume/[id]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveUser.mockResolvedValue({ id: 'user-1' });
    mocks.findById.mockResolvedValue(resume);
    mocks.resolveTemplateForResume.mockResolvedValue(resolved);
    mocks.generateHtml.mockResolvedValue('<html>resolved</html>');
    mocks.generatePlainText.mockReturnValue('plain');
    mocks.generateDocxBuffer.mockResolvedValue(Buffer.from('docx'));
  });

  test('routes HTML through the shared saved-binding resolution', async () => {
    const response = await GET(request('html'), { params: Promise.resolve({ id: 'resume-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.resolveTemplateForResume).toHaveBeenCalledWith(resume);
    expect(mocks.generateHtml).toHaveBeenCalledWith(resume, false, resolved);
  });

  test('marks fail-closed template degradation on export responses', async () => {
    mocks.resolveTemplateForResume.mockResolvedValue({
      ...resolved,
      source: 'classic',
      slug: 'classic',
      degraded: true,
      reason: 'public_version_invalid',
    });

    const response = await GET(request('html'), { params: Promise.resolve({ id: 'resume-1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-jadeai-template-degraded')).toBe('true');
    expect(response.headers.get('x-jadeai-template-warning')).toBe('public_version_invalid');
  });

  test('enforces declarative manifest maxPages for PDF and returns a stable 422 on overflow', async () => {
    mocks.resolveTemplateForResume.mockResolvedValue({
      ...resolved,
      kind: 'declarative-v1',
      source: 'public',
      manifest: { features: { maxPages: 3 } },
    });
    mocks.generatePdf.mockResolvedValueOnce(Buffer.from('pdf'));

    const response = await GET(request('pdf'), { params: Promise.resolve({ id: 'resume-1' }) });
    expect(response.status).toBe(200);
    expect(mocks.generatePdf).toHaveBeenCalledWith('<html>resolved</html>', {
      fitOnePage: false,
      maxPages: 3,
    });

    mocks.generatePdf.mockRejectedValueOnce(Object.assign(new Error('template_pdf_page_limit_exceeded'), {
      code: 'TEMPLATE_RENDER_LIMIT', pageCount: 4, maxPages: 3,
    }));
    const overflow = await GET(request('pdf'), { params: Promise.resolve({ id: 'resume-1' }) });
    expect(overflow.status).toBe(422);
    expect(await overflow.json()).toEqual({
      error: 'template_pdf_page_limit_exceeded',
      code: 'TEMPLATE_RENDER_LIMIT',
      pageCount: 4,
      maxPages: 3,
    });
  });

  test('keeps TXT template-independent without loading a renderer', async () => {
    const response = await GET(request('txt'), { params: Promise.resolve({ id: 'resume-1' }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('plain');
    expect(mocks.resolveTemplateForResume).not.toHaveBeenCalled();
    expect(mocks.generateHtml).not.toHaveBeenCalled();
  });

  test('reports high-fidelity legacy DOCX and uses the selected mapper', async () => {
    const response = await GET(request('docx'), { params: Promise.resolve({ id: 'resume-1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-jadeai-docx-fidelity')).toBe('high-fidelity');
    expect(response.headers.get('x-jadeai-export-warning')).toBeNull();
    expect(mocks.generateDocxBuffer).toHaveBeenCalledWith(resume);
  });

  test('returns a stable safe error when DOCX font embedding fails', async () => {
    mocks.generateDocxBuffer.mockRejectedValueOnce(
      new DocxFontEmbeddingError(new Error('secret font parser diagnostics')),
    );

    const response = await GET(request('docx'), { params: Promise.resolve({ id: 'resume-1' }) });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'DOCX font embedding failed',
      code: 'docx_font_embedding_failed',
    });
  });

  test('labels generic DOCX fallback and rejects unsupported capability honestly', async () => {
    mocks.resolveTemplateForResume.mockResolvedValueOnce({
      ...resolved,
      kind: 'declarative-v1',
      source: 'local-snapshot',
      manifest: {},
      capabilities: { docxFidelity: 'generic' },
    });
    const generic = await GET(request('docx'), { params: Promise.resolve({ id: 'resume-1' }) });
    expect(generic.status).toBe(200);
    expect(generic.headers.get('x-jadeai-docx-fidelity')).toBe('generic');
    expect(generic.headers.get('x-jadeai-export-warning')).toBe('generic_docx_style_fallback');
    expect(mocks.generateDocxBuffer).toHaveBeenLastCalledWith({ ...resume, template: 'classic' });

    vi.clearAllMocks();
    mocks.resolveUser.mockResolvedValue({ id: 'user-1' });
    mocks.findById.mockResolvedValue(resume);
    mocks.resolveTemplateForResume.mockResolvedValue({ ...resolved, capabilities: { docxFidelity: 'unsupported' } });
    const unsupported = await GET(request('docx'), { params: Promise.resolve({ id: 'resume-1' }) });
    expect(unsupported.status).toBe(422);
    expect(await unsupported.json()).toMatchObject({ code: 'template_docx_unsupported' });
    expect(mocks.generateDocxBuffer).not.toHaveBeenCalled();
  });
});
