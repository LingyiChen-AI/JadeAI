'use client';

import { Eye, FileText, Heart, Loader2, UserRound } from 'lucide-react';
import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TemplateCatalogItem } from '@/types/template';

export type TemplateCardLabels = {
  preview: string;
  useTemplate: string;
  creating: string;
  favorite: string;
  unfavorite: string;
  ats: string;
  avatar: string;
  paper: string;
  docx: string;
};

type TemplateCardProps = {
  item: TemplateCatalogItem;
  locale: string;
  isFirst?: boolean;
  creating: boolean;
  labels: TemplateCardLabels;
  onFavorite(favorite: boolean): void;
  onPreview(): void;
  onUse(): void;
};

function assetUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function TemplateCard({
  item,
  locale,
  isFirst = false,
  creating,
  labels,
  onFavorite,
  onPreview,
  onUse,
}: TemplateCardProps) {
  const primaryName = locale.startsWith('zh') ? item.nameZh : item.nameEn;
  const secondaryName = locale.startsWith('zh') ? item.nameEn : item.nameZh;
  const category = locale.startsWith('zh') ? item.category.nameZh : item.category.nameEn;

  return (
    <article className="group min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={assetUrl(item.thumbnailPath)}
          alt=""
          width="400"
          height="300"
          loading="lazy"
          unoptimized
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-pressed={item.favorite}
          title={item.favorite ? labels.unfavorite : labels.favorite}
          className="absolute right-2 top-2 size-8 bg-white/95 shadow-sm dark:bg-zinc-950/95"
          onClick={() => onFavorite(!item.favorite)}
        >
          <Heart className={item.favorite ? 'fill-current text-red-600' : ''} />
          <span className="sr-only">{item.favorite ? labels.unfavorite : labels.favorite}</span>
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{primaryName}</h2>
          <p className="truncate text-xs text-zinc-500">{secondaryName}</p>
          <p className="mt-1 text-xs text-zinc-500">{category}</p>
        </div>

        <div className="flex min-h-6 flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <Badge key={tag.slug} variant="secondary" className="max-w-full truncate text-[11px]">
              {locale.startsWith('zh') ? tag.nameZh : tag.nameEn}
            </Badge>
          ))}
        </div>

        <div className="flex min-h-5 flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          {item.capabilities.atsCompatible && <span>{labels.ats}</span>}
          {item.capabilities.supportsAvatar && <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{labels.avatar}</span>}
          <span>{labels.paper}: {item.capabilities.paperSizes.join(' / ').toUpperCase()}</span>
          {item.capabilities.docxFidelity !== 'unsupported' && <span className="inline-flex items-center gap-1"><FileText className="size-3" />{labels.docx}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            {...(isFirst ? { 'data-tour': 'tpl-preview' } : {})}
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreview}
          >
            <Eye />
            {labels.preview}
          </Button>
          <Button
            {...(isFirst ? { 'data-tour': 'tpl-use' } : {})}
            type="button"
            size="sm"
            disabled={creating}
            onClick={onUse}
          >
            {creating && <Loader2 className="animate-spin" />}
            {creating ? labels.creating : labels.useTemplate}
          </Button>
        </div>
      </div>
    </article>
  );
}
