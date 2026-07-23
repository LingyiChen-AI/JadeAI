// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { useResumeStore } from '@/stores/resume-store';
import type { Resume, ResumeSection } from '@/types/resume';
import { DraftSectionEditor } from './draft-section-editor';

const messages = {
  editor: { fields: {
    fullName: 'Full name', jobTitle: 'Job title', age: 'Age', gender: 'Gender', genderOptions: 'Female,Male',
    politicalStatus: 'Political status', politicalStatusOptions: 'None', ethnicity: 'Ethnicity', ethnicityOptions: 'None',
    hometown: 'Hometown', maritalStatus: 'Marital status', maritalStatusOptions: 'None', yearsOfExperience: 'Years',
    educationLevel: 'Education', educationLevelOptions: 'None', email: 'Email', phone: 'Phone', wechat: 'WeChat',
    location: 'Location', website: 'Website', qrAutoGenerate: 'Detect links', qrLabel: 'Label', qrUrl: 'URL',
    qrUrlInvalid: 'Invalid URL', qrAdd: 'Add QR', clear: 'Clear',
  } },
  themeEditor: { avatarCircle: 'Circle', avatarOneInch: 'Portrait' },
};

function section(type: string, content: Record<string, unknown>): ResumeSection {
  return {
    id: `${type}-1`, resumeId: 'draft-1', type, title: type, sortOrder: 0, visible: true,
    content: content as unknown as ResumeSection['content'], createdAt: new Date(), updatedAt: new Date(),
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;
}

describe('DraftSectionEditor controlled adapters', () => {
  beforeEach(() => {
    useResumeStore.getState().reset();
  });

  it('edits personal information without reading or scheduling the formal resume store', () => {
    const formal = { id: 'formal-1', themeConfig: { avatarStyle: 'circle' } } as Resume;
    useResumeStore.setState({ currentResume: formal, isDirty: false });
    const scheduleSave = vi.spyOn(useResumeStore.getState(), '_scheduleSave');
    const onUpdate = vi.fn();
    const onThemeChange = vi.fn();
    render(
      <DraftSectionEditor
        section={section('personal_info', { fullName: 'Draft Name', jobTitle: '', email: '', phone: '', location: '' })}
        draftSections={[]}
        themeConfig={{ primaryColor: '#111', accentColor: '#222', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 1.5, sectionSpacing: 6, margin: { top: 1, right: 1, bottom: 1, left: 1 }, avatarStyle: 'oneInch' }}
        onThemeChange={onThemeChange}
        onUpdate={onUpdate}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'Draft Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Circle' }));

    expect(onUpdate).toHaveBeenCalledWith({ fullName: 'Draft Edited' });
    expect(onThemeChange).toHaveBeenCalledWith({ avatarStyle: 'circle' });
    expect(scheduleSave).not.toHaveBeenCalled();
    expect(useResumeStore.getState().currentResume).toBe(formal);
    expect(useResumeStore.getState().isDirty).toBe(false);
  });

  it('detects QR links from the workbench draft instead of the formal store', () => {
    const formalPersonal = section('personal_info', { fullName: 'Formal', website: 'formal.example.com' });
    useResumeStore.setState({ currentResume: { sections: [formalPersonal] } as Resume });
    const draftPersonal = section('personal_info', { fullName: 'Draft', website: 'draft.example.com' });
    const qr = section('qr_codes', { items: [] });
    const onUpdate = vi.fn();
    render(
      <DraftSectionEditor section={qr} draftSections={[draftPersonal, qr]} onUpdate={onUpdate} />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: /Detect links/ }));

    expect(onUpdate).toHaveBeenCalledWith({
      items: [expect.objectContaining({ url: 'https://draft.example.com' })],
    });
    expect(onUpdate).not.toHaveBeenCalledWith({
      items: [expect.objectContaining({ url: 'https://formal.example.com' })],
    });
  });
});
