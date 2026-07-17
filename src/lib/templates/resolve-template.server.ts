import { db, dbReady } from '@/lib/db';
import type { CatalogSql } from '@/lib/db/repositories/template.repository';

import {
  resolveTemplate,
  type ResolvedTemplate,
  type TemplateBindingSource,
  type TemplateRuntimeVersion,
} from './resolve-template';

type RuntimeVersionRow = {
  slug: string;
  template_status: string;
  template_published_at: unknown | null;
  version: string;
  version_status: string;
  version_published_at: unknown | null;
  stable_status: string | null;
  stable_published_at: unknown | null;
  renderer_kind: string;
  manifest: string | Record<string, unknown>;
  manifest_hash: string;
  capabilities: string | Record<string, unknown>;
  fallback_version_id: string | null;
};

function parseJson(value: string | Record<string, unknown>): { ok: true; value: unknown } | { ok: false; value: null } {
  if (typeof value !== 'string') return { ok: true, value };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

export function createRuntimeVersionLoader(
  sql: CatalogSql,
  waitUntilReady: () => Promise<unknown> = async () => undefined,
) {
  return async function loadRuntimeVersionById(
    versionId: string,
    visited = new Set<string>(),
  ): Promise<TemplateRuntimeVersion | null> {
    if (visited.has(versionId) || visited.size >= 8) return null;
    visited.add(versionId);
    await waitUntilReady();
    const [row] = await sql<RuntimeVersionRow[]>`
      SELECT template.slug, template.status AS template_status,
        template.published_at AS template_published_at,
        version.version, version.status AS version_status,
        version.published_at AS version_published_at,
        stable.status AS stable_status, stable.published_at AS stable_published_at,
        version.renderer_kind,
        version.manifest, version.manifest_hash, version.capabilities, version.fallback_version_id
      FROM resume_template_versions AS version
      JOIN resume_templates AS template ON template.id = version.template_id
      LEFT JOIN resume_template_versions AS stable
        ON stable.id = template.stable_version_id AND stable.template_id = template.id
      WHERE version.id = ${versionId}
    `;
    if (!row) return null;

    const declarative = row.renderer_kind === 'declarative-v1' || row.renderer_kind === 'declarative-v2';
    const manifest = declarative
      ? parseJson(row.manifest)
      : { ok: true as const, value: null };
    const capabilities = parseJson(row.capabilities);

    let status: TemplateRuntimeVersion['status'];
    if (row.template_status === 'blocked' || row.version_status === 'blocked' || row.stable_status === 'blocked') status = 'blocked';
    else if (!['legacy-react', 'declarative-v1', 'declarative-v2'].includes(row.renderer_kind)) status = 'invalid';
    else if (!['published', 'unlisted'].includes(row.template_status)) status = 'invalid';
    else if (row.template_published_at === null || row.version_published_at === null) status = 'invalid';
    else if (row.stable_status !== 'published' || row.stable_published_at === null) status = 'invalid';
    else if (!manifest.ok || !capabilities.ok) status = 'invalid';
    else if (row.version_status === 'published') status = 'published';
    else if (row.version_status === 'deprecated') status = 'deprecated';
    else status = 'invalid';

    return {
      slug: row.slug,
      version: row.version,
      rendererKind: row.renderer_kind === 'declarative-v2'
        ? 'declarative-v2'
        : row.renderer_kind === 'declarative-v1' ? 'declarative-v1' : 'legacy-react',
      status,
      manifest: manifest.value,
      manifestHash: row.manifest_hash,
      capabilities: capabilities.value,
      fallback: row.fallback_version_id
        ? await loadRuntimeVersionById(row.fallback_version_id, visited)
        : null,
    };
  };
}

const loadRuntimeVersionById = createRuntimeVersionLoader(
  db.$client as unknown as CatalogSql,
  () => dbReady,
);

export async function resolveTemplateForResume(
  resume: TemplateBindingSource,
): Promise<ResolvedTemplate> {
  return resolveTemplate(resume, { loadPublicVersion: loadRuntimeVersionById });
}
