import type { ResumeSection } from './resume';

export interface EditorState {
  selectedSectionId: string | null;
  selectedItemId: string | null;
  isDragging: boolean;
  showAiChat: boolean;
  zoom: number;
}

export interface ResumeSnapshot {
  sections: ResumeSection[];
  timestamp: number;
}

export type AIChangeKind =
  | 'field-updated'
  | 'item-added'
  | 'item-removed'
  | 'section-added'
  | 'section-removed'
  | 'title-updated';

export type AIChangeSource = 'chat-tool' | 'overwrite-translation';

export type AIChangeValue = string | number | boolean | null | string[];

export interface AIFieldChange {
  id: string;
  resumeId: string;
  sectionId: string;
  sectionTitle: string;
  itemId?: string;
  fieldPath: string;
  kind: AIChangeKind;
  beforeRawValue: unknown;
  afterRawValue: unknown;
  beforeDisplayValue: AIChangeValue;
  afterDisplayValue: AIChangeValue;
  /** @deprecated Use beforeDisplayValue for summaries or beforeRawValue for restoration. */
  beforeValue: AIChangeValue;
  /** @deprecated Use afterDisplayValue for summaries or afterRawValue for restoration. */
  afterValue: AIChangeValue;
  source: AIChangeSource;
  createdAt: number;
  /** Original position for stable-id removals/additions. */
  beforeIndex?: number;
  afterIndex?: number;
  beforeOrder?: string[];
  afterOrder?: string[];
}

export interface AIHistoryEntry {
  id: string;
  resumeId: string;
  userId: string;
  beforeSections: ResumeSection[];
  afterSections: ResumeSection[];
  changes: AIFieldChange[];
  source: AIChangeSource;
  createdAt: number;
  serverRevision: number;
  contentFingerprint: string;
}

export interface AIChangeFocusRequest {
  requestId: number;
  resumeId: string;
  sectionId: string;
  fieldPath: string;
  changeId: string;
}

export type DragItemType = 'section' | 'item' | 'new-section';

export interface DragData {
  type: DragItemType;
  sectionId?: string;
  itemId?: string;
  sectionType?: string;
}
