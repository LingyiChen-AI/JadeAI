const GIT_URL_PLACEHOLDER = '[Git repository URL removed]';

const GIT_HOST = String.raw`(?:[a-z0-9-]+\.)*(?:github\.com|gitlab\.com|gitee\.com|bitbucket\.org)`;
const GIT_URL_PATTERN = new RegExp(
  String.raw`(?:https?|ssh|git):\/\/(?:[^\s/@]+@)?${GIT_HOST}(?::\d+)?\/[^\s<>'\"]+|git@${GIT_HOST}:[^\s<>'\"]+`,
  'gi'
);

function gitUrls(value: string): string[] {
  return value.match(GIT_URL_PATTERN) ?? [];
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return value.replace(GIT_URL_PATTERN, GIT_URL_PLACEHOLDER);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const result = value
      .map((item) => sanitizeValue(item, seen))
      .filter((item) => item !== undefined);
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const sanitized = sanitizeValue(child, seen);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    seen.delete(value);
    return result;
  }
  return undefined;
}

/** Build a detached, model-only copy. The source resume object is never mutated. */
export function sanitizeResumeForModel<T>(resumeData: T): T {
  return sanitizeValue(resumeData, new WeakSet()) as T;
}

export function serializeResumeForModel(resumeData: unknown): string {
  return JSON.stringify(sanitizeResumeForModel(resumeData));
}

function restoreValue(original: unknown, modelValue: unknown): unknown {
  if (typeof original === 'string') {
    const urls = gitUrls(original);
    if (urls.length === 0) return modelValue;
    if (typeof modelValue !== 'string') return original;

    let restored = modelValue;
    for (const url of urls) {
      if (!restored.includes(GIT_URL_PLACEHOLDER)) return original;
      restored = restored.replace(GIT_URL_PLACEHOLDER, url);
    }
    return restored;
  }

  if (Array.isArray(original)) {
    if (!Array.isArray(modelValue)) return original;
    const originalItemsById = new Map<string, unknown>();
    for (const item of original) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        originalItemsById.set((item as { id: string }).id, item);
      }
    }
    return modelValue.map((item, index) => {
      const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined;
      const originalItem = typeof id === 'string' ? originalItemsById.get(id) : original[index];
      return restoreValue(originalItem, item);
    });
  }

  if (original && typeof original === 'object') {
    const output = modelValue && typeof modelValue === 'object' && !Array.isArray(modelValue)
      ? { ...(modelValue as Record<string, unknown>) }
      : {};
    for (const [key, originalChild] of Object.entries(original)) {
      const restored = restoreValue(originalChild, output[key]);
      if (restored !== undefined) output[key] = restored;
    }
    return output;
  }

  return modelValue;
}

/** Restore Git URLs from the persisted section after a model transforms sanitized data. */
export function restoreGitHostingUrls<T>(original: T, modelValue: unknown): T {
  return restoreValue(original, modelValue) as T;
}

export { GIT_URL_PLACEHOLDER };
