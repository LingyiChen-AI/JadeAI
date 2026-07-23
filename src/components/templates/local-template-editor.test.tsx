/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, test, vi } from 'vitest';
import type { ComponentProps } from 'react';

import type { TemplateManifestV1 } from '@/types/template';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { label?: string }) => {
    if (key === 'controls.slider') return `slider:${values?.label}`;
    if (/^(layout\.(sidebarWidth|columnGap)|typography\.(baseFontSize|lineHeight|headingScale)|spacing\.(pageMargin|sectionGap)|features\.maxPages)$/.test(key)) return `localized:${key}`;
    return key.startsWith('history.') ? `localized:${key}` : key;
  },
}));

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

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterAll(() => vi.unstubAllGlobals());

describe('LocalTemplateEditor', () => {
  test('requires an explicit draft identity', () => {
    expectTypeOf<ComponentProps<typeof LocalTemplateEditor>>().toMatchTypeOf<{ draftKey: string }>();
  });

  test('edits only schema-backed manifest controls and keeps paper as preview state', () => {
    const onChange = vi.fn();
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" />);

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
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" />);

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
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" />);

    fireEvent.change(screen.getByLabelText('localized:typography.baseFontSize'), { target: { value: '100' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('localized:typography.baseFontSize').getAttribute('aria-invalid')).toBe('true');
  });

  test('renders only fixed fixture content in the preview', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-a" />);

    const preview = screen.getByTestId('local-template-preview');
    expect(preview.textContent).toContain('Jade Template');
    expect(preview.textContent).not.toContain('private@example.com');
  });

  test('supports preset commits with undo, redo, and reset history', () => {
    const onChange = vi.fn();
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" />);

    fireEvent.click(screen.getByRole('button', { name: 'presets.modernTwoColumn' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ type: 'two-column' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'localized:history.undo' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ type: 'single-column' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'localized:history.redo' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ type: 'two-column' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'localized:history.reset' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ type: 'single-column' }) }));
  });

  test('tracks dirty state and saves the current version without changing the manifest', () => {
    const onChange = vi.fn();
    const onDirtyChange = vi.fn();
    const { rerender } = render(
      <LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" onDirtyChange={onDirtyChange} saveVersion={0} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'presets.modernTwoColumn' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    const changeCount = onChange.mock.calls.length;
    rerender(<LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" onDirtyChange={onDirtyChange} saveVersion={1} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(changeCount);
  });

  test('replaces history only when draft identity changes', () => {
    const onChange = vi.fn();
    const first = manifest();
    const { rerender } = render(<LocalTemplateEditor value={first} onChange={onChange} draftKey="draft-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'presets.modernTwoColumn' }));
    const changedValue = { ...first, layout: { ...first.layout, type: 'sidebar' as const } };
    rerender(<LocalTemplateEditor value={changedValue} onChange={onChange} draftKey="draft-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'localized:history.undo' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ type: 'single-column' }) }));

    rerender(<LocalTemplateEditor value={changedValue} onChange={onChange} draftKey="draft-b" />);
    const callsAfterReplace = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'localized:history.undo' }));
    expect(onChange).toHaveBeenCalledTimes(callsAfterReplace);
  });

  test('keeps paper and resume preview selection out of manifest persistence', () => {
    const onChange = vi.fn();
    render(<LocalTemplateEditor value={manifest()} onChange={onChange} draftKey="draft-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'paper.letter' }));
    const resume = screen.getByLabelText('preview.resume');
    fireEvent.change(resume, { target: { value: 'fixture' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('local-template-preview').getAttribute('data-paper-size')).toBe('letter');
  });

  test('renders guided controls, preview status, and responsive settings markers', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-a" />);
    expect(screen.getAllByRole('button', { name: /presets\./ }).length).toBe(3);
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('checkbox').length).toBe(3);
    expect(screen.getByTestId('local-template-editor').getAttribute('data-preview-status')).toBeTruthy();
    expect(screen.getByTestId('local-template-editor').getAttribute('data-layout')).toBe('single-column');
    expect(screen.getByTestId('local-template-mobile-tabs')).toBeTruthy();
    expect(screen.getByTestId('local-template-preview').className).toContain('min-h');
  });

  test('uses localized accessible names for history commands', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-a" />);

    expect(screen.getByRole('button', { name: 'localized:history.undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'localized:history.redo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'localized:history.reset' })).toBeTruthy();
  });

  test('lets preset controls wrap into one column on narrow screens', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-a" />);

    const buttons = screen.getAllByRole('button', { name: /presets\./ });
    const grid = buttons[0]?.parentElement;
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('sm:grid-cols-3');
    for (const button of buttons) {
      expect(button.className).toContain('min-w-0');
      expect(button.className).toContain('whitespace-normal');
      expect(button.className).toContain('flex-wrap');
    }
  });

  test('clears an invalid field when the draft identity changes', () => {
    const first = manifest();
    const { rerender } = render(
      <LocalTemplateEditor value={first} onChange={vi.fn()} draftKey="draft-a" />,
    );
    fireEvent.change(screen.getByLabelText('localized:typography.baseFontSize'), { target: { value: '100' } });
    expect(screen.getByLabelText('localized:typography.baseFontSize').getAttribute('aria-invalid')).toBe('true');

    rerender(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-b" />);

    expect(screen.getByLabelText('localized:typography.baseFontSize').getAttribute('aria-invalid')).toBe('false');
  });

  test('renders translated section names instead of internal type identifiers', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-a" />);
    expect(screen.getByText('personalInfo')).toBeTruthy();
    expect(screen.getByText('qrCodes')).toBeTruthy();
    expect(document.body.textContent).not.toContain('personal_info');
    expect(document.body.textContent).not.toContain('qr_codes');
  });

  test('uses localized accessible names for every numeric input and slider', () => {
    render(<LocalTemplateEditor value={manifest()} onChange={vi.fn()} draftKey="draft-a" />);
    const keys = ['layout.sidebarWidth', 'layout.columnGap', 'typography.baseFontSize', 'typography.lineHeight', 'typography.headingScale', 'spacing.pageMargin', 'spacing.sectionGap', 'features.maxPages'];
    for (const key of keys) {
      const label = `localized:${key}`;
      expect(screen.getByRole('spinbutton', { name: label })).toBeTruthy();
      expect(screen.getByRole('slider', { name: `slider:${label}` })).toBeTruthy();
    }
    expect(document.body.innerHTML).not.toContain('typography.baseFontSize.slider');
  });
});
