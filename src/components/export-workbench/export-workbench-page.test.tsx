// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types/resume';
import { ExportWorkbenchPage } from './export-workbench-page';

const mocks = vi.hoisted(() => ({
  reorderSections: vi.fn(),
  updateSectionContent: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/button', () => ({
  Button: (props: ComponentProps<'button'> & { variant?: string; size?: string }) => {
    const { children, variant, size, ...buttonProps } = props;
    void variant;
    void size;
    return <button {...buttonProps}>{children}</button>;
  },
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/preview/preview-error-boundary', () => ({ PreviewErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/preview/resume-preview', () => ({ ResumePreview: () => <div>preview</div> }));
vi.mock('@/components/editor/theme-editor', () => ({ ThemeEditor: () => <div>theme</div> }));
vi.mock('./draft-section-editor', () => ({ DraftSectionEditor: () => <div>editor</div> }));

function draft(): Resume {
  const now = new Date();
  return {
    id: 'resume-1', userId: 'user-1', title: 'Resume', template: 'classic', revision: 2,
    templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    themeConfig: { primaryColor: '#111', accentColor: '#222', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 1.5, sectionSpacing: 6, margin: { top: 12, right: 12, bottom: 12, left: 12 } },
    isDefault: false, language: 'en', createdAt: now, updatedAt: now,
    sections: [
      { id: 'personal-1', resumeId: 'resume-1', type: 'personal_info', title: 'Profile', sortOrder: 0, visible: true, content: { fullName: 'Alex', jobTitle: '', email: '', phone: '', location: '' }, createdAt: now, updatedAt: now },
      { id: 'work-1', resumeId: 'resume-1', type: 'work_experience', title: 'Work', sortOrder: 1, visible: true, content: { items: [
        { id: 'job-1', company: 'First', position: '', startDate: '', endDate: null, current: true, description: '', technologies: [], highlights: [] },
        { id: 'job-2', company: 'Second', position: '', startDate: '', endDate: null, current: true, description: '', technologies: [], highlights: [] },
      ] }, createdAt: now, updatedAt: now },
    ],
  };
}

vi.mock('./use-export-workbench', () => ({
  useExportWorkbench: () => ({
    draft: draft(), session: null, isLoading: false, loadError: null, isDirty: false, format: 'pdf',
    setFormat: vi.fn(), transactionState: { status: 'idle' }, isSubmitting: false,
    updateField: vi.fn(), updateTheme: vi.fn(), updateSectionContent: mocks.updateSectionContent,
    addSection: vi.fn(), removeSection: vi.fn(), reorderSections: mocks.reorderSections,
    toggleSectionVisibility: vi.fn(), selectTemplate: vi.fn(), historyBackRequested: false,
    clearHistoryBackRequest: vi.fn(), primaryAction: vi.fn(),
  }),
}));

describe('ExportWorkbenchPage mobile controls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses dynamic viewport height and keeps module and entry actions touch-sized on mobile', () => {
    render(<ExportWorkbenchPage resumeId="resume-1" />);

    expect(screen.getByTestId('export-workbench-page').className).toContain('h-dvh');
    const moveDown = screen.getAllByRole('button', { name: 'moveDown' })[0];
    expect(moveDown.className).toContain('h-11');
    expect(moveDown.className).toContain('w-11');
    expect(moveDown.className).toContain('md:h-6');
    fireEvent.click(moveDown);
    expect(mocks.reorderSections).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'work-1' }),
      expect.objectContaining({ id: 'personal-1' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    const moveEntryDown = screen.getAllByRole('button', { name: 'moveEntryDown' })[0];
    expect(moveEntryDown.className).toContain('h-11');
    fireEvent.click(moveEntryDown);
    expect(mocks.updateSectionContent).toHaveBeenCalledWith('work-1', {
      items: [expect.objectContaining({ id: 'job-2' }), expect.objectContaining({ id: 'job-1' })],
    });
  });
});
