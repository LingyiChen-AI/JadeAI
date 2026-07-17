/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { TemplateManifestV1 } from '@/types/template';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { LocalTemplateEditor } from './local-template-editor';

function manifest(): TemplateManifestV1 {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [
      { sectionType: 'personal_info', placement: 'header', order: 0 },
      { sectionType: 'summary', placement: 'main', order: 1 },
      { sectionType: 'qr_codes', placement: 'footer', order: 2 },
    ],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

afterEach(cleanup);

describe('LocalTemplateEditor', () => {
  test('edits only schema-backed manifest controls and keeps paper as preview state', () => {
    const onChange = vi.fn();
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'layout.two-column' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      layout: expect.objectContaining({ type: 'two-column' }),
    }));
    fireEvent.change(screen.getByLabelText('colors.accent'), { target: { value: '#dc2626' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      colors: expect.objectContaining({ accent: '#dc2626' }),
    }));
    fireEvent.click(screen.getByLabelText('features.avatar'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      features: expect.objectContaining({ showAvatar: false }),
    }));
    fireEvent.change(screen.getByLabelText('sections.heading:summary'), { target: { value: 'accent' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      sectionStyles: expect.arrayContaining([{ sectionType: 'summary', element: 'heading', variant: 'accent' }]),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'paper.letter' }));
    expect(screen.getByTestId('local-template-preview').getAttribute('data-paper-size')).toBe('letter');
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ paperSize: expect.anything() }));
  });

  test('exposes every schema section style element and only schema-valid fonts', () => {
    const onChange = vi.fn();
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} />);

    const font = screen.getByLabelText('typography.fontFamily') as HTMLSelectElement;
    expect([...font.options].map((option) => option.value)).toEqual(['noto-sans-sc']);

    for (const element of ['heading', 'body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr'] as const) {
      fireEvent.change(screen.getByLabelText(`sections.${element}:summary`), { target: { value: 'accent' } });
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        sectionStyles: expect.arrayContaining([{ sectionType: 'summary', element, variant: 'accent' }]),
      }));
    }
  });

  test('retains the last valid manifest when a numeric edit exceeds schema limits', () => {
    const onChange = vi.fn();
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('typography.baseFontSize'), { target: { value: '100' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('typography.baseFontSize').getAttribute('aria-invalid')).toBe('true');
  });

  test('renders only fixed fixture content in the preview', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} />);

    const preview = screen.getByTestId('local-template-preview');
    expect(preview.textContent).toContain('Jade Template');
    expect(preview.textContent).not.toContain('private@example.com');
  });
});
