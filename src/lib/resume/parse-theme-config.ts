import type { ThemeConfig } from '@/types/resume';

/** Decode legacy JSON before object spreading can turn it into character keys. */
export function parseThemeConfig(value: unknown): Partial<ThemeConfig> | null {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { throw new Error('Invalid resume theme JSON'); }
  }
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid resume theme');
  const theme = value as Record<string, unknown>;
  // Heal records saved after spreading a serialized theme in the old editor.
  // Only remove character keys when they reconstruct a valid JSON object.
  const indices = Object.keys(theme).filter(key => /^(0|[1-9]\d*)$/.test(key)).sort((a, b) => Number(a) - Number(b));
  if (indices.length && indices.every((key, index) => key === String(index) && typeof theme[key] === 'string' && theme[key].length === 1)) {
    try {
      const original: unknown = JSON.parse(indices.map(key => theme[key]).join(''));
      if (original && typeof original === 'object' && !Array.isArray(original)) {
        return { ...original, ...Object.fromEntries(Object.entries(theme).filter(([key]) => !indices.includes(key))) };
      }
    } catch { /* Leave unrelated invalid data for the snapshot validator. */ }
  }
  return theme as Partial<ThemeConfig>;
}
