'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  type OrcaCapability,
  type OrcaModality,
} from '@/lib/ai/orcarouter';

/**
 * Capability-filtered model picker for OrcaRouter.
 *
 * The option list is whatever `GET {apiBase}/v1/models?capability=…` returns for
 * the caller's own key — the server holds the key, the browser sees only IDs and
 * metadata. There is no free-text fallback here on purpose: a hand-typed model
 * string is exactly the thing this control exists to prevent.
 *
 * When live discovery fails the list degrades to a small verified seed and says
 * so, rather than silently presenting unverified names as if they were live.
 */

export interface OrcaModelOption {
  id: string;
  name?: string;
  contextLength?: number;
  inputModalities?: OrcaModality[];
  reasoningEfforts?: string[];
}

interface ModelsResponse {
  models?: OrcaModelOption[];
  source?: 'live' | 'seed';
  reason?: string;
}

export interface ModelSelectorProps {
  /** Provider id, used for the discovery request header. */
  provider: string;
  capability: OrcaCapability;
  /** Non-text modalities the target surface will upload. */
  requiredInputModalities?: OrcaModality[];
  apiKey: string;
  baseURL: string;
  value: string;
  onChange: (model: string) => void;
  /** Bumping this forces a refetch (e.g. after a successful connect). */
  refreshToken?: number;
  /** Rendered above the list when the value had to be cleared. */
  onIncompatibleCleared?: (previousModel: string) => void;
  testIdPrefix?: string;
}

export function ModelSelector({
  provider,
  capability,
  requiredInputModalities,
  apiKey,
  baseURL,
  value,
  onChange,
  refreshToken = 0,
  onIncompatibleCleared,
  testIdPrefix = 'orca-model',
}: ModelSelectorProps) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<OrcaModelOption[]>([]);
  const [source, setSource] = useState<'live' | 'seed' | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const clearedRef = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);

  const modalityKey = (requiredInputModalities ?? []).join(',');

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ capability });
      if (modalityKey) params.set('input', modalityKey);
      const res = await fetch(`/api/ai/models?${params.toString()}`, {
        headers: {
          'x-provider': provider,
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
          ...(baseURL ? { 'x-base-url': baseURL } : {}),
        },
      });
      const data = (await res.json()) as ModelsResponse;
      setModels(data.models ?? []);
      setSource(data.source ?? null);
      setReason(data.reason);
    } catch {
      // A transport failure is not a licence to accept free text; show nothing
      // and let the user retry.
      setModels([]);
      setSource('seed');
      setReason('network');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [apiKey, baseURL, capability, modalityKey, provider]);

  // Refetch whenever the provider, the surface capability, or the credential
  // changes: the catalog a surface may choose from is a function of all three.
  useEffect(() => {
    setLoaded(false);
    setModels([]);
  }, [provider, capability, modalityKey, apiKey, baseURL, refreshToken]);

  useEffect(() => {
    if (open && !loaded && !loading) void fetchModels();
  }, [open, loaded, loading, fetchModels]);

  useEffect(() => {
    if (open) {
      // Measure the trigger so the panel lines up with it exactly.
      const width = triggerRef.current?.getBoundingClientRect().width;
      if (width) setPanelWidth(width);
      const id = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
    setSearch('');
  }, [open]);

  /**
   * A saved model that this surface can no longer use is cleared, never kept
   * silently. The list this component holds is already the server-side,
   * capability-filtered catalog, so membership in it *is* the compatibility
   * check — there is no second, weaker notion of "still allowed".
   */
  useEffect(() => {
    if (models.length === 0 || !value) return;
    if (models.some((m) => m.id === value)) return;
    if (clearedRef.current === value) return;
    clearedRef.current = value;
    onChange('');
    onIncompatibleCleared?.(value);
  }, [models, value, onChange, onIncompatibleCleared]);

  const filtered = useMemo(
    () => models.filter((m) => m.id.toLowerCase().includes(search.toLowerCase())),
    [models, search]
  );

  const selected = models.find((m) => m.id === value) ?? null;
  const degraded = source === 'seed' && reason !== 'missing_capability';

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t('ai.model')}
            className="w-full justify-between cursor-pointer font-normal"
            data-testid={`${testIdPrefix}-trigger`}
          >
            <span className="truncate">{value || t('ai.modelPlaceholder')}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          // Match the trigger exactly so the panel's right edge lines up with
          // the control it belongs to. Measured rather than derived from the
          // radix CSS variable, which does not resolve under Tailwind v4's
          // arbitrary-value syntax.
          style={panelWidth ? { width: panelWidth } : undefined}
          className="p-0"
          align="start"
          sideOffset={4}
          data-testid={`${testIdPrefix}-panel`}
        >
          <div className="border-b px-3 py-2">
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tCommon('search')}
              className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
              data-testid={`${testIdPrefix}-search`}
            />
          </div>

          {degraded && (
            <div
              className="flex items-start gap-1.5 border-b bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              data-testid={`${testIdPrefix}-degraded`}
            >
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {reason === 'missing_key' || reason === 'auth'
                  ? t('ai.orca.catalogNeedsKey')
                  : t('ai.orca.catalogDegraded')}
              </span>
            </div>
          )}

          <div
            role="listbox"
            aria-label={t('ai.model')}
            className="max-h-48 overflow-y-auto p-1"
            onWheel={(e) => e.stopPropagation()}
            data-testid={`${testIdPrefix}-listbox`}
          >
            {loading && (
              <div className="flex items-center justify-center py-4 text-sm text-zinc-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tCommon('loading')}
              </div>
            )}

            {!loading && filtered.length === 0 && loaded && (
              <div className="py-3 text-center text-xs text-zinc-400" data-testid={`${testIdPrefix}-empty`}>
                {t('ai.orca.noCompatibleModels')}
              </div>
            )}

            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={value === m.id}
                className={cn(
                  'flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  value === m.id && 'bg-zinc-100 dark:bg-zinc-800'
                )}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                data-testid={`${testIdPrefix}-option`}
              >
                <Check className={cn('mr-2 h-4 w-4 shrink-0', value === m.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{m.id}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-zinc-400" data-testid={`${testIdPrefix}-count`}>
              {source === 'live'
                ? t('ai.orca.modelCountLive', { count: models.length })
                : t('ai.orca.modelCountFallback', { count: models.length })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="cursor-pointer text-zinc-400"
              onClick={() => { setLoaded(false); void fetchModels(); }}
              aria-label={t('ai.orca.refresh')}
              data-testid={`${testIdPrefix}-refresh`}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {selected?.name && (
        <p className="text-xs text-zinc-400">{selected.name}</p>
      )}
    </div>
  );
}
