import { NextRequest, NextResponse } from 'next/server';
import {
  InvalidResumeRevisionError,
  ResumeRevisionConflictError,
  resumeRepository,
} from '@/lib/db/repositories/resume.repository';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import {
  parseClientTemplateBindingChoice,
  toResumeTemplateBindingInput,
} from '@/lib/templates/apply-template-binding.server';
import { ZodError } from 'zod/v4';
import { resolveTemplateForResume } from '@/lib/templates/resolve-template.server';

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

    const resolvedTemplate = await resolveTemplateForResume(resume);
    return NextResponse.json({ ...resume, resolvedTemplate });
  } catch (error) {
    console.error('GET /api/resume/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
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

    const body = await request.json();
    const { expectedRevision, title, template, themeConfig, sections } = body;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json(
        { error: 'expectedRevision must be a non-negative safe integer' },
        { status: 400 },
      );
    }
    if (sections !== undefined && !Array.isArray(sections)) {
      return NextResponse.json({ error: 'sections must be an array' }, { status: 400 });
    }

    const binding = Object.hasOwn(body, 'binding')
      ? toResumeTemplateBindingInput(parseClientTemplateBindingChoice(body.binding))
      : undefined;
    const updated = await resumeRepository.replaceContent(id, expectedRevision, {
      title,
      template,
      themeConfig,
      sections,
      ...(binding ? { binding } : {}),
    });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const resolvedTemplate = await resolveTemplateForResume(updated);
    return NextResponse.json({ ...updated, resolvedTemplate });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid template binding', details: error.issues }, { status: 400 });
    }
    if (error instanceof ResumeRevisionConflictError) {
      return NextResponse.json(
        { error: 'revision_conflict', currentRevision: error.currentRevision },
        { status: 409 },
      );
    }
    if (error instanceof InvalidResumeRevisionError) {
      console.error('PUT /api/resume/[id] invalid stored revision');
      return NextResponse.json({ error: 'Resume revision is invalid' }, { status: 503 });
    }
    console.error('PUT /api/resume/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    await resumeRepository.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/resume/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
