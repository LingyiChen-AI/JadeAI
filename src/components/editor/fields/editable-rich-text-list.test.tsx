// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../ai-change-context', () => ({ useAIChangeField: () => ({ change: null, clear: vi.fn() }) }));

import { EditableRichTextList } from './editable-rich-text-list';

describe('EditableRichTextList', () => {
  it('renders rich text controls for every string entry', () => {
    render(<EditableRichTextList label="Highlights" items={['**Impact**', 'Second']} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'bold' })).toHaveLength(2);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getAllByRole('textbox')[0].innerHTML).toContain('<strong>Impact</strong>');
  });

  it('keeps canonical rich text when an entry changes', () => {
    const onChange = vi.fn();
    render(<EditableRichTextList label="Highlights" items={['Before']} onChange={onChange} />);
    const editor = screen.getByRole('textbox');
    editor.innerHTML = '<p><strong>After</strong></p>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(['**After**']);
  });
});
