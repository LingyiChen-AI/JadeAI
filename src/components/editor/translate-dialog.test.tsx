import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import * as translateModule from './translate-dialog';

const section = {
  id: 'section-1',
  resumeId: 'resume-1',
  type: 'summary' as const,
  title: 'Summary',
  content: { text: 'Before' },
  sortOrder: 0,
  visible: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function writer() {
  return {
    appendHistory: vi.fn().mockResolvedValue(undefined),
    mergeChanges: vi.fn(),
    onPersistenceError: vi.fn(),
  };
}

describe('overwrite translation history', () => {
  it('keeps the server revision returned by an overwrite translation', () => {
    const { mergeOverwriteTranslationResume } = translateModule;
    const current = {
      id: 'resume-1',
      userId: 'user-1',
      title: 'Resume',
      template: 'classic',
      language: 'zh',
      themeConfig: {
        primaryColor: '#000000',
        accentColor: '#ffffff',
        fontFamily: 'sans',
        fontSize: 'medium',
        lineSpacing: 1,
        margin: { top: 1, right: 1, bottom: 1, left: 1 },
        sectionSpacing: 1,
      },
      revision: 3,
      isDefault: false,
      sections: [section],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    expect(mergeOverwriteTranslationResume(
      current,
      [{ ...section, content: { text: 'After' } }],
      'en',
      4,
    )).toMatchObject({ revision: 4, language: 'en' });
  });

  it('records a changed overwrite translation', async () => {
    const { recordOverwriteTranslationHistory } = translateModule;
    const target = writer();

    await recordOverwriteTranslationHistory({
      resumeId: 'resume-1',
      userId: 'user-1',
      serverRevision: 7,
      baseline: [section],
      translatedSections: [{ ...section, content: { text: 'After' } }],
    }, target);

    expect(target.appendHistory).toHaveBeenCalledWith(expect.objectContaining({
      source: 'overwrite-translation',
      serverRevision: 7,
    }));
  });

  it('skips copy mode without an overwrite baseline and unchanged output', async () => {
    const { recordOverwriteTranslationHistory } = translateModule;
    const target = writer();

    await recordOverwriteTranslationHistory({
      resumeId: 'resume-1', userId: 'user-1', serverRevision: 7,
      baseline: null, translatedSections: [{ ...section, content: { text: 'After' } }],
    }, target);
    await recordOverwriteTranslationHistory({
      resumeId: 'resume-1', userId: 'user-1', serverRevision: 7,
      baseline: [section], translatedSections: [section],
    }, target);

    expect(target.appendHistory).not.toHaveBeenCalled();
    expect(target.mergeChanges).not.toHaveBeenCalled();
  });
});
