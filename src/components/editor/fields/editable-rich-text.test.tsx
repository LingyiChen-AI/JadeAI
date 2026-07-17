// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../ai-change-context', () => ({
  useAIChangeField: () => ({ change: null, clear: vi.fn() }),
}));

import { EditableRichText } from './editable-rich-text';

describe('EditableRichText', () => {
  it('renders a document-style toolbar and rich content instead of a textarea', () => {
    render(<EditableRichText label="Summary" value={'**Impact**\n- Result'} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'bulletList' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'orderedList' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'indent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'outdent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'clearFormatting' })).toBeTruthy();
    expect(screen.queryByRole('textbox')?.getAttribute('contenteditable')).toBe('true');
    expect(screen.queryByRole('textbox')?.innerHTML).toContain('<strong>Impact</strong>');
    expect(screen.queryByRole('textbox')?.innerHTML).toContain('<ul');
  });

  it('exposes pressed state for toggle formatting controls', () => {
    Object.defineProperty(document, 'queryCommandState', {
      configurable: true,
      value: vi.fn((command: string) => command === 'bold'),
    });
    render(<EditableRichText label="Summary" value="Impact" onChange={vi.fn()} />);

    fireEvent(document, new Event('selectionchange'));

    expect(screen.getByRole('button', { name: 'bold' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'bulletList' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'indent' }).getAttribute('aria-pressed')).toBeNull();
  });

  it('serializes edited rich content into the canonical compatible format', () => {
    const onChange = vi.fn();
    render(<EditableRichText label="Summary" value="Before" onChange={onChange} />);
    const editor = screen.getByRole('textbox');

    editor.innerHTML = '<p><strong>After</strong></p><ol data-indent="1"><li>Saved 20%</li></ol>';
    fireEvent.input(editor);

    expect(onChange).toHaveBeenLastCalledWith('**After**\n\t1. Saved 20%');
  });

  it('serializes browser blockquote indentation and clamps it to three levels', () => {
    const onChange = vi.fn();
    render(<EditableRichText label="Summary" value="Before" onChange={onChange} />);
    const editor = screen.getByRole('textbox');

    editor.innerHTML = '<blockquote><blockquote><blockquote><blockquote><p>Indented</p></blockquote></blockquote></blockquote></blockquote>';
    fireEvent.input(editor);

    expect(onChange).toHaveBeenLastCalledWith('\t\t\tIndented');
  });
});
