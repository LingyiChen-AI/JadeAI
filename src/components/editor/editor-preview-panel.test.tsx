/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { Resume } from '@/types/resume';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }));
vi.mock('@/components/preview/resume-preview', () => ({
  ResumePreview: ({ resume, placeholderPaths }: { resume: Resume; placeholderPaths?: ReadonlySet<string> }) => (
    <div
      data-testid="resume-preview"
      data-resume-name={(resume.sections[0]?.content as { fullName?: string }).fullName}
      data-placeholder-count={placeholderPaths?.size ?? 0}
    />
  ),
}));

import { useResumeStore } from '@/stores/resume-store';
import { EditorPreviewPanel } from './editor-preview-panel';

const NOW = new Date('2025-01-01T00:00:00.000Z');

function blankResume(): Resume {
  return {
    id: 'resume-1', userId: 'user-1', title: 'Real resume', template: 'classic',
    themeConfig: { primaryColor: '#111111', accentColor: '#2563eb', fontFamily: 'Inter', fontSize: 'medium', lineSpacing: 1.5, margin: { top: 20, right: 20, bottom: 20, left: 20 }, sectionSpacing: 16 },
    isDefault: false, language: 'zh', revision: 1, templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    sections: [{
      id: 'personal', resumeId: 'resume-1', type: 'personal_info', title: '个人信息', sortOrder: 0, visible: true,
      content: { fullName: '', jobTitle: '', email: '', phone: '', location: '' }, createdAt: NOW, updatedAt: NOW,
    }],
    createdAt: NOW, updatedAt: NOW,
  };
}

afterEach(() => {
  cleanup();
  useResumeStore.getState().reset();
  vi.unstubAllGlobals();
});

describe('EditorPreviewPanel', () => {
  test('shows derived samples while preserving the real store and save payload', async () => {
    const real = blankResume();
    useResumeStore.getState().setResume(real);
    useResumeStore.setState({ isDirty: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => real });
    vi.stubGlobal('fetch', fetchMock);

    render(<EditorPreviewPanel />);

    expect(screen.getByText('samplePreview')).toBeTruthy();
    expect(screen.getByTestId('resume-preview').getAttribute('data-resume-name')).toBe('陈曦');
    expect(screen.getByTestId('resume-preview').getAttribute('data-placeholder-count')).toBe('5');
    expect(useResumeStore.getState().currentResume?.sections[0].content).toMatchObject({ fullName: '' });

    await useResumeStore.getState().save();

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.sections[0].content).toMatchObject({ fullName: '', jobTitle: '', email: '', phone: '', location: '' });
    expect(JSON.stringify(body)).not.toContain('陈曦');
  });
});
