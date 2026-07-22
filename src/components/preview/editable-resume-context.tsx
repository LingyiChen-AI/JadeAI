'use client';

import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface ResumeFieldSource {
  sectionId: string;
  itemId?: string;
  fieldPath: readonly (string | number)[];
  kind: 'text' | 'multiline' | 'rich-text' | 'date' | 'url' | 'list-value';
  label: string;
}

export interface EditableResumeContract {
  enabled: true;
  updateField(source: ResumeFieldSource, value: string): void;
  emptyLabel?: string;
}

const EditableResumeContext = createContext<EditableResumeContract | null>(null);

export function EditableResumeProvider({
  value,
  children,
}: {
  value: EditableResumeContract | null | undefined;
  children: ReactNode;
}) {
  return <EditableResumeContext.Provider value={value ?? null}>{children}</EditableResumeContext.Provider>;
}

export function useEditableResume(): EditableResumeContract | null {
  return useContext(EditableResumeContext);
}

interface EditableResumeValueProps {
  source: ResumeFieldSource;
  value: string;
  children?: ReactNode;
}

export function EditableResumeValue({ source, value, children }: EditableResumeValueProps) {
  const edit = useEditableResume();
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const entryValueRef = useRef(value);

  useEffect(() => {
    if (!isEditing) setDraftValue(value);
  }, [isEditing, value]);

  // Returning a fragment here is deliberate: ordinary previews and exports must
  // not receive an extra inline box that could change wrapping or pagination.
  if (!edit?.enabled) return <Fragment>{children ?? value}</Fragment>;

  const beginEditing = () => {
    entryValueRef.current = value;
    setDraftValue(value);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftValue(entryValueRef.current);
    setIsEditing(false);
  };

  const commitEditing = () => {
    setIsEditing(false);
    if (draftValue !== entryValueRef.current) edit.updateField(source, draftValue);
  };

  if (isEditing) {
    const commonProps = {
      autoFocus: true,
      value: draftValue,
      'aria-label': source.label,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraftValue(event.target.value),
      onBlur: commitEditing,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelEditing();
          return;
        }
        if (event.key === 'Enter' && source.kind !== 'multiline' && source.kind !== 'rich-text') {
          event.preventDefault();
          commitEditing();
        }
      },
      className: 'min-w-[2ch] max-w-full rounded-sm bg-white/95 px-0.5 font-inherit text-inherit text-current outline outline-2 outline-offset-1 outline-brand',
      style: { font: 'inherit', lineHeight: 'inherit', color: 'inherit' },
    };
    if (source.kind === 'multiline' || source.kind === 'rich-text') {
      return <textarea {...commonProps} rows={Math.max(2, draftValue.split('\n').length)} />;
    }
    return <input {...commonProps} type={source.kind === 'url' ? 'url' : 'text'} />;
  }

  const path = [source.sectionId, source.itemId, ...source.fieldPath].filter((part) => part !== undefined).join('.');
  const emptyLabel = edit.emptyLabel ?? 'Add field';
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={value ? source.label : `${source.label}: ${emptyLabel}`}
      data-editable-source={path}
      onClick={beginEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          beginEditing();
        }
      }}
      className="cursor-text rounded-sm outline-none hover:bg-brand-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      {value ? (children ?? value) : <span className="text-zinc-400 print:hidden">{emptyLabel}</span>}
    </span>
  );
}
