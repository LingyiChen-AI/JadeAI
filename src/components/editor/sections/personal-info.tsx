'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, X, Circle, RectangleVertical } from 'lucide-react';
import { EditableText } from '../fields/editable-text';
import { EditableSelect } from '../fields/editable-select';
import { FieldWrapper } from '../fields/field-wrapper';
import { useResumeStore } from '@/stores/resume-store';
import type { ResumeSection, PersonalInfoContent } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<PersonalInfoContent>) => void;
}

interface PersonalInfoFieldsProps extends Props {
  avatarStyle: 'circle' | 'oneInch';
  onAvatarStyleChange: (style: 'circle' | 'oneInch') => void;
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PersonalInfoFields({
  section,
  onUpdate,
  avatarStyle,
  onAvatarStyleChange,
}: PersonalInfoFieldsProps) {
  const t = useTranslations('editor.fields');
  const tTheme = useTranslations('themeEditor');
  const content = section.content as PersonalInfoContent;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file, 200);
    onUpdate({ avatar: dataUrl });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Avatar upload + style toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
        >
          {content.avatar ? (
            <img src={content.avatar} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-6 w-6 text-zinc-400" />
          )}
        </button>
        <div className="flex flex-col gap-2">
          {/* Segmented shape toggle */}
          <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
            {([
              { value: 'circle' as const, icon: Circle, label: tTheme('avatarCircle') },
              { value: 'oneInch' as const, icon: RectangleVertical, label: tTheme('avatarOneInch') },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onAvatarStyleChange(value)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all duration-200 ${
                  avatarStyle === value
                    ? 'bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          {/* Remove avatar */}
          {content.avatar && (
            <button
              type="button"
              onClick={() => onUpdate({ avatar: '' })}
              className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
              {t('clear')}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
      </div>

      <FieldWrapper>
        <EditableText label={t('fullName')} value={content.fullName} onChange={(v) => onUpdate({ fullName: v })} changePath="content.fullName" />
        <EditableText label={t('jobTitle')} value={content.jobTitle} onChange={(v) => onUpdate({ jobTitle: v })} changePath="content.jobTitle" />
      </FieldWrapper>
      <FieldWrapper>
        <EditableText label={t('age')} value={content.age || ''} onChange={(v) => onUpdate({ age: v })} changePath="content.age" />
        <EditableSelect
          label={t('gender')}
          value={content.gender || ''}
          onChange={(v) => onUpdate({ gender: v })}
          options={t('genderOptions').split(',').map((s) => ({ label: s, value: s }))}
          changePath="content.gender"
        />
      </FieldWrapper>
      <FieldWrapper>
        <EditableSelect
          label={t('politicalStatus')}
          value={content.politicalStatus || ''}
          onChange={(v) => onUpdate({ politicalStatus: v })}
          options={t('politicalStatusOptions').split(',').map((s) => ({ label: s, value: s }))}
          changePath="content.politicalStatus"
        />
        <EditableSelect
          label={t('ethnicity')}
          value={content.ethnicity || ''}
          onChange={(v) => onUpdate({ ethnicity: v })}
          options={t('ethnicityOptions').split(',').map((s) => ({ label: s, value: s }))}
          changePath="content.ethnicity"
        />
      </FieldWrapper>
      <FieldWrapper>
        <EditableText label={t('hometown')} value={content.hometown || ''} onChange={(v) => onUpdate({ hometown: v })} changePath="content.hometown" />
        <EditableSelect
          label={t('maritalStatus')}
          value={content.maritalStatus || ''}
          onChange={(v) => onUpdate({ maritalStatus: v })}
          options={t('maritalStatusOptions').split(',').map((s) => ({ label: s, value: s }))}
          changePath="content.maritalStatus"
        />
      </FieldWrapper>
      <FieldWrapper>
        <EditableText label={t('yearsOfExperience')} value={content.yearsOfExperience || ''} onChange={(v) => onUpdate({ yearsOfExperience: v })} changePath="content.yearsOfExperience" />
        <EditableSelect
          label={t('educationLevel')}
          value={content.educationLevel || ''}
          onChange={(v) => onUpdate({ educationLevel: v })}
          options={t('educationLevelOptions').split(',').map((s) => ({ label: s, value: s }))}
          changePath="content.educationLevel"
        />
      </FieldWrapper>
      <FieldWrapper>
        <EditableText label={t('email')} value={content.email} onChange={(v) => onUpdate({ email: v })} type="email" changePath="content.email" />
        <EditableText label={t('phone')} value={content.phone} onChange={(v) => onUpdate({ phone: v })} type="tel" changePath="content.phone" />
      </FieldWrapper>
      <FieldWrapper>
        <EditableText label={t('wechat')} value={content.wechat || ''} onChange={(v) => onUpdate({ wechat: v })} changePath="content.wechat" />
        <EditableText label={t('location')} value={content.location} onChange={(v) => onUpdate({ location: v })} changePath="content.location" />
      </FieldWrapper>
      <FieldWrapper>
        <EditableText label={t('website')} value={content.website || ''} onChange={(v) => onUpdate({ website: v })} changePath="content.website" />
      </FieldWrapper>

    </div>
  );
}

export function PersonalInfoSection({ section, onUpdate }: Props) {
  const { currentResume } = useResumeStore();
  const avatarStyle = currentResume?.themeConfig?.avatarStyle || 'oneInch';

  const updateAvatarStyle = (style: 'circle' | 'oneInch') => {
    if (!currentResume) return;
    const newConfig = { ...currentResume.themeConfig, avatarStyle: style };
    useResumeStore.setState((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, themeConfig: newConfig }
        : null,
      isDirty: true,
    }));
    useResumeStore.getState()._scheduleSave();
  };

  return (
    <PersonalInfoFields
      section={section}
      onUpdate={onUpdate}
      avatarStyle={avatarStyle}
      onAvatarStyleChange={updateAvatarStyle}
    />
  );
}
