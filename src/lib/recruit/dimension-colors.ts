/**
 * 维度配色：题目列表里的小圆点和详情里的标签共用一套色，
 * 扫一眼列表就知道哪几道是同类题。
 *
 * Tailwind 不能拼接类名，只能把完整类名写死在表里。
 */
export interface DimensionColor {
  /** 列表里的小圆点 */
  dot: string;
  /** 详情里的维度标签 */
  chip: string;
}

/** 题型与评分共用的预置维度各占一个色相。 */
const PRESET_COLORS: Record<string, DimensionColor> = {
  go_fundamentals: {
    dot: 'bg-indigo-500',
    chip: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300',
  },
  backend_fundamentals: {
    dot: 'bg-violet-500',
    chip: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  },
  middleware_database: {
    dot: 'bg-sky-500',
    chip: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  },
  project_deep_dive: {
    dot: 'bg-rose-500',
    chip: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
  },
  system_scenario: {
    dot: 'bg-teal-500',
    chip: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300',
  },
  communication_pressure: {
    dot: 'bg-amber-500',
    chip: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
  hr_motivation: {
    dot: 'bg-orange-500',
    chip: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300',
  },
};

/** 自定义维度从这里取色。和预置色错开，避免一眼看去像某个预置维度。 */
const FALLBACK_COLORS: DimensionColor[] = [
  {
    dot: 'bg-cyan-500',
    chip: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300',
  },
  {
    dot: 'bg-lime-600',
    chip: 'border-lime-200 bg-lime-50 text-lime-700 dark:border-lime-900 dark:bg-lime-950 dark:text-lime-300',
  },
  {
    dot: 'bg-pink-500',
    chip: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950 dark:text-pink-300',
  },
  {
    dot: 'bg-blue-500',
    chip: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  },
];

/**
 * 同一个 key 永远得到同一个颜色——自定义维度靠 key 的哈希取色，
 * 不能用数组下标，不然删掉一个维度后剩下的全部换色。
 */
export function dimensionColor(key: string): DimensionColor {
  const preset = PRESET_COLORS[key];
  if (preset) return preset;

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}
