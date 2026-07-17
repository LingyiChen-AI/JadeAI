/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useTemplateCatalog: vi.fn(),
  localRecords: [] as Array<{ localId: string; name: string; manifest: unknown }>,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/providers/runtime-config-provider', () => ({
  useRuntimeConfig: () => ({ authEnabled: true }),
}));
vi.mock('@/hooks/use-fingerprint', () => ({
  useFingerprint: () => ({ fingerprint: null, isLoading: false }),
}));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
}));
vi.mock('@/hooks/use-local-templates', () => ({
  useLocalTemplates: () => ({ records: mocks.localRecords, status: 'ready' }),
}));
vi.mock('@/hooks/use-template-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-template-catalog')>();
  return { ...actual, useTemplateCatalog: mocks.useTemplateCatalog };
});
vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => <span data-src={src} />,
}));
vi.mock('../dashboard/template-thumbnail', () => ({
  TemplateThumbnail: ({ template }: { template: string }) => <span>{template}</span>,
}));

import { TemplateSelector } from './template-selector';

const item = {
  slug: 'public-template',
  stableVersion: '1.2.3',
  nameZh: '公开模板',
  nameEn: 'Public Template',
  category: { id: 'general', slug: 'general', nameZh: '通用', nameEn: 'General', sortOrder: 0 },
  tags: [],
  thumbnailPath: `templates/public-template/v1.2.3/thumbnail-${'a'.repeat(16)}.png`,
  fullPreviewPath: `templates/public-template/v1.2.3/preview-${'b'.repeat(16)}.png`,
  capabilities: {
    supportedSections: ['personal_info'], paperSizes: ['a4'], supportsAvatar: true,
    atsCompatible: true, supportsZh: true, supportsEn: true, supportsHtml: true,
    supportsPdf: true, docxFidelity: 'generic',
  },
  favorite: false,
} as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.localRecords = [];
});

describe('TemplateSelector', () => {
  test('reuses catalog views and emits only the public slug/version choice', () => {
    const onChange = vi.fn();
    mocks.useTemplateCatalog.mockReturnValue({
      status: 'ready', items: [item], isLoading: false, error: null,
      reload: vi.fn(), setFavorite: vi.fn(),
    });
    render(<TemplateSelector value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Public Template' }));
    expect(onChange).toHaveBeenCalledWith({
      kind: 'public', templateSlug: 'public-template', version: '1.2.3',
    });
    fireEvent.click(screen.getByRole('tab', { name: 'views.favorites' }));
    expect(mocks.useTemplateCatalog.mock.calls.at(-1)?.[0].filters.view).toBe('favorites');
  });

  test('keeps registered legacy choices and supplied local manifests in the same contract', () => {
    const onChange = vi.fn();
    mocks.useTemplateCatalog.mockReturnValue({
      status: 'empty', items: [], isLoading: false, error: null,
      reload: vi.fn(), setFavorite: vi.fn(),
    });
    const manifest = { schemaVersion: 1, rendererKind: 'declarative-v1' };
    render(<TemplateSelector
      value={null}
      onChange={onChange}
      localTemplates={[{ key: 'local-a', label: 'Local A', manifest }]}
    />);

    fireEvent.click(screen.getByRole('tab', { name: 'views.local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Local A' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'local-snapshot', manifest });

    fireEvent.click(screen.getByRole('tab', { name: 'views.legacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'classic' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'legacy', templateSlug: 'classic' });
  });

  test('loads current-scope local records when no explicit local list is supplied', () => {
    const onChange = vi.fn();
    mocks.localRecords = [{ localId: 'local-scope', name: 'Scoped Local', manifest: { schemaVersion: 1, rendererKind: 'declarative-v1' } }];
    mocks.useTemplateCatalog.mockReturnValue({
      status: 'empty', items: [], isLoading: false, error: null,
      reload: vi.fn(), setFavorite: vi.fn(),
    });
    render(<TemplateSelector value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'views.local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scoped Local' }));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'local-snapshot', manifest: { schemaVersion: 1, rendererKind: 'declarative-v1' },
    });
  });
});
