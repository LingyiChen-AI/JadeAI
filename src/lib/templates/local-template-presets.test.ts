import { describe, expect, it } from 'vitest';

import type { TemplateManifestV1 } from '@/types/template';

import { DeclarativeTemplateManifestSchema } from './schema';
import {
  LOCAL_TEMPLATE_PRESETS,
  LocalTemplatePresetId,
  createLocalTemplatePreset,
} from './local-template-presets';

describe('local template presets', () => {
  it('exposes the supported presets in stable order', () => {
    expect(LOCAL_TEMPLATE_PRESETS.map((preset) => preset.id)).toEqual([
      'ats-clean',
      'modern-two-column',
      'compact-professional',
    ] satisfies LocalTemplatePresetId[]);
    for (const preset of LOCAL_TEMPLATE_PRESETS) {
      expect(Object.keys(preset).sort()).toEqual(['descriptionKey', 'id', 'labelKey']);
    }
  });

  it('provides complete, valid declarative-v1 manifests', () => {
    for (const preset of LOCAL_TEMPLATE_PRESETS) {
      const manifest = createLocalTemplatePreset(preset.id);
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.rendererKind).toBe('declarative-v1');
      expect(DeclarativeTemplateManifestSchema.parse(manifest)).toEqual(manifest);
    }
  });

  it('keeps visual choices distinct between presets', () => {
    const signatures = LOCAL_TEMPLATE_PRESETS.map(({ id }) => {
      const manifest = createLocalTemplatePreset(id);
      return JSON.stringify({
        layout: manifest.layout,
        typography: manifest.typography,
        colors: manifest.colors,
        spacing: manifest.spacing,
      });
    });
    expect(new Set(signatures).size).toBe(LOCAL_TEMPLATE_PRESETS.length);
  });

  it('uses the prescribed layouts and compact spacing', () => {
    const manifests = LOCAL_TEMPLATE_PRESETS.map(({ id }) => createLocalTemplatePreset(id));
    expect(manifests.map((manifest) => manifest.layout.type)).toEqual([
      'single-column',
      'two-column',
      'single-column',
    ]);
    expect(manifests[2].spacing.sectionGapMm).toBeLessThan(manifests[0].spacing.sectionGapMm);
  });

  it('returns deeply independent manifest values for each factory call', () => {
    const first = createLocalTemplatePreset('ats-clean');
    const second = createLocalTemplatePreset('ats-clean');

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.sectionSlots).not.toBe(first.sectionSlots);
    expect(second.sectionStyles).not.toBe(first.sectionStyles);

    first.colors.text = '#ff0000';
    first.sectionSlots[0].order = 31;
    expect(second.colors.text).not.toBe('#ff0000');
    expect(second.sectionSlots[0].order).not.toBe(31);
  });

  it('does not let exposed preset data contaminate future factory results', () => {
    const exposed = LOCAL_TEMPLATE_PRESETS[0] as unknown as { manifest?: TemplateManifestV1 };
    if (exposed.manifest) {
      exposed.manifest.colors.text = '#ff0000';
      exposed.manifest.sectionSlots[0].order = 31;
    }

    const fresh = createLocalTemplatePreset('ats-clean');
    expect(fresh.colors.text).toBe('#18181b');
    expect(fresh.sectionSlots[0].order).toBe(0);
  });
});
