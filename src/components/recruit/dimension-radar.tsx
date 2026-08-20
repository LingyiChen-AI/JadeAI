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
  const data = scores.map((s) => ({ label: s.label, score: s.score }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RechartsRadar data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="label" className="text-xs" />
        <PolarRadiusAxis angle={30} domain={[0, 100]} />
        <Radar dataKey="score" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.3} />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
