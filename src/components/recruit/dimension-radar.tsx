'use client';

import {
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import type { DimensionScore } from '@/types/recruit';

interface DimensionRadarProps {
  scores: DimensionScore[];
}

export function DimensionRadar({ scores }: DimensionRadarProps) {
  // 雷达图至少要 3 个轴才成立。1-2 个维度是用户真实会配出来的配置，
  // 硬画会得到一个孤零零的点加一条斜刻度轴，不如老实用条形。
  if (scores.length < 3) {
    return (
      <div className="space-y-3 py-4">
        {scores.map((s) => (
          <div key={s.key} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-600 dark:text-zinc-400">{s.label}</span>
              <span className="tabular-nums text-zinc-500">{s.weight > 0 ? s.score : '—'}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${s.weight > 0 ? s.score : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const data = scores.map((s) => ({ label: s.label, score: s.score }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RechartsRadar data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="label" className="text-xs" />
        <PolarRadiusAxis angle={30} domain={[0, 100]} />
        <Radar dataKey="score" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.3} />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
