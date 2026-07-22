// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDocument } from '@/lib/templates/template-document';
import { EditableResumeProvider } from './editable-resume-context';
import { DeclarativeTemplateDocument } from './declarative-template-document';

afterEach(cleanup);

function document(): TemplateDocument {
  return {
    kind: 'template-document-v1', title: 'Resume', language: 'en',
    page: { sizes: ['a4'], marginMm: 12, maxPages: 4, showPageNumbers: false },
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 30, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 11, lineHeight: 1.4, headingScale: 1.2 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sections: [{
      type: 'summary', title: 'Summary', placement: 'main', order: 0,
      headingVariant: 'default', styleVariants: {},
      titleSource: { sectionId: 'summary-1', fieldPath: ['title'], kind: 'text', label: 'Summary title' },
      blocks: [{
        kind: 'paragraph', links: [], images: [],
        textRuns: [{
          text: '**Reliable** systems', html: '<strong>Reliable</strong> systems', tone: 'default',
          source: { sectionId: 'summary-1', fieldPath: ['text'], kind: 'rich-text', label: 'text' },
        }],
      }],
    }],
  };
}

describe('declarative template document editing', () => {
  it('edits a sourced text run using its raw Markdown value', () => {
    const updateField = vi.fn();
    render(
      <EditableResumeProvider value={{ enabled: true, updateField }}>
        <DeclarativeTemplateDocument document={document()} />
      </EditableResumeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'text' }));
    const textarea = screen.getByRole('textbox', { name: 'text' });
    expect((textarea as HTMLTextAreaElement).value).toBe('**Reliable** systems');
    fireEvent.change(textarea, { target: { value: '**Updated** systems' } });
    fireEvent.blur(textarea);

    expect(updateField).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'summary-1', fieldPath: ['text'] }),
      '**Updated** systems',
    );
  });
});
