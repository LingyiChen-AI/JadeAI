'use client';

import { ListFilter, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { TemplateCatalogFacets, TemplateCatalogFilters } from '@/hooks/use-template-catalog';

export const TEMPLATE_FILTER_LAYOUT_CLASSES = {
  desktop: 'hidden w-56 shrink-0 md:block',
  mobileTrigger: 'md:hidden',
  mobileSheet: 'w-[min(20rem,calc(100vw-2rem))] overflow-x-hidden p-0',
} as const;

type Labels = Record<string, string>;

type TemplateFiltersProps = {
  filters: TemplateCatalogFilters;
  facets: TemplateCatalogFacets | null;
  locale: string;
  searchValue: string;
  labels: Labels;
  onSearch(value: string): void;
  onChange(patch: Partial<TemplateCatalogFilters>): void;
};

type TemplateFilterFieldsProps = Omit<TemplateFiltersProps, 'searchValue' | 'onSearch'> & {
  idPrefix: string;
};

export function TemplateFilterFields({ filters, facets, locale, labels, idPrefix, onChange }: TemplateFilterFieldsProps) {
  const toggleTag = (slug: string, checked: boolean) => onChange({
    tags: checked ? [...filters.tags, slug] : filters.tags.filter((tag) => tag !== slug),
  });

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <Label>{labels.category}</Label>
        <Select value={filters.category ?? 'all'} onValueChange={(value) => onChange({ category: value === 'all' ? undefined : value })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{labels.allCategories}</SelectItem>
            {facets?.categories.map((category) => (
              <SelectItem key={category.slug} value={category.slug}>{locale.startsWith('zh') ? category.nameZh : category.nameEn} ({category.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{labels.tags}</Label>
        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {facets?.tags.map((tag) => (
            <label key={tag.slug} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{locale.startsWith('zh') ? tag.nameZh : tag.nameEn} ({tag.count})</span>
              <input type="checkbox" checked={filters.tags.includes(tag.slug)} onChange={(event) => toggleTag(tag.slug, event.target.checked)} />
            </label>
          ))}
        </div>
      </div>

      {([
        ['ats', labels.ats], ['avatar', labels.avatar], ['docx', labels.docx],
      ] as const).map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <Label htmlFor={`template-${idPrefix}-${key}`}>{label}</Label>
          <Switch id={`template-${idPrefix}-${key}`} checked={filters[key] === true} onCheckedChange={(checked) => onChange({ [key]: checked || undefined })} />
        </div>
      ))}

      <div className="space-y-2">
        <Label>{labels.paper}</Label>
        <Select value={filters.paper ?? 'all'} onValueChange={(value) => onChange({ paper: value === 'all' ? undefined : value as 'a4' | 'letter' })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{labels.anyPaper}</SelectItem><SelectItem value="a4">A4</SelectItem><SelectItem value="letter">Letter</SelectItem></SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function TemplateFilters(props: TemplateFiltersProps) {
  const { filters, labels, searchValue, onSearch, onChange } = props;
  return (
    <div className="contents">
      <div className="col-span-full flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input value={searchValue} onChange={(event) => onSearch(event.target.value)} placeholder={labels.searchPlaceholder} className="w-full pl-9" />
        </div>
        <Sheet>
          <SheetTrigger asChild><Button type="button" variant="outline" size="icon" className={TEMPLATE_FILTER_LAYOUT_CLASSES.mobileTrigger} title={labels.filters}><ListFilter /><span className="sr-only">{labels.filters}</span></Button></SheetTrigger>
          <SheetContent side="left" className={TEMPLATE_FILTER_LAYOUT_CLASSES.mobileSheet}>
            <SheetHeader><SheetTitle>{labels.filters}</SheetTitle><SheetDescription>{labels.filterDescription}</SheetDescription></SheetHeader>
            <div className="min-w-0 flex-1 overflow-y-auto"><TemplateFilterFields {...props} idPrefix="mobile" /></div>
          </SheetContent>
        </Sheet>
        <Select value={filters.sort ?? 'newest'} onValueChange={(sort) => onChange({ sort: sort as TemplateCatalogFilters['sort'] })}>
          <SelectTrigger className="w-28 shrink-0 sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="newest">{labels.newest}</SelectItem><SelectItem value="popular">{labels.popular}</SelectItem><SelectItem value="name">{labels.name}</SelectItem></SelectContent>
        </Select>
      </div>
      <aside className={TEMPLATE_FILTER_LAYOUT_CLASSES.desktop}><TemplateFilterFields {...props} idPrefix="desktop" /></aside>
    </div>
  );
}
