import { z } from 'zod/v4';

export const MAX_MANIFEST_BYTES = 128 * 1024;
export const MAX_JSON_DEPTH = 12;
export const MAX_JSON_NODES = 4096;
export const MAX_JSON_STRING_BYTES = 8 * 1024;
export const MAX_JSON_ARRAY_LENGTH = 256;

const STATIC_ASSET_SEGMENT = /^[A-Za-z0-9._-]+$/;
const TEMPLATE_SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_SEGMENT = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export function isVersionedStaticAssetPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes(':')
  ) {
    return false;
  }

  const segments = value.split('/');
  return (
    segments.length >= 4 &&
    segments[0] === 'templates' &&
    TEMPLATE_SLUG_SEGMENT.test(segments[1] ?? '') &&
    VERSION_SEGMENT.test(segments[2] ?? '') &&
    segments.slice(3).every((segment) => segment !== '.' && segment !== '..' && STATIC_ASSET_SEGMENT.test(segment))
  );
}

export const VersionedStaticAssetPathSchema = z
  .string()
  .max(512)
  .refine(isVersionedStaticAssetPath, { error: 'unsafe_asset_path' });

type JsonStructureResult =
  | { success: true; data: unknown }
  | { success: false; error: z.ZodError };

function structureFailure(path: PropertyKey[], message: string): JsonStructureResult {
  return {
    success: false,
    error: new z.ZodError([
      {
        code: 'custom',
        path,
        message,
      },
    ]),
  };
}

export function validateJsonStructure(value: unknown): JsonStructureResult {
  let nodes = 0;

  const visit = (current: unknown, depth: number, path: PropertyKey[]): JsonStructureResult | undefined => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES) return structureFailure(path, 'json_node_limit_exceeded');
    if (depth > MAX_JSON_DEPTH) return structureFailure(path, 'json_depth_limit_exceeded');

    if (typeof current === 'string') {
      if (new TextEncoder().encode(current).byteLength > MAX_JSON_STRING_BYTES) {
        return structureFailure(path, 'json_string_too_large');
      }
      return undefined;
    }

    if (typeof current === 'number') {
      return Number.isFinite(current) ? undefined : structureFailure(path, 'json_number_not_finite');
    }
    if (current === null || typeof current === 'boolean') return undefined;
    if (typeof current !== 'object') return structureFailure(path, 'json_value_not_supported');

    if (Array.isArray(current)) {
      if (current.length > MAX_JSON_ARRAY_LENGTH) return structureFailure(path, 'json_array_too_large');
      for (let index = 0; index < current.length; index += 1) {
        const failure = visit(current[index], depth + 1, [...path, index]);
        if (failure) return failure;
      }
      return undefined;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) return structureFailure(path, 'json_object_not_plain');

    for (const [key, child] of Object.entries(current)) {
      if (new TextEncoder().encode(key).byteLength > MAX_JSON_STRING_BYTES) {
        return structureFailure([...path, key], 'json_string_too_large');
      }
      const failure = visit(child, depth + 1, [...path, key]);
      if (failure) return failure;
    }
    return undefined;
  };

  return visit(value, 0, []) ?? { success: true, data: value };
}

export function assertCanonicalManifestSize(canonicalJson: string): void {
  if (new TextEncoder().encode(canonicalJson).byteLength > MAX_MANIFEST_BYTES) {
    throw new Error('manifest_too_large');
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}
