import type { DeclarativeTemplateManifest, LocalTemplateRecord } from '@/types/template';

import { LocalTemplateExportRawSchema, LocalTemplateRecordSchema, parseTemplateManifest } from './schema';
import { canonicalizeJson } from './security';

export const LOCAL_TEMPLATE_PACKAGE_MAX_BYTES = 512 * 1024;

type LocalTemplateImportContext = {
  userId: string;
  localId?: () => string;
  now?: () => Date;
  thumbnail: Blob | ((manifest: DeclarativeTemplateManifest) => Promise<Blob>);
};

export class LocalTemplatePackageError extends Error {
  readonly code = 'LOCAL_TEMPLATE_PACKAGE_INVALID' as const;

  constructor(message = 'Local template package is invalid', options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalTemplatePackageError';
  }
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new LocalTemplatePackageError('SHA-256 is unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function manifestChecksum(manifest: unknown): Promise<string> {
  return sha256(canonicalizeJson(parseTemplateManifest(manifest)));
}

export async function exportLocalTemplatePackage(recordInput: LocalTemplateRecord): Promise<string> {
  const record = LocalTemplateRecordSchema.parse(recordInput);
  const value = {
    formatVersion: 1 as const,
    metadata: {
      name: record.name,
      category: record.category,
      localTags: record.localTags,
      sourceDescription: record.sourceDescription,
      templateVersion: record.templateVersion,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    manifest: parseTemplateManifest(record.manifest),
    checksum: await manifestChecksum(record.manifest),
  };
  return JSON.stringify(LocalTemplateExportRawSchema.parse(value), null, 2);
}

export async function importLocalTemplatePackage(
  serialized: string,
  context: LocalTemplateImportContext,
): Promise<LocalTemplateRecord> {
  if (new TextEncoder().encode(serialized).byteLength > LOCAL_TEMPLATE_PACKAGE_MAX_BYTES) {
    throw new LocalTemplatePackageError('Local template package is too large');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch (error) {
    throw new LocalTemplatePackageError('Local template package is not JSON', { cause: error });
  }
  const parsed = LocalTemplateExportRawSchema.safeParse(raw);
  if (!parsed.success) throw new LocalTemplatePackageError(undefined, { cause: parsed.error });
  const manifest = parseTemplateManifest(parsed.data.manifest);
  if (await manifestChecksum(manifest) !== parsed.data.checksum) {
    throw new LocalTemplatePackageError('Local template package checksum mismatch');
  }
  const timestamp = (context.now ?? (() => new Date()))().toISOString();
  const thumbnail = typeof context.thumbnail === 'function'
    ? await context.thumbnail(manifest)
    : context.thumbnail;
  return LocalTemplateRecordSchema.parse({
    userId: context.userId,
    localId: (context.localId ?? (() => crypto.randomUUID()))(),
    name: parsed.data.metadata.name,
    category: parsed.data.metadata.category,
    localTags: parsed.data.metadata.localTags,
    sourceDescription: parsed.data.metadata.sourceDescription,
    templateVersion: parsed.data.metadata.templateVersion,
    manifest,
    thumbnail,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
