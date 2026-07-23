// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key === 'beautify' ? '美化样式' : key }));

import { AIInput } from './ai-input';

function props() {
  return {
    input: 'Polish this resume',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    isLoading: false,
    models: ['model-a'],
    selectedModel: 'model-a',
    onModelChange: vi.fn(),
    beautify: false,
    onBeautifyChange: vi.fn(),
  };
}

describe('AIInput beautify authorization', () => {
  it('renders beautify unchecked by default and reports explicit opt-in', () => {
    const inputProps = props();
    render(<AIInput {...inputProps} />);

    const checkbox = screen.getByRole('checkbox', { name: '美化样式' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(inputProps.onBeautifyChange).toHaveBeenCalledWith(true);
  });

  it('locks beautify authorization while a request is in flight', () => {
    const inputProps = { ...props(), isLoading: true };
    render(<AIInput {...inputProps} />);

    const checkbox = screen.getByRole('checkbox', { name: '美化样式' }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
