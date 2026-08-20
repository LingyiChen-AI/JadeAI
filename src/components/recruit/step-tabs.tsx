'use client';

import { Check } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface Step {
  value: string;
  label: string;
  /** 该步骤的产出是否已存在 */
  done: boolean;
}

/**
 * 带序号与完成态的步骤条。刻意不禁用未完成的步骤——
 * 面试中要在题目和评价之间来回切，强制顺序反而碍事。
 */
export function StepTabs({ steps }: { steps: Step[] }) {
  return (
    <TabsList variant="line" className="h-auto w-full justify-start gap-6 border-b p-0">
      {steps.map((s, i) => (
        <TabsTrigger
          key={s.value}
          value={s.value}
          className="h-auto flex-none cursor-pointer gap-2 px-0 pb-3 text-sm"
        >
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
              s.done
                ? 'bg-brand text-white'
                : 'border border-zinc-300 text-zinc-400 dark:border-zinc-600',
            )}
          >
            {s.done ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          {s.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
