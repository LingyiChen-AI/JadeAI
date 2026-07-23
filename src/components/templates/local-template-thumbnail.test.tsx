/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createLocalTemplatePreset } from '@/lib/templates/local-template-presets';

import { LocalTemplateThumbnail } from './local-template-thumbnail';

const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

beforeEach(() => {
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL,
    revokeObjectURL,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LocalTemplateThumbnail', () => {
  test('creates one object URL per Blob identity and revokes replaced and current URLs', () => {
    const first = new Blob(['first'], { type: 'image/png' });
    const second = new Blob(['second'], { type: 'image/png' });
    const manifest = createLocalTemplatePreset('ats-clean');
    const { rerender, unmount } = render(
      <LocalTemplateThumbnail thumbnail={first} manifest={manifest} alt="Template preview" />,
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenLastCalledWith(first);
    expect(screen.getByRole('img', { name: 'Template preview' }).getAttribute('src')).toBe('blob:first');

    rerender(<LocalTemplateThumbnail thumbnail={first} manifest={manifest} alt="Updated preview" />);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    rerender(<LocalTemplateThumbnail thumbnail={second} manifest={manifest} alt="Updated preview" />);
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:first');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('img', { name: 'Updated preview' }).getAttribute('src')).toBe('blob:second');

    unmount();
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:second');
  });

  test('replaces a failed image with a stable manifest-color fallback without changing layout', () => {
    const manifest = createLocalTemplatePreset('ats-clean');
    manifest.colors.background = '#ffffff';
    manifest.colors.accent = '#123456';
    render(<LocalTemplateThumbnail thumbnail={new Blob(['bad'])} manifest={manifest} alt="Broken preview" />);

    const frame = screen.getByTestId('local-template-thumbnail');
    const className = frame.getAttribute('class');
    fireEvent.error(screen.getByRole('img', { name: 'Broken preview' }));

    const fallback = screen.getByTestId('local-template-thumbnail-fallback') as HTMLDivElement;
    expect(screen.getByRole('img', { name: 'Broken preview' })).toBe(fallback);
    expect(fallback.getAttribute('role')).toBe('img');
    expect(fallback.getAttribute('aria-label')).toBe('Broken preview');
    const expected = document.createElement('div');
    expected.style.backgroundImage = 'linear-gradient(135deg, #ffffff 0%, #ffffff 62%, #123456 62%, #123456 100%)';
    expect(fallback.style.backgroundImage).toBe(expected.style.backgroundImage);
    expect(screen.getByTestId('local-template-thumbnail').getAttribute('class')).toBe(className);
    expect(frame.textContent).toBe('');
  });
});
