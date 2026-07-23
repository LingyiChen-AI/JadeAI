// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditableResumeProvider,
  EditableResumeValue,
  type ResumeFieldSource,
} from './editable-resume-context';

const source: ResumeFieldSource = {
  sectionId: 'personal-1',
  fieldPath: ['fullName'],
  kind: 'text',
  label: 'Name',
};

afterEach(cleanup);

describe('editable resume value', () => {
  it('does not add an editing wrapper in ordinary preview mode', () => {
    const { container } = render(<p><EditableResumeValue source={source} value="Alice">Alice</EditableResumeValue></p>);

    expect(container.innerHTML).toBe('<p>Alice</p>');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('edits a value in place and commits with Enter', () => {
    const updateField = vi.fn();
    render(
      <EditableResumeProvider value={{ enabled: true, updateField }}>
        <EditableResumeValue source={source} value="Alice">Alice</EditableResumeValue>
      </EditableResumeProvider>,
    );

    fireEvent.click(screen.getByText('Alice'));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Alicia' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateField).toHaveBeenCalledWith(source, 'Alicia');
  });

  it('restores the entry value when Escape cancels editing', () => {
    const updateField = vi.fn();
    render(
      <EditableResumeProvider value={{ enabled: true, updateField }}>
        <EditableResumeValue source={source} value="Alice">Alice</EditableResumeValue>
      </EditableResumeProvider>,
    );

    fireEvent.click(screen.getByText('Alice'));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Discard me' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(updateField).not.toHaveBeenCalled();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('commits multiline and rich text fields on blur', () => {
    const richSource: ResumeFieldSource = {
      sectionId: 'summary-1', fieldPath: ['text'], kind: 'rich-text', label: 'Summary',
    };
    const updateField = vi.fn();
    render(
      <EditableResumeProvider value={{ enabled: true, updateField }}>
        <EditableResumeValue source={richSource} value="**Bold**">Bold</EditableResumeValue>
      </EditableResumeProvider>,
    );

    fireEvent.click(screen.getByText('Bold'));
    const input = screen.getByRole('textbox', { name: 'Summary' });
    expect(input.tagName).toBe('TEXTAREA');
    fireEvent.change(input, { target: { value: '**Updated**' } });
    fireEvent.blur(input);

    expect(updateField).toHaveBeenCalledWith(richSource, '**Updated**');
  });

  it('provides a labeled insertion point for empty optional fields', () => {
    const updateField = vi.fn();
    render(
      <EditableResumeProvider value={{ enabled: true, updateField, emptyLabel: 'Add field' }}>
        <EditableResumeValue source={source} value="" />
      </EditableResumeProvider>,
    );

    expect(screen.getByRole('button', { name: 'Name: Add field' })).toBeTruthy();
  });
});
