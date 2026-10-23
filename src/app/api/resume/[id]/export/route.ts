import { NextRequest, NextResponse } from 'next/server';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { renderResumePdf } from '@/lib/pdf/render-resume-pdf';
import { parsePdfLayout, PdfLayoutError } from '@/lib/pdf/layout';
import { pdfSnapshotRequestSchema } from '@/lib/pdf/snapshot-schema';
import { readPdfSnapshotRequest, PdfRequestError } from '@/lib/pdf/read-snapshot-request';
import { PdfRenderBusyError } from '@/lib/pdf/render-limit';
import { generateHtml } from './builders';
import { generatePlainText } from './plain-text';
import { generateDocxBuffer } from './docx';

// Chromium download + PDF render needs more time on Vercel serverless
export const maxDuration = 60;

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
        const html = await generateHtml(resume, forPrint);
        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.html"`,
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
        const docxBuffer = await generateDocxBuffer(resume);
        return new NextResponse(new Uint8Array(docxBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.docx"`,
          },
        });
      }
      case 'pdf': {
        const layout = parsePdfLayout(request.nextUrl.searchParams);
        const pdfBuffer = await renderResumePdf(resume, layout);
        return new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.pdf"`,
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
    if (error instanceof PdfRenderBusyError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': '2' } });
    }
    if (error instanceof PdfLayoutError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { id } = await params;
    const user = await resolveUser(getUserIdFromRequest(request));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    const stored = await resumeRepository.findById(id);
    if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    if (stored.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

    const result = pdfSnapshotRequestSchema.safeParse(await readPdfSnapshotRequest(request));
    if (!result.success) {
      return NextResponse.json({
        error: 'Invalid PDF snapshot',
        issues: result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      }, { status: 400, headers });
    }
    const { resume: snapshot, layout } = result.data;
    // Identity and metadata come exclusively from the owned database record.
    // No repository writes: even unsaved sections exist only for this render.
    const resume = {
      ...stored, ...snapshot,
      sections: snapshot.sections.map(section => ({
        ...section, resumeId: stored.id, createdAt: stored.createdAt, updatedAt: stored.updatedAt,
      })),
    };
    const pdf = await renderResumePdf(resume, layout, request.signal);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        ...headers, 'Content-Type': 'application/pdf',
        // Clients choose the filename when explicitly downloading snapshot bytes.
        'Content-Disposition': `inline; filename="${encodeURIComponent(snapshot.title || 'resume')}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof PdfRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    if (error instanceof PdfRenderBusyError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { ...headers, 'Retry-After': '2' } });
    }
    if (request.signal.aborted) {
      return NextResponse.json({ error: 'PDF request cancelled' }, { status: 499, headers });
    }
    console.error('POST /api/resume/[id]/export error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PDF rendering failed' }, {
      status: 500, headers,
    });
  }
}
