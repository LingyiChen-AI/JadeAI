import { describe, expect, it } from 'vitest';
import { pdfSnapshotRequestSchema } from './snapshot-schema';
import { createPdfSnapshot } from './snapshot';
import { pdfResumeFixture } from './resume-pdf.fixtures';
import type { Resume } from '@/types/resume';

export function snapshotFixture() {
  const resume = pdfResumeFixture();
  const personal = resume.sections[0].content as Record<string, unknown>;
  delete personal.avatar;
  return createPdfSnapshot(resume as unknown as Resume);
}

describe('PDF snapshot contract', () => {
  it('projects only rendering fields and current array order without mutating the editor', () => {
    const resume = pdfResumeFixture() as unknown as Resume;
    resume.sections.reverse();
    const before = structuredClone(resume);
    const snapshot = createPdfSnapshot(resume);
    expect(snapshot).not.toHaveProperty('userId');
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot.sections[0]).not.toHaveProperty('resumeId');
    expect(snapshot.sections.map(s => s.sortOrder)).toEqual([0, 1, 2, 3]);
    snapshot.sections[0].title = 'Changed';
    expect(resume).toEqual(before);
  });

  it('decodes legacy serialized theme defaults before creating the request', () => {
    const resume = { ...pdfResumeFixture(), themeConfig: '{"accentColor":"#123456"}' } as unknown as Resume;
    expect(createPdfSnapshot(resume).themeConfig).toEqual({ accentColor: '#123456' });
    expect(createPdfSnapshot({ ...resume, themeConfig: '{}' }).themeConfig).toEqual({});
    expect(() => createPdfSnapshot({ ...resume, themeConfig: 'invalid' })).toThrow('Invalid resume theme JSON');
  });

  it('defaults to A4 and normalizes legacy newline lists in a copied snapshot', () => {
    const resume = snapshotFixture();
    resume.sections[1].content = { categories: [{ id: 'skills', name: 'Tools', skills: 'TypeScript\nSQL' }] } as never;
    const before = structuredClone(resume);
    const result = pdfSnapshotRequestSchema.parse({ format: 'pdf', resume });
    expect(result.layout).toBe('a4');
    expect(result.resume.sections[1].content).toMatchObject({ categories: [{ skills: ['TypeScript', 'SQL'] }] });
    expect(resume).toEqual(before);
  });

  it('sorts by explicit section order', () => {
    const resume = snapshotFixture();
    resume.sections.reverse();
    const result = pdfSnapshotRequestSchema.parse({ format: 'pdf', resume });
    expect(result.resume.sections.map(s => s.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it.each(['Promise<T>', 'List<String>', 'Map<String, Object>', '<script>alert(1)</script>'])('accepts %s as literal text', value => {
    const resume = snapshotFixture();
    resume.title = value;
    resume.sections[2].content = { text: `技术描述：${value}` };
    const result = pdfSnapshotRequestSchema.parse({ format: 'pdf', resume });
    expect(result.resume.title).toBe(value);
    expect(result.resume.sections[2].content).toEqual({ text: `技术描述：${value}` });
  });

  it.each([
    ['unknown template', (r: ReturnType<typeof snapshotFixture>) => { r.template = 'unknown'; }],
    ['unknown language', r => { r.language = 'xx'; }],
    ['injected identity', r => { Object.assign(r, { userId: 'another-user' }); }],
    ['arbitrary HTML', r => { Object.assign(r, { html: '<div>Hello</div>' }); }],
    ['null character', r => { r.sections[2].content = { text: 'Invalid\u0000text' }; }],
    ['oversized text', r => { r.sections[2].content = { text: 'a'.repeat(30_001) }; }],
    ['CSS injection', r => { r.themeConfig = { primaryColor: 'red; } body { display:none' }; }],
    ['font injection', r => { r.themeConfig = { fontFamily: 'Inter; background:url(http://localhost)' }; }],
    ['invalid spacing', r => { r.themeConfig = { lineSpacing: 999 }; }],
    ['invalid margin', r => { r.themeConfig = { margin: { top: -1, right: 0, bottom: 0, left: 0 } }; }],
    ['unknown section', r => { r.sections[0].type = 'html'; }],
    ['wrong content shape', r => { r.sections[2].content = { items: [] } as never; }],
    ['unknown nested field', r => { Object.assign(r.sections[0].content, { html: '<div/>' }); }],
    ['duplicate ID', r => { r.sections[1].id = r.sections[0].id; }],
    ['duplicate order', r => { r.sections[1].sortOrder = 0; }],
    ['too many sections', r => { r.sections = Array(51).fill(r.sections[0]); }],
    ['non-text array', r => { r.sections[1].content = { categories: [{ skills: [1] }] } as never; }],
    ['external avatar', r => { Object.assign(r.sections[0].content, { avatar: 'http://127.0.0.1:3000/private' }); }],
    ['SVG avatar', r => { Object.assign(r.sections[0].content, { avatar: 'data:image/svg+xml;base64,PHN2Zy8+' }); }],
    ['script URL', r => { Object.assign(r.sections[0].content, { website: 'javascript:alert(1)' }); }],
    ['precomputed QR HTML', r => { Object.assign(r.sections[3].content, { _qrSvgs: { qr: '<svg/>' } }); }],
  ] satisfies [string, (resume: ReturnType<typeof snapshotFixture>) => void][])('rejects %s', (_label, change) => {
    const resume = snapshotFixture();
    change(resume);
    expect(pdfSnapshotRequestSchema.safeParse({ format: 'pdf', resume }).success).toBe(false);
  });

  it('accepts embedded raster avatars and every registered section shape', () => {
    const resume = snapshotFixture();
    Object.assign(resume.sections[0].content, { avatar: 'data:image/png;base64,aGVsbG8=' });
    for (const type of ['work_experience', 'education', 'projects', 'certifications', 'languages', 'github', 'custom']) {
      resume.sections.push({ id: type, type, title: type, sortOrder: resume.sections.length, visible: true, content: { items: [] } });
    }
    expect(pdfSnapshotRequestSchema.safeParse({ format: 'pdf', layout: 'continuous', resume }).success).toBe(true);
  });
});
