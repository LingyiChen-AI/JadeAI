import { describe, expect, it } from 'vitest';
import {
  buildExportUrl,
  fallbackExportFilename,
  filenameFromContentDisposition,
  type ExportFormat,
} from './export-client';

describe('export client contract', () => {
  it.each<[ExportFormat, string]>([
    ['pdf', '/api/resume/r1/export?format=pdf'],
    ['pdf-one-page', '/api/resume/r1/export?format=pdf&fitOnePage=true'],
    ['docx', '/api/resume/r1/export?format=docx'],
    ['html', '/api/resume/r1/export?format=html'],
    ['txt', '/api/resume/r1/export?format=txt'],
    ['json', '/api/resume/r1/export?format=json'],
  ])('preserves the existing %s endpoint query', (format, expected) => {
    expect(buildExportUrl('r1', format)).toBe(expected);
  });

  it('optionally pins export to the saved revision without changing legacy callers', () => {
    expect(buildExportUrl('r 1', 'pdf', 7)).toBe('/api/resume/r%201/export?format=pdf&expectedRevision=7');
    expect(buildExportUrl('r1', 'pdf-one-page', 8)).toBe('/api/resume/r1/export?format=pdf&fitOnePage=true&expectedRevision=8');
    expect(buildExportUrl('r1', 'json')).toBe('/api/resume/r1/export?format=json');
  });

  it('prefers a UTF-8 RFC 5987 response filename', () => {
    expect(filenameFromContentDisposition(
      "attachment; filename=resume.pdf; filename*=UTF-8''%E7%AE%80%E5%8E%86-20260722.pdf",
    )).toBe('简历-20260722.pdf');
  });

  it('decodes the quoted filename used by the current API', () => {
    expect(filenameFromContentDisposition('attachment; filename="%E7%AE%80%E5%8E%86-1.docx"'))
      .toBe('简历-1.docx');
  });

  it('uses the existing title and timestamp convention as a safe fallback', () => {
    const now = new Date(2026, 6, 22, 9, 8, 7);
    expect(fallbackExportFilename('My/Resume', 'pdf-one-page', now)).toBe('My_Resume-20260722090807.pdf');
  });
});
