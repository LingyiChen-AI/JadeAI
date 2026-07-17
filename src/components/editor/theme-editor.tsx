'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Palette,
  Type,
  Space,
  Sparkles,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useResumeStore } from '@/stores/resume-store';
import { TemplateSelector } from '@/components/templates/template-selector';
import type { ClientTemplateBindingChoice } from '@/lib/templates/apply-template-binding.server';
import { selectedTemplateBinding, shouldApplyTemplateSelection } from '@/lib/templates/apply-template-binding.server';
import { resolvePublicTemplateDetail } from '@/lib/templates/resolve-template';
import { TemplateVersionDetailSchema } from '@/lib/templates/schema';
import type { ThemeConfig } from '@/types/resume';

// -- Preset Themes --

interface PresetTheme {
  id: string;
  colors: [string, string, string, string];
  config: ThemeConfig;
}

const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'classic',
    colors: ['#1a1a1a', '#3b82f6', '#ffffff', '#374151'],
    config: {
      primaryColor: '#1a1a1a',
      accentColor: '#3b82f6',
      fontFamily: 'Georgia',
      fontSize: 'medium',
      lineSpacing: 1.5,
      margin: { top: 24, right: 24, bottom: 24, left: 24 },
      sectionSpacing: 16,
    },
  },
  {
    id: 'modern',
    colors: ['#0f172a', '#6366f1', '#f8fafc', '#475569'],
    config: {
      primaryColor: '#0f172a',
      accentColor: '#6366f1',
      fontFamily: 'Inter',
      fontSize: 'medium',
      lineSpacing: 1.6,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      sectionSpacing: 14,
    },
  },
  {
    id: 'minimal',
    colors: ['#27272a', '#a1a1aa', '#ffffff', '#52525b'],
    config: {
      primaryColor: '#27272a',
      accentColor: '#a1a1aa',
      fontFamily: 'Helvetica',
      fontSize: 'small',
      lineSpacing: 1.4,
      margin: { top: 28, right: 28, bottom: 28, left: 28 },
      sectionSpacing: 12,
    },
  },
  {
    id: 'elegant',
    colors: ['#1c1917', '#b45309', '#fffbeb', '#57534e'],
    config: {
      primaryColor: '#1c1917',
      accentColor: '#b45309',
      fontFamily: 'Palatino',
      fontSize: 'medium',
      lineSpacing: 1.6,
      margin: { top: 26, right: 26, bottom: 26, left: 26 },
      sectionSpacing: 18,
    },
  },
  {
    id: 'bold',
    colors: ['#020617', '#e11d48', '#fff1f2', '#334155'],
    config: {
      primaryColor: '#020617',
      accentColor: '#e11d48',
      fontFamily: 'Arial',
      fontSize: 'large',
      lineSpacing: 1.5,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      sectionSpacing: 16,
    },
  },
  {
    id: 'creative',
    colors: ['#134e4a', '#0d9488', '#f0fdfa', '#115e59'],
    config: {
      primaryColor: '#134e4a',
      accentColor: '#0d9488',
      fontFamily: 'Verdana',
      fontSize: 'medium',
      lineSpacing: 1.5,
      margin: { top: 22, right: 22, bottom: 22, left: 22 },
      sectionSpacing: 14,
    },
  },
  {
    id: 'mint',
    colors: ['#0A1F44', '#00C897', '#F5FBFA', '#334155'],
    config: {
      primaryColor: '#0A1F44',
      accentColor: '#00C897',
      fontFamily: 'Inter',
      fontSize: 'medium',
      lineSpacing: 1.55,
      margin: { top: 22, right: 22, bottom: 22, left: 22 },
      sectionSpacing: 15,
    },
  },
];

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#1a1a1a',
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontSize: 'medium',
  lineSpacing: 1.5,
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  sectionSpacing: 16,
  avatarStyle: 'oneInch',
};

const FONT_OPTIONS = [
  'Inter',
  'Georgia',
  'Helvetica',
  'Arial',
  'Palatino',
  'Verdana',
  'Times New Roman',
  'Garamond',
  'Courier New',
];

const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '' },
  { value: 'medium', label: '' },
  { value: 'large', label: '' },
];

// -- Color Picker Component --

function ColorPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-zinc-600 dark:text-zinc-400">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-2 py-1 text-xs transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
          >
            <div
              className="h-4 w-4 rounded-sm border border-zinc-200"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-zinc-500">{value}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <div className="space-y-3">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-full cursor-pointer rounded border-0 p-0"
            />
            <Input
              value={value}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                  onChange(v);
                }
              }}
              placeholder="#000000"
              className="font-mono text-xs"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// -- Collapsible Section --

function ThemeSection({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer items-center gap-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3.5 w-3.5" />
        <span>{title}</span>
      </button>
      {isOpen && <div className="space-y-3 pb-3 pl-5">{children}</div>}
    </div>
  );
}

// -- Main Theme Editor --

interface ThemeEditorProps {
  onClose?: () => void;
}

export function ThemeEditor({ onClose }: ThemeEditorProps) {
  const t = useTranslations('themeEditor');
  const templatesT = useTranslations('templates');
  const { currentResume, pendingTemplateBinding } = useResumeStore();
  const templateRequestSequence = useRef(0);

  useEffect(() => () => {
    templateRequestSequence.current += 1;
  }, []);

  const themeConfig: ThemeConfig = {
    ...DEFAULT_THEME,
    ...(currentResume?.themeConfig || {}),
  };

  const updateTheme = useCallback(
    (updates: Partial<ThemeConfig>) => {
      if (!currentResume) return;
      const newConfig = { ...themeConfig, ...updates };
      useResumeStore.setState((state) => ({
        currentResume: state.currentResume
          ? { ...state.currentResume, themeConfig: newConfig }
          : null,
        isDirty: true,
      }));
      // Trigger autosave
      useResumeStore.getState()._scheduleSave();
    },
    [currentResume, themeConfig]
  );

  const applyPreset = useCallback(
    (preset: PresetTheme) => {
      updateTheme(preset.config);
    },
    [updateTheme]
  );

  const resetTheme = useCallback(() => {
    updateTheme(DEFAULT_THEME);
  }, [updateTheme]);

  const selectedBinding = pendingTemplateBinding ?? selectedTemplateBinding(currentResume);

  const selectTemplate = useCallback(async (choice: ClientTemplateBindingChoice) => {
    const requestedResumeId = useResumeStore.getState().currentResume?.id;
    if (!requestedResumeId) return;
    const requestSequence = ++templateRequestSequence.current;
    if (choice.kind !== 'public') {
      useResumeStore.getState().setTemplateBinding(choice);
      return;
    }
    try {
      const response = await fetch(`/api/templates/${choice.templateSlug}/versions/${choice.version}`);
      if (!response.ok) throw new Error('template_version_request_failed');
      const detail = TemplateVersionDetailSchema.parse(await response.json());
      if (detail.slug !== choice.templateSlug || detail.version.version !== choice.version) {
        throw new Error('template_version_response_mismatch');
      }
      const resolution = resolvePublicTemplateDetail(detail);
      if (!shouldApplyTemplateSelection(
        requestSequence,
        templateRequestSequence.current,
        requestedResumeId,
        useResumeStore.getState().currentResume?.id,
      )) return;
      useResumeStore.getState().setTemplateBinding(choice, resolution);
    } catch {
      if (shouldApplyTemplateSelection(
        requestSequence,
        templateRequestSequence.current,
        requestedResumeId,
        useResumeStore.getState().currentResume?.id,
      )) toast.error(templatesT('states.error'));
    }
  }, [templatesT]);

  // Build font size label dynamically
  const fontSizeLabels: Record<string, string> = {
    small: t('fontSize.small'),
    medium: t('fontSize.medium'),
    large: t('fontSize.large'),
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l bg-white dark:bg-zinc-900 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 dark:border-zinc-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <Palette className="h-4 w-4 text-zinc-500" />
          {t('title')}
        </h3>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={resetTheme}
          title={t('reset')}
          className="cursor-pointer text-zinc-400 hover:text-zinc-600"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-1">
          {/* Template Switcher */}
          <ThemeSection icon={LayoutGrid} title={t('templateSection')} defaultOpen={false}>
            <TemplateSelector
              value={selectedBinding}
              disabled={!currentResume}
              onChange={(choice) => void selectTemplate(choice)}
            />
          </ThemeSection>

          <Separator />

          {/* Preset Themes */}
          <ThemeSection icon={Sparkles} title={t('presets')}>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_THEMES.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="group flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-zinc-200 p-2 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-700 dark:hover:border-zinc-500"
                  title={t(`preset.${preset.id}`)}
                >
                  <div className="flex gap-0.5">
                    {preset.colors.map((color, i) => (
                      <div
                        key={i}
                        className="h-3 w-3 rounded-full border border-zinc-200"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200">
                    {t(`preset.${preset.id}`)}
                  </span>
                </button>
              ))}
            </div>
          </ThemeSection>

          <Separator />

          {/* Colors */}
          <ThemeSection icon={Palette} title={t('colors')}>
            <ColorPickerField
              label={t('primaryColor')}
              value={themeConfig.primaryColor}
              onChange={(color) => updateTheme({ primaryColor: color })}
            />
            <ColorPickerField
              label={t('accentColor')}
              value={themeConfig.accentColor}
              onChange={(color) => updateTheme({ accentColor: color })}
            />
          </ThemeSection>

          <Separator />

          {/* Typography */}
          <ThemeSection icon={Type} title={t('typography')}>
            {/* Header Font */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t('fontFamily')}</Label>
              <Select
                value={themeConfig.fontFamily}
                onValueChange={(v) => updateTheme({ fontFamily: v })}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font} value={font}>
                      <span style={{ fontFamily: font }}>{font}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t('fontSizeLabel')}</Label>
              <div className="grid grid-cols-3 gap-1">
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateTheme({ fontSize: opt.value })}
                    className={`cursor-pointer rounded-md border px-2 py-1 text-xs transition-all ${
                      themeConfig.fontSize === opt.value
                        ? 'border-zinc-900 bg-zinc-50 font-medium text-zinc-900 dark:border-zinc-400 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    {fontSizeLabels[opt.value]}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Spacing */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t('lineSpacing')}</Label>
                <span className="text-xs text-zinc-400">{themeConfig.lineSpacing.toFixed(1)}</span>
              </div>
              <Slider
                value={[themeConfig.lineSpacing]}
                onValueChange={([v]) => updateTheme({ lineSpacing: v })}
                min={1.0}
                max={2.5}
                step={0.1}
              />
            </div>
          </ThemeSection>

          <Separator />

          {/* Spacing */}
          <ThemeSection icon={Space} title={t('spacing')}>
            {/* Section Spacing */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t('sectionSpacing')}</Label>
                <span className="text-xs text-zinc-400">{themeConfig.sectionSpacing}px</span>
              </div>
              <Slider
                value={[themeConfig.sectionSpacing]}
                onValueChange={([v]) => updateTheme({ sectionSpacing: v })}
                min={4}
                max={32}
                step={2}
              />
            </div>

            {/* Page Margin */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t('pageMargin')}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                  <div key={side} className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 block text-center">{t(`margin.${side}`)}</span>
                    <Input
                      type="number"
                      value={themeConfig.margin[side]}
                      onChange={(e) =>
                        updateTheme({
                          margin: {
                            ...themeConfig.margin,
                            [side]: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                          },
                        })
                      }
                      min={0}
                      max={60}
                      className="h-7 text-xs text-center px-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </ThemeSection>
        </div>
      </ScrollArea>
    </div>
  );
}
