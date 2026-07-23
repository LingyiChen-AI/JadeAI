import type { AIFieldChange } from '@/types/editor';

const FIELD_KEYS: Array<[string, string]> = [
  ['themeConfig.primaryColor', 'primaryColor'],
  ['themeConfig.accentColor', 'accentColor'],
  ['themeConfig.fontFamily', 'fontFamily'],
  ['themeConfig.fontSize', 'fontSize'],
  ['themeConfig.lineSpacing', 'lineSpacing'],
  ['themeConfig.sectionSpacing', 'sectionSpacing'],
  ['themeConfig.margin', 'margin'],
  ['themeConfig.avatarStyle', 'avatarStyle'],
];

export function styleChangeKeys(changes: AIFieldChange[]): string[] {
  const keys = new Set<string>();
  for (const change of changes) {
    if (change.sectionId !== '__resume_style__') continue;
    const match = FIELD_KEYS.find(([path]) => change.fieldPath === path || change.fieldPath.startsWith(`${path}.`));
    if (match) keys.add(match[1]);
  }
  return [...keys];
}
