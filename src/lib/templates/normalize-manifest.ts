import { createHash } from 'node:crypto';

import type { z } from 'zod/v4';

import type { TemplateManifestV1 } from '@/types/template';

import { LocalTemplateExportRawSchema, parseTemplateManifest } from './schema';
import { assertCanonicalManifestSize, canonicalizeJson } from './security';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashCanonicalJson(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

export function normalizeManifest(input: unknown): TemplateManifestV1 {
  return parseTemplateManifest(input);
}

export function canonicalizeManifest(input: unknown): string {
  const canonicalJson = canonicalizeJson(normalizeManifest(input));
  assertCanonicalManifestSize(canonicalJson);
  return canonicalJson;
}

export function hashManifest(input: unknown): string {
  return sha256Hex(canonicalizeManifest(input));
}

export const LocalTemplateExportSchema = LocalTemplateExportRawSchema.superRefine((exported, context: z.RefinementCtx) => {
  if (exported.checksum !== hashCanonicalJson(exported.manifest)) {
    context.addIssue({ code: 'custom', path: ['checksum'], message: 'checksum_mismatch' });
  }
});
