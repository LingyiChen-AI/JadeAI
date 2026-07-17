import { z } from 'zod/v4';

import { TEMPLATES } from '@/lib/constants';
import type { DeclarativeTemplateManifest, TemplateCapability, TemplateSnapshot } from '@/types/template';
import type { ResolvedTemplate } from './resolve-template';

import { hashManifest, normalizeManifest } from './normalize-manifest';
import { TemplateSnapshotSchema } from './schema';

const SlugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const SemverSchema = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);

export const ClientTemplateBindingChoiceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('public'),
    templateSlug: SlugSchema,
    version: SemverSchema,
  }),
  z.strictObject({
    kind: z.literal('local-snapshot'),
    manifest: z.unknown(),
  }),
  z.strictObject({
    kind: z.literal('legacy'),
    templateSlug: z.enum(TEMPLATES),
  }),
]);

export type ClientTemplateBindingChoice = z.output<typeof ClientTemplateBindingChoiceSchema>;

export type ResumeTemplateBindingInput =
  | Extract<ClientTemplateBindingChoice, { kind: 'public' | 'legacy' }>
  | { kind: 'local-snapshot'; snapshot: TemplateSnapshot };

type SavedTemplateSelection = {
  template: string;
  templateSource: 'public' | 'local-snapshot' | 'legacy';
  templateSnapshot: unknown;
  resolvedTemplate?: ResolvedTemplate;
};

export function parseClientTemplateBindingChoice(input: unknown): ClientTemplateBindingChoice {
  const parsed = ClientTemplateBindingChoiceSchema.parse(input);
  if (parsed.kind !== 'local-snapshot') return parsed;
  return { kind: 'local-snapshot', manifest: normalizeManifest(parsed.manifest) };
}

function deriveLocalCapabilities(manifest: DeclarativeTemplateManifest): TemplateCapability {
  return {
    supportedSections: [...new Set(manifest.sectionSlots.map((slot) => slot.sectionType))],
    paperSizes: ['a4', 'letter'],
    supportsAvatar: manifest.features.showAvatar,
    atsCompatible: false,
    supportsZh: true,
    supportsEn: true,
    supportsHtml: true,
    supportsPdf: true,
    docxFidelity: 'generic',
  };
}

export function toResumeTemplateBindingInput(choice: ClientTemplateBindingChoice): ResumeTemplateBindingInput {
  if (choice.kind !== 'local-snapshot') return choice;
  const manifest = normalizeManifest(choice.manifest);
  const shared = {
    manifest,
    manifestHash: hashManifest(manifest),
    capabilities: deriveLocalCapabilities(manifest),
  };
  return {
    kind: 'local-snapshot',
    snapshot: manifest.rendererKind === 'declarative-v2'
      ? { ...shared, manifest, rendererKind: 'declarative-v2', schemaVersion: 2 }
      : { ...shared, manifest, rendererKind: 'declarative-v1', schemaVersion: 1 },
  };
}

export function parseStoredTemplateSnapshot(input: unknown): TemplateSnapshot {
  const snapshot = TemplateSnapshotSchema.parse(input);
  if (hashManifest(snapshot.manifest) !== snapshot.manifestHash) {
    throw new Error('template_snapshot_hash_mismatch');
  }
  return snapshot;
}

export function selectedTemplateBinding(resume: SavedTemplateSelection | null): ClientTemplateBindingChoice | null {
  if (!resume) return null;
  if (resume.templateSource === 'legacy') {
    const parsed = ClientTemplateBindingChoiceSchema.safeParse({
      kind: 'legacy',
      templateSlug: resume.template,
    });
    return parsed.success ? parsed.data : null;
  }
  if (resume.templateSource === 'local-snapshot') {
    const snapshot = TemplateSnapshotSchema.safeParse(resume.templateSnapshot);
    if (!snapshot.success || hashManifest(snapshot.data.manifest) !== snapshot.data.manifestHash) return null;
    return { kind: 'local-snapshot', manifest: snapshot.data.manifest };
  }
  const resolved = resume.resolvedTemplate;
  if (!resolved || resolved.source !== 'public' || !resolved.slug || !resolved.version) return null;
  if (resolved.slug !== resume.template) return null;
  const parsed = ClientTemplateBindingChoiceSchema.safeParse({
    kind: 'public',
    templateSlug: resolved.slug,
    version: resolved.version,
  });
  return parsed.success ? parsed.data : null;
}

export function shouldApplyTemplateSelection(
  requestSequence: number,
  latestSequence: number,
  requestedResumeId: string,
  currentResumeId: string | undefined,
): boolean {
  return requestSequence === latestSequence && requestedResumeId === currentResumeId;
}
