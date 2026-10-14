import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pdfResumeFixture } from './resume-pdf.fixtures';
import { renderResumePdf } from './render-resume-pdf';
import { generatePdf } from './generate-pdf';
import { generateHtml } from '@/app/api/resume/[id]/export/builders';
import { TEMPLATES } from '@/lib/constants';

vi.mock('./generate-pdf', () => ({ generatePdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-fixture')) }));

describe('renderResumePdf', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['a4', 'fit-one-page', 'continuous'] as const)('renders %s without mutating QR data', async layout => {
    const resume = pdfResumeFixture('two-column');
    const before = structuredClone(resume);
    await renderResumePdf(resume, layout);
    expect(resume).toEqual(before);
    const [html, options] = vi.mocked(generatePdf).mock.calls[0];
    expect(options).toEqual({ layout });
    expect(html).toContain('<svg');
    expect(html).toContain('BOTTOM_QR_SENTINEL');
    if (layout === 'continuous') {
      expect(html).toContain('width: 210mm !important');
      expect(html).not.toContain('/* Smart pagination');
      expect(html).not.toContain('padding-top: 5mm');
    } else {
      expect(html).toContain('/* Smart pagination');
    }
  });

  it('normalizes malformed legacy arrays before rendering', async () => {
    const resume = pdfResumeFixture();
    resume.sections.push({ ...resume.sections[2], type: 'work_experience', content: {
      items: [{ position: 'Engineer', technologies: 'TypeScript\nSQL', highlights: '- First\n- Second' }],
    } });
    const before = structuredClone(resume);
    await renderResumePdf(resume);
    expect(resume).toEqual(before);
    expect(vi.mocked(generatePdf).mock.calls[0][0]).toContain('TypeScript, SQL');
  });

  it.each(TEMPLATES)('%s escapes technical text and literal markup', async template => {
    const resume = pdfResumeFixture(template);
    const literal = 'Literal Promise<T> & List<String> <script>alert(1)</script> <img src=x onerror=alert(1)>';
    resume.title = literal;
    resume.sections[0].content = { fullName: literal };
    resume.sections[2].title = literal;
    resume.sections[2].content = { text: literal };
    const html = await generateHtml(resume, 'a4');
    expect(html).toContain('Promise&lt;T&gt;');
    expect(html).toContain('List&lt;String&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
  });
});
