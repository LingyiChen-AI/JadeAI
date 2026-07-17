import { describe, expect, test } from 'vitest';

import { selectedTemplateBinding, shouldApplyTemplateSelection } from './apply-template-binding.server';
import { hashManifest } from './normalize-manifest';
import type { TemplateManifestV1 } from '@/types/template';

const manifest: TemplateManifestV1 = {
  schemaVersion: 1,
  rendererKind: 'declarative-v1',
  layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
  typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
  colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
  spacing: { pageMarginMm: 12, sectionGapMm: 6 },
  sectionSlots: [],
  sectionStyles: [],
  features: { showAvatar: false, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
};

describe('selectedTemplateBinding', () => {
  test('restores the exact saved public slug and semver from its resolved version', () => {
    expect(selectedTemplateBinding({
      template: 'modern', templateSource: 'public', templateSnapshot: null,
      resolvedTemplate: {
        kind: 'declarative-v1', source: 'public', slug: 'modern', version: '2.4.1', manifest,
        capabilities: { supportedSections: [], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: false, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'generic' },
        degraded: false,
      },
    })).toEqual({ kind: 'public', templateSlug: 'modern', version: '2.4.1' });
  });

  test('restores local snapshots and registered legacy templates without inventing public versions', () => {
    expect(selectedTemplateBinding({
      template: 'classic', templateSource: 'local-snapshot',
      templateSnapshot: { rendererKind: 'declarative-v1', schemaVersion: 1, manifest, manifestHash: hashManifest(manifest), capabilities: { supportedSections: [], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: false, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'generic' } },
    })).toEqual({ kind: 'local-snapshot', manifest });
    expect(selectedTemplateBinding({
      template: 'minimal', templateSource: 'legacy', templateSnapshot: null,
    })).toEqual({ kind: 'legacy', templateSlug: 'minimal' });
  });

  test('fails closed when saved public resolution is missing or mismatched', () => {
    expect(selectedTemplateBinding({
      template: 'modern', templateSource: 'public', templateSnapshot: null,
    })).toBeNull();
    expect(selectedTemplateBinding({
      template: 'modern', templateSource: 'public', templateSnapshot: null,
      resolvedTemplate: {
        kind: 'legacy-react', source: 'public', slug: 'minimal', version: '1.0.0',
        capabilities: { supportedSections: [], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: false, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'high-fidelity' },
        degraded: false,
      },
    })).toBeNull();
  });
});

describe('shouldApplyTemplateSelection', () => {
  test('rejects late responses after another request, resume switch, or unmount invalidation', () => {
    expect(shouldApplyTemplateSelection(3, 3, 'resume-a', 'resume-a')).toBe(true);
    expect(shouldApplyTemplateSelection(2, 3, 'resume-a', 'resume-a')).toBe(false);
    expect(shouldApplyTemplateSelection(3, 3, 'resume-a', 'resume-b')).toBe(false);
    expect(shouldApplyTemplateSelection(3, 4, 'resume-a', 'resume-a')).toBe(false);
  });
});
