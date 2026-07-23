import { NextRequest, NextResponse } from 'next/server';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { generatePdf } from '@/lib/pdf/generate-pdf';
import { generateHtml } from './builders';
import { generatePlainText } from './plain-text';
import { generateDocxBuffer } from './docx';
import { resolveTemplateForResume } from '@/lib/templates/resolve-template.server';
import { getDocxExportDecision } from '@/lib/templates/export-contract';
import { DocxFontEmbeddingError } from '@/lib/export/docx-fonts';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';

// Chromium download + PDF render needs more time on Vercel serverless
export const maxDuration = 60;

function templateResolutionHeaders(resolvedTemplate: ResolvedTemplate): Record<string, string> {
  return resolvedTemplate.degraded
    ? {
        'X-JadeAI-Template-Degraded': 'true',
        ...(resolvedTemplate.reason ? { 'X-JadeAI-Template-Warning': resolvedTemplate.reason } : {}),
      }
    : {};
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resume = await resumeRepository.findById(id);
    if (!resume) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (resume.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const format = request.nextUrl.searchParams.get('format') || 'json';
    const title = resume.title || 'resume';
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${title}-${ts}`;

    switch (format) {
      case 'json': {
        return NextResponse.json(resume);
      }
      case 'html': {
        // forPrint=true returns the print-optimized layout (used by the client-side
        // "print to PDF" fallback when server Chromium is unavailable, issue #85).
        const forPrint = request.nextUrl.searchParams.get('forPrint') === 'true';
        const resolvedTemplate = await resolveTemplateForResume(resume);
        const html = await generateHtml(resume, forPrint, resolvedTemplate);
        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.html"`,
            ...templateResolutionHeaders(resolvedTemplate),
          },
        });
      }
      case 'txt': {
        const text = generatePlainText(resume);
        return new NextResponse(text, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.txt"`,
          },
        });
      }
      case 'docx': {
        const resolvedTemplate = await resolveTemplateForResume(resume);
        const hasHighFidelityMapper = resolvedTemplate.kind === 'legacy-react';
        const decision = getDocxExportDecision(resolvedTemplate.capabilities.docxFidelity, hasHighFidelityMapper);
        if (decision.mode === 'unsupported') {
          return NextResponse.json(
            { error: 'DOCX export is not supported for this template', code: decision.warning },
            { status: 422 },
          );
        }
        const docxResume = decision.mode === 'generic'
          ? { ...resume, template: 'classic' }
          : resume;
        const docxBuffer = await generateDocxBuffer(docxResume);
        return new NextResponse(new Uint8Array(docxBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.docx"`,
            'X-JadeAI-DOCX-Fidelity': decision.mode,
            ...(decision.warning ? { 'X-JadeAI-Export-Warning': decision.warning } : {}),
            ...templateResolutionHeaders(resolvedTemplate),
          },
        });
      }
      case 'pdf': {
        const fitOnePage = request.nextUrl.searchParams.get('fitOnePage') === 'true';
        const resolvedTemplate = await resolveTemplateForResume(resume);
        const pdfHtml = await generateHtml(resume, true, resolvedTemplate);
        const maxPages = resolvedTemplate.kind === 'declarative-v1' || resolvedTemplate.kind === 'declarative-v2'
          ? resolvedTemplate.manifest.features.maxPages
          : undefined;
        const pdfBuffer = await generatePdf(pdfHtml, { fitOnePage, ...(maxPages ? { maxPages } : {}) });
        return new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.pdf"`,
            ...templateResolutionHeaders(resolvedTemplate),
          },
        });
      }
      default: {
        return NextResponse.json(
          { error: `Unsupported format: ${format}. Supported: json, html, txt, docx, pdf` },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    if (error instanceof DocxFontEmbeddingError) {
      console.error('GET /api/resume/[id]/export DOCX font embedding error:', error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }
    const renderLimit = error as Partial<{ code: string; pageCount: number; maxPages: number }>;
    if (renderLimit.code === 'TEMPLATE_RENDER_LIMIT') {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'template_pdf_page_limit_exceeded',
        code: 'TEMPLATE_RENDER_LIMIT',
        pageCount: renderLimit.pageCount,
        maxPages: renderLimit.maxPages,
      }, { status: 422 });
    }
    console.error('GET /api/resume/[id]/export error:', error);
    // Surface the real reason (e.g. "No Chrome/Chromium found ...") so PDF export
    // failures are diagnosable instead of a generic 500 (issue #85).
    const detail = error instanceof Error && error.message ? error.message : '';
    return NextResponse.json(
      { error: detail || 'Internal server error' },
      { status: 500 }
    );
  }
}
