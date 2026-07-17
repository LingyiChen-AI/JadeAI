import { TEMPLATES } from '@/lib/constants';
import type { TemplateCapability, TemplateManifestV1, TemplateManifestV2, TemplateVersionDetail } from '@/types/template';

import { hashManifest } from './normalize-manifest';
import { TemplateCapabilitySchema, TemplateManifestV1Schema, TemplateManifestV2Schema, TemplateSnapshotSchema } from './schema';

export type TemplateResolutionReason =
  | 'invalid_local_snapshot'
  | 'public_version_missing'
  | 'public_version_blocked'
  | 'public_version_invalid'
  | 'legacy_template_unknown';

export type TemplateRuntimeVersion = {
  slug: string;
  version: string;
  rendererKind: 'declarative-v1' | 'declarative-v2' | 'legacy-react';
  status: 'published' | 'deprecated' | 'blocked' | 'invalid';
  manifest: unknown | null;
  manifestHash: string;
  capabilities: unknown;
  fallback?: TemplateRuntimeVersion | null;
};

type ResolutionBase = {
  degraded: boolean;
  reason?: TemplateResolutionReason;
  capabilities: TemplateCapability;
};

export type ResolvedTemplate =
  | (ResolutionBase & {
      kind: 'declarative-v1';
      source: 'local-snapshot' | 'public' | 'fallback';
      slug?: string;
      version?: string;
      manifest: TemplateManifestV1;
    })
  | (ResolutionBase & {
      kind: 'declarative-v2';
      source: 'local-snapshot' | 'public' | 'fallback';
      slug?: string;
      version?: string;
      manifest: TemplateManifestV2;
    })
  | (ResolutionBase & {
      kind: 'legacy-react';
      source: 'public' | 'legacy' | 'fallback' | 'classic';
      slug: string;
      version?: string;
    });

export type TemplateResolverDependencies = {
  loadPublicVersion?: (versionId: string) => Promise<TemplateRuntimeVersion | null>;
  isRegisteredLegacy?: (slug: string) => boolean;
};

export type TemplateBindingSource = {
  template: string;
  templateVersionId: string | null;
  templateSnapshot: unknown;
};

export function resolveSavedTemplateSnapshot(snapshotValue: unknown): ResolvedTemplate | null {
  const snapshot = TemplateSnapshotSchema.safeParse(snapshotValue);
  if (!snapshot.success || hashManifest(snapshot.data.manifest) !== snapshot.data.manifestHash) return null;
  if (snapshot.data.rendererKind === 'declarative-v2') {
    return {
      kind: 'declarative-v2', source: 'local-snapshot', manifest: snapshot.data.manifest,
      capabilities: snapshot.data.capabilities, degraded: false,
    };
  }
  return {
    kind: 'declarative-v1',
    source: 'local-snapshot',
    manifest: snapshot.data.manifest,
    capabilities: snapshot.data.capabilities,
    degraded: false,
  };
}

const CLASSIC_CAPABILITIES: TemplateCapability = {
  supportedSections: [...new Set([
    'personal_info', 'summary', 'work_experience', 'education', 'skills', 'projects',
    'certifications', 'languages', 'custom', 'github', 'qr_codes',
  ])] as TemplateCapability['supportedSections'],
  paperSizes: ['a4', 'letter'],
  supportsAvatar: true,
  atsCompatible: true,
  supportsZh: true,
  supportsEn: true,
  supportsHtml: true,
  supportsPdf: true,
  docxFidelity: 'generic',
};

const REGISTERED_LEGACY_CAPABILITIES: TemplateCapability = {
  ...CLASSIC_CAPABILITIES,
  supportedSections: [...CLASSIC_CAPABILITIES.supportedSections],
  paperSizes: [...CLASSIC_CAPABILITIES.paperSizes],
  docxFidelity: 'high-fidelity',
};

function isRegisteredLegacyByDefault(slug: string): boolean {
  return (TEMPLATES as readonly string[]).includes(slug);
}

function classic(reason?: TemplateResolutionReason): ResolvedTemplate {
  return {
    kind: 'legacy-react',
    source: 'classic',
    slug: 'classic',
    capabilities: CLASSIC_CAPABILITIES,
    degraded: reason !== undefined,
    ...(reason ? { reason } : {}),
  };
}

function resolveRuntimeVersion(
  version: TemplateRuntimeVersion,
  isRegisteredLegacy: (slug: string) => boolean,
  inheritedReason?: TemplateResolutionReason,
): ResolvedTemplate | null {
  if (version.status === 'blocked') {
    const fallback = version.fallback
      ? resolveRuntimeVersion(version.fallback, isRegisteredLegacy, 'public_version_blocked')
      : null;
    return fallback ?? classic('public_version_blocked');
  }
  if (version.status === 'invalid') {
    const fallback = version.fallback
      ? resolveRuntimeVersion(version.fallback, isRegisteredLegacy, 'public_version_invalid')
      : null;
    return fallback ?? null;
  }

  const capabilities = TemplateCapabilitySchema.safeParse(version.capabilities);
  if (!capabilities.success) return null;

  if (version.rendererKind === 'legacy-react') {
    if (!isRegisteredLegacy(version.slug)) return null;
    return {
      kind: 'legacy-react',
      source: inheritedReason ? 'fallback' : 'public',
      slug: version.slug,
      version: version.version,
      capabilities: capabilities.data,
      degraded: inheritedReason !== undefined,
      ...(inheritedReason ? { reason: inheritedReason } : {}),
    };
  }

  const source = inheritedReason ? 'fallback' as const : 'public' as const;
  if (version.rendererKind === 'declarative-v2') {
    const manifest = TemplateManifestV2Schema.safeParse(version.manifest);
    if (!manifest.success || hashManifest(manifest.data) !== version.manifestHash) return null;
    return {
      kind: 'declarative-v2', source, slug: version.slug, version: version.version,
      manifest: manifest.data, capabilities: capabilities.data,
      degraded: inheritedReason !== undefined,
      ...(inheritedReason ? { reason: inheritedReason } : {}),
    };
  }
  const manifest = TemplateManifestV1Schema.safeParse(version.manifest);
  if (!manifest.success || hashManifest(manifest.data) !== version.manifestHash) return null;
  return {
    kind: 'declarative-v1', source,
    slug: version.slug,
    version: version.version,
    manifest: manifest.data,
    capabilities: capabilities.data,
    degraded: inheritedReason !== undefined,
    ...(inheritedReason ? { reason: inheritedReason } : {}),
  };
}

export function resolvePublicTemplateDetail(detail: TemplateVersionDetail): ResolvedTemplate {
  const resolved = resolveRuntimeVersion({
    slug: detail.slug,
    version: detail.version.version,
    rendererKind: detail.rendererKind,
    status: 'published',
    manifest: detail.manifest,
    manifestHash: detail.manifestHash,
    capabilities: detail.capabilities,
  }, isRegisteredLegacyByDefault);
  if (!resolved) throw new Error('public_template_detail_invalid');
  return resolved;
}

export async function resolveTemplate(
  resume: TemplateBindingSource,
  dependencies: TemplateResolverDependencies = {},
): Promise<ResolvedTemplate> {
  const isRegisteredLegacy = dependencies.isRegisteredLegacy ?? isRegisteredLegacyByDefault;
  let priorReason: TemplateResolutionReason | undefined;

  if (resume.templateSnapshot !== null) {
    const snapshot = resolveSavedTemplateSnapshot(resume.templateSnapshot);
    if (snapshot) return snapshot;
    priorReason = 'invalid_local_snapshot';
  }

  if (resume.templateVersionId && dependencies.loadPublicVersion) {
    const version = await dependencies.loadPublicVersion(resume.templateVersionId);
    if (version) {
      const resolved = resolveRuntimeVersion(version, isRegisteredLegacy, priorReason);
      if (resolved) return resolved;
      return classic(version.status === 'blocked' ? 'public_version_blocked' : 'public_version_invalid');
    } else {
      priorReason = priorReason ?? 'public_version_missing';
    }
  }

  if (isRegisteredLegacy(resume.template)) {
    return {
      kind: 'legacy-react',
      source: 'legacy',
      slug: resume.template,
      capabilities: REGISTERED_LEGACY_CAPABILITIES,
      degraded: priorReason !== undefined,
      ...(priorReason ? { reason: priorReason } : {}),
    };
  }

  return classic(priorReason ?? 'legacy_template_unknown');
}
