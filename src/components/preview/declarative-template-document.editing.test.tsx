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
    page: {
      sizes: ['a4'],
      marginMm: { top: 12, right: 12, bottom: 12, left: 12 },
      maxPages: 4,
      showPageNumbers: false,
    },
    headingColor: '#111111',
    fontFamily: 'noto-sans-sc',
    avatarStyle: 'oneInch',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 30, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 11, lineHeight: 1.4, headingScale: 1.2 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sections: [{
      type: 'summary', title: 'Summary', placement: 'main', order: 0,
      headingVariant: 'default', styleVariants: {},
      titleSource: { sectionId: 'summary-1', fieldPath: ['title'], kind: 'text', label: 'Summary title' },
      blocks: [{
        kind: 'paragraph', images: [],
        links: [{
          label: 'https://example.com', href: 'https://example.com',
          source: { sectionId: 'summary-1', fieldPath: ['website'], kind: 'url', label: 'website' },
        }],
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

  it('edits a sourced link and exposes an editor-only empty insertion point', () => {
    const updateField = vi.fn();
    const editableDocument = document();
    editableDocument.sections[0].blocks[0].textRuns.push({
      text: '', tone: 'default',
      source: { sectionId: 'summary-1', fieldPath: ['optional'], kind: 'text', label: 'optional' },
    });
    render(
      <EditableResumeProvider value={{ enabled: true, updateField, emptyLabel: 'Add field' }}>
        <DeclarativeTemplateDocument document={editableDocument} />
      </EditableResumeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'website' }));
    const linkInput = screen.getByRole('textbox', { name: 'website' });
    fireEvent.change(linkInput, { target: { value: 'https://jade.example' } });
    fireEvent.keyDown(linkInput, { key: 'Enter' });

    expect(updateField).toHaveBeenCalledWith(
      expect.objectContaining({ fieldPath: ['website'], kind: 'url' }),
      'https://jade.example',
    );
    expect(screen.getByRole('button', { name: 'optional: Add field' })).toBeTruthy();
  });

  it('offers separate inline label and URL sources for declarative QR blocks', () => {
    const updateField = vi.fn();
    const qrDocument = document();
    qrDocument.sections[0].type = 'qr_codes';
    qrDocument.sections[0].blocks = [{
      kind: 'qr',
      images: [],
      textRuns: [{
        text: 'Portfolio', tone: 'default',
        source: { sectionId: 'qr-1', itemId: 'item-1', fieldPath: ['label'], kind: 'text', label: 'label' },
      }],
      links: [{
        label: 'Portfolio', href: 'https://example.com',
        source: { sectionId: 'qr-1', itemId: 'item-1', fieldPath: ['url'], kind: 'url', label: 'url' },
      }],
    }];

    render(
      <EditableResumeProvider value={{ enabled: true, updateField }}>
        <DeclarativeTemplateDocument document={qrDocument} />
      </EditableResumeProvider>,
    );

    expect(screen.getByRole('button', { name: 'label' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'url' })).toBeTruthy();
    expect(screen.getAllByText('Portfolio')).toHaveLength(1);
  });

  it('does not expose QR edit metadata or duplicate its label outside edit mode', () => {
    const qrDocument = document();
    qrDocument.sections[0].type = 'qr_codes';
    qrDocument.sections[0].blocks = [{
      kind: 'qr', images: [],
      textRuns: [{
        text: 'Portfolio', tone: 'default', placeholder: true,
        source: { sectionId: 'qr-1', itemId: 'item-1', fieldPath: ['label'], kind: 'text', label: 'label' },
      }],
      links: [{
        label: 'Portfolio', href: 'https://example.com', placeholder: true,
        source: { sectionId: 'qr-1', itemId: 'item-1', fieldPath: ['url'], kind: 'url', label: 'url' },
      }],
    }];

    const { container } = render(<DeclarativeTemplateDocument document={qrDocument} />);

    expect(screen.getAllByText('Portfolio')).toHaveLength(1);
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('[data-editable-source]')).toBeNull();
  });
});
