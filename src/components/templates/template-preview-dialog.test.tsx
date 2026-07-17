/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';

import type { TemplateCatalogItem, TemplateManifestV1 } from '@/types/template';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('next/image', () => ({ default: () => <span data-testid="preview-image" /> }));
vi.mock('./legacy-template-registry', () => ({ loadLegacyTemplateAdapter: vi.fn() }));

import { TemplatePreviewDialog } from './template-preview-dialog';

const manifest: TemplateManifestV1 = {
  schemaVersion: 1,
  rendererKind: 'declarative-v1',
  layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
  typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
  colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
  spacing: { pageMarginMm: 12, sectionGapMm: 6 },
  sectionSlots: [{ sectionType: 'summary', placement: 'main', order: 0 }],
  sectionStyles: [],
  features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
};

const item: TemplateCatalogItem = {
  slug: 'declarative-template', stableVersion: '1.0.0', nameZh: '声明式模板', nameEn: 'Declarative Template',
  category: { id: 'general', slug: 'general', nameZh: '通用', nameEn: 'General', sortOrder: 0 }, tags: [],
  thumbnailPath: `templates/declarative-template/v1.0.0/thumbnail-${'a'.repeat(16)}.png`,
  fullPreviewPath: `templates/declarative-template/v1.0.0/preview-${'b'.repeat(16)}.png`,
  capabilities: { supportedSections: ['summary'], paperSizes: ['a4'], supportsAvatar: true, atsCompatible: true, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'generic' },
  favorite: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TemplatePreviewDialog local copy', () => {
  test('offers the validated declarative manifest and display name to the copy callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ...item,
      rendererKind: 'declarative-v1',
      version: { id: 'version-1', version: '1.0.0', publishedAt: '2026-07-16T00:00:00.000Z' },
      manifest,
      manifestHash: 'c'.repeat(64),
      source: { kind: 'official', license: 'Apache-2.0' },
    })));
    const onCopy = vi.fn();
    render(<TemplatePreviewDialog
      item={item}
      locale="en"
      creating={false}
      labels={{ loading: 'Loading', error: 'Error', retry: 'Retry', useTemplate: 'Use', creating: 'Creating', copyTemplate: 'Copy', description: 'Preview {name}' }}
      onClose={vi.fn()}
      onUse={vi.fn()}
      onCopy={onCopy}
    />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(onCopy).toHaveBeenCalledWith(manifest, 'Declarative Template');
  });
});
