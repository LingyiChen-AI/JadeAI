export interface ResumeFieldSource {
  sectionId: string;
  itemId?: string;
  fieldPath: readonly (string | number)[];
  kind: 'text' | 'multiline' | 'rich-text' | 'date' | 'url' | 'list-value';
  label: string;
}
