import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as mupdf from 'mupdf';
import { createPdfSnapshot } from './snapshot';
import { pdfResumeFixture } from './resume-pdf.fixtures';
import type { Resume } from '@/types/resume';
import type { PdfLayout } from './layout';

// Exercise real fingerprint ownership, SQLite and Chromium. OAuth is not used here.
vi.mock('@/lib/auth/config', () => ({ auth: () => { throw new Error('OAuth is disabled in this fixture'); } }));
// Avoid external font networking; the real browser smoke check covers web fonts.
vi.mock('@/app/api/resume/[id]/export/builders', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/api/resume/[id]/export/builders')>();
  return { ...actual, generateHtml: async (...args: Parameters<typeof actual.generateHtml>) =>
    (await actual.generateHtml(...args)).replace(/<link\b[^>]*>/g, '') };
});

describe.skipIf(process.env.RUN_PDF_INTEGRATION !== '1')('real snapshot PDF exports leave SQLite unchanged', () => {
  let post: typeof import('@/app/api/resume/[id]/export/route').POST;
  let repository: typeof import('@/lib/db/repositories/resume.repository').resumeRepository;
  let adapter: typeof import('@/lib/db').adapter;
  let stored: NonNullable<Awaited<ReturnType<typeof repository.findById>>>;
  const fingerprint = 'snapshot-integration-owner';

  beforeAll(async () => {
    const directory = mkdtempSync(join(tmpdir(), 'jade-pdf-snapshot-'));
    vi.stubEnv('DB_TYPE', 'sqlite');
    vi.stubEnv('SQLITE_PATH', join(directory, 'jade.db'));
    vi.stubEnv('AUTH_ENABLED', 'false');
    vi.stubEnv('JADE_RUNTIME', 'web');
    vi.stubEnv('VERCEL', undefined);
    const database = await import('@/lib/db');
    adapter = database.adapter;
    await database.dbReady;
    const { userRepository } = await import('@/lib/db/repositories/user.repository');
    const user = await userRepository.upsertByFingerprint(fingerprint);
    repository = (await import('@/lib/db/repositories/resume.repository')).resumeRepository;
    const resume = (await repository.create({ userId: user!.id, title: 'SAVED_DATABASE_TITLE', template: 'classic' }))!;
    const fixture = pdfResumeFixture();
    for (const section of fixture.sections) {
      if (section.type === 'personal_info') delete (section.content as Record<string, unknown>).avatar;
      await repository.createSection({ ...section, id: crypto.randomUUID(), resumeId: resume.id });
    }
    stored = (await repository.findById(resume.id))!;
    post = (await import('@/app/api/resume/[id]/export/route')).POST;
  }, 30_000);

  afterAll(async () => { await adapter?.close(); vi.unstubAllEnvs(); });

  it.each(['a4', 'fit-one-page', 'continuous'] as const)('exports unsaved %s text and theme without changing any resume rows', async (layout: PdfLayout) => {
    const snapshot = createPdfSnapshot(stored as unknown as Resume);
    snapshot.title = 'UNSAVED_SNAPSHOT_TITLE';
    snapshot.template = 'neon';
    snapshot.themeConfig = { accentColor: '#123456' };
    snapshot.sections[2].content = { text: 'UNSAVED_SNAPSHOT_TEXT\nLAST_UNSAVED_LINE' };
    const response = await post(new NextRequest(`http://localhost/api/resume/${stored.id}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fingerprint': fingerprint },
      body: JSON.stringify({ format: 'pdf', layout, resume: snapshot }),
    }), { params: Promise.resolve({ id: stored.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const buffer = Buffer.from(await response.arrayBuffer());
    const document = mupdf.Document.openDocument(buffer, 'application/pdf');
    try {
      expect(document.countPages()).toBe(1);
      const page = document.loadPage(0);
      const structured = page.toStructuredText();
      expect(structured.asText()).toContain('UNSAVED_SNAPSHOT_TEXT');
      expect(structured.asText()).toContain('LAST_UNSAVED_LINE');
      if (process.env.PDF_TEST_OUTPUT_DIR) {
        mkdirSync(process.env.PDF_TEST_OUTPUT_DIR, { recursive: true });
        writeFileSync(join(process.env.PDF_TEST_OUTPUT_DIR, `unsaved-snapshot-${layout}.pdf`), buffer);
        const pixmap = page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false);
        writeFileSync(join(process.env.PDF_TEST_OUTPUT_DIR, `unsaved-snapshot-${layout}.png`), pixmap.asPNG());
        pixmap.destroy();
      }
      structured.destroy();
      page.destroy();
    } finally { document.destroy(); }
    expect(await repository.findById(stored.id)).toEqual(stored);
  }, 60_000);
});
