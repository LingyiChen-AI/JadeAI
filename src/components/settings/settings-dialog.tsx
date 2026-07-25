'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { Settings, Cpu, Paintbrush, PenTool, Eye, EyeOff, Sun, Moon, Monitor, ChevronsUpDown, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore, getAIHeaders, type AIProvider } from '@/stores/settings-store';
import { useTourStore } from '@/stores/tour-store';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, localeNames } from '@/i18n/config';
import { cn } from '@/lib/utils';

const AI_PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
];

export function SettingsDialog() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme: currentTheme, setTheme } = useTheme();
  const { activeModal, closeModal, settingsTab, setSettingsTab } = useUIStore();
  const {
    aiProvider,
    aiApiKey,
    aiBaseURL,
    aiModel,
    autoSave,
    autoSaveInterval,
    setAIProvider,
    setAIApiKey,
    setAIBaseURL,
    setAIModel,
    setAutoSave,
    setAutoSaveInterval,
    hydrate,
    _hydrated,
  } = useSettingsStore();

  const startTour = useTourStore((s) => s.startTour);
  const [showApiKey, setShowApiKey] = useState(false);
  const isOpen = activeModal === 'settings';

  // Model combobox state
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [modelsError, setModelsError] = useState<'missing-api-key' | 'fetch' | null>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !_hydrated) {
      hydrate();
    }
  }, [isOpen, _hydrated, hydrate]);

  // Fetch models when combobox opens or when apiKey/baseURL changes
  const fetchModels = useCallback(async () => {
    setModelsFetching(true);
    setModelsError(null);
    if (!aiApiKey.trim()) {
      setFetchedModels([]);
      setModelsFetched(true);
      setModelsError('missing-api-key');
      setModelsFetching(false);
      return;
    }

    try {
      const res = await fetch('/api/ai/models', { headers: getAIHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch models');
      const ids = (data.models || []).map((m: { id: string }) => m.id);
      setFetchedModels(ids);
      setModelsFetched(true);
    } catch {
      setFetchedModels([]);
      setModelsFetched(true);
      setModelsError('fetch');
    } finally {
      setModelsFetching(false);
    }
  }, [aiApiKey]);

  // Re-fetch models when apiKey or baseURL changes
  const prevKeyRef = useRef(aiApiKey);
  const prevUrlRef = useRef(aiBaseURL);
  useEffect(() => {
    if (prevKeyRef.current !== aiApiKey || prevUrlRef.current !== aiBaseURL) {
      prevKeyRef.current = aiApiKey;
      prevUrlRef.current = aiBaseURL;
      setModelsFetched(false);
      setFetchedModels([]);
      setModelsError(null);
    }
  }, [aiApiKey, aiBaseURL]);

  useEffect(() => {
    if (modelOpen && !modelsFetched && !modelsFetching) {
      fetchModels();
    }
  }, [modelOpen, modelsFetched, modelsFetching, fetchModels]);

  // Focus search input when popover opens
  useEffect(() => {
    if (modelOpen) {
      setTimeout(() => modelSearchRef.current?.focus(), 50);
    } else {
      setModelSearch('');
    }
  }, [modelOpen]);

  const filteredModels = fetchedModels.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleLocaleChange = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  const handleThemeChange = (theme: string) => {
    setTheme(theme);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-zinc-500" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="mt-4">
          <div className="px-6">
            <TabsList className="w-full">
              <TabsTrigger value="ai" className="flex-1 gap-1.5 cursor-pointer">
                <Cpu className="h-3.5 w-3.5" />
                {t('ai.title')}
              </TabsTrigger>
              <TabsTrigger value="appearance" className="flex-1 gap-1.5 cursor-pointer">
                <Paintbrush className="h-3.5 w-3.5" />
                {t('appearance.title')}
              </TabsTrigger>
              <TabsTrigger value="editor" className="flex-1 gap-1.5 cursor-pointer">
                <PenTool className="h-3.5 w-3.5" />
                {t('editorTab.title')}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* AI Configuration Tab */}
          <TabsContent value="ai" className="px-6 pb-6 pt-4 space-y-5">
            {/* Provider */}
            <div className="space-y-2">
              <Label>{t('ai.provider')}</Label>
              <Select value={aiProvider} onValueChange={(v) => setAIProvider(v as AIProvider)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label>{t('ai.apiKey')}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={aiApiKey}
                  onChange={(e) => setAIApiKey(e.target.value)}
                  placeholder={t('ai.apiKeyPlaceholder')}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-zinc-400">{t('ai.apiKeyHint')}</p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label>{t('ai.baseURL')}</Label>
              <Input
                value={aiBaseURL}
                onChange={(e) => setAIBaseURL(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            {/* Model — Combobox */}
            <div className="space-y-2">
              <Label>{t('ai.model')}</Label>
              <Popover open={modelOpen} onOpenChange={setModelOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelOpen}
                    className="w-full justify-between cursor-pointer font-normal"
                  >
                    <span className="truncate">{aiModel || t('ai.modelPlaceholder')}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  {/* Search input */}
                  <div className="border-b px-3 py-2">
                    <Input
                      ref={modelSearchRef}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder={tCommon('search')}
                      className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                  </div>

                  {/* Model list */}
                  <div className="max-h-48 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
                    {modelsFetching && (
                      <div className="flex items-center justify-center py-4 text-sm text-zinc-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {tCommon('loading')}
                      </div>
                    )}

                    {!modelsFetching && modelsError === 'missing-api-key' && (
                      <div className="px-2 py-3 text-center text-xs text-amber-600 dark:text-amber-400">
                        {t('ai.modelsMissingApiKey')}
                      </div>
                    )}

                    {!modelsFetching && modelsError === 'fetch' && (
                      <div className="px-2 py-3 text-center text-xs text-red-500">
                        {t('ai.modelsFetchError')}
                      </div>
                    )}

                    {!modelsFetching && !modelsError && filteredModels.length === 0 && modelsFetched && (
                      <div className="py-3 text-center text-xs text-zinc-400">
                        {t('ai.noModelsFound')}
                      </div>
                    )}

                    {filteredModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={cn(
                          'flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                          aiModel === m && 'bg-zinc-100 dark:bg-zinc-800'
                        )}
                        onClick={() => {
                          setAIModel(m);
                          setModelOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', aiModel === m ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{m}</span>
                      </button>
                    ))}
                  </div>

                  {/* Manual entry */}
                  <div className="border-t px-3 py-2">
                    <Input
                      value={aiModel}
                      onChange={(e) => setAIModel(e.target.value)}
                      placeholder={t('ai.modelPlaceholder')}
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setModelOpen(false);
                      }}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="px-6 pb-6 pt-4 space-y-5">
            {/* Theme */}
            <div className="space-y-3">
              <Label>{t('appearance.theme')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'light', icon: Sun, label: t('appearance.themeLight') },
                  { value: 'dark', icon: Moon, label: t('appearance.themeDark') },
                  { value: 'system', icon: Monitor, label: t('appearance.themeSystem') },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleThemeChange(value)}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                      currentTheme === value
                        ? 'border-zinc-900 bg-zinc-50 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-600'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Language */}
            <div className="space-y-2">
              <Label>{t('appearance.language')}</Label>
              <Select value={locale} onValueChange={handleLocaleChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {localeNames[loc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Editor Tab */}
          <TabsContent value="editor" className="px-6 pb-6 pt-4 space-y-5">
            {/* Auto Save */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('editorTab.autoSave')}</Label>
                <p className="text-xs text-zinc-400">{t('editorTab.autoSaveDescription')}</p>
              </div>
              <Switch
                checked={autoSave}
                onCheckedChange={setAutoSave}
              />
            </div>

            <Separator />

            {/* Auto Save Interval */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('editorTab.autoSaveInterval')}</Label>
                <span className="text-sm text-zinc-500">
                  {(autoSaveInterval / 1000).toFixed(1)}s
                </span>
              </div>
              <Slider
                value={[autoSaveInterval]}
                onValueChange={([v]) => setAutoSaveInterval(v)}
                min={300}
                max={5000}
                step={100}
                disabled={!autoSave}
              />
              <div className="flex justify-between text-xs text-zinc-400">
                <span>0.3s</span>
                <span>5.0s</span>
              </div>
            </div>
            <Separator />

            {/* Restart Tour */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('editorTab.restartTour')}</Label>
                <p className="text-xs text-zinc-400">{t('editorTab.restartTourDescription')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  closeModal();
                  setTimeout(() => startTour('editor', 5), 300);
                }}
              >
                {t('editorTab.restartTour')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
