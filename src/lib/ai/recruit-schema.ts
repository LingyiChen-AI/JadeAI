import { z } from 'zod/v4';
import { QUESTION_COUNT_MAX, QUESTION_COUNT_MIN } from '@/types/recruit';

// ── 通用容错工具 ──────────────────────────────────────────────────────────────

/** 模型经常把数组字段整个漏掉或给成 null，统一补成空数组。 */
const stringArray = z
  .union([z.array(z.string()), z.null(), z.undefined()])
  .transform((v) => v ?? []);

/** 分数钳到 0-100。模型偶尔给 120 或 -5，为此丢掉整份评价不值得。 */
const score0to100 = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .transform((v) => (Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0));

// ── 输入 schema（API 请求体校验） ─────────────────────────────────────────────

export const dimensionConfigSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().int().positive(),
  custom: z.boolean(),
  // 加这个字段之前建的岗位，库里那条 JSON 没有 description。
  // 设成必填的话，老岗位一存就 400。
  description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v ?? '')
    .pipe(z.string().max(2000)),
});

/** 岗位维度配置：至少勾一个，key 不许重复。 */
export const dimensionsSchema = z
  .array(dimensionConfigSchema)
  .min(1, '至少选择一个考察维度')
  .refine(
    (dims) => new Set(dims.map((d) => d.key)).size === dims.length,
    { message: '考察维度不能重复' },
  );

export const createJobInputSchema = z.object({
  title: z.string().min(1).max(100),
  jobDescription: z.string().min(1),
  dimensions: dimensionsSchema,
  questionCount: z.number().int().min(QUESTION_COUNT_MIN).max(QUESTION_COUNT_MAX),
});

export const updateJobInputSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  jobDescription: z.string().min(1).optional(),
  dimensions: dimensionsSchema.optional(),
  questionCount: z.number().int().min(QUESTION_COUNT_MIN).max(QUESTION_COUNT_MAX).optional(),
});

export const createCandidateInputSchema = z.object({
  name: z.string().min(1).max(50),
});

export const updateCandidateInputSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  resumeText: z.string().optional(),
  transcript: z.string().optional(),
  dimensionsOverride: dimensionsSchema.nullable().optional(),
  /** 删除单题用：前端传剩下的题目全集，整体覆盖 */
  questions: z.array(z.any()).nullable().optional(),
});

// ── 输出 schema（模型返回值校验） ─────────────────────────────────────────────

const interviewQuestionCategorySchema = z.enum([
  'go_fundamentals',
  'backend_fundamentals',
  'middleware_database',
  'project_deep_dive',
  'system_scenario',
  'communication_pressure',
  'hr_motivation',
]);

const interviewQuestionSourceSchema = z.enum(['resume', 'jd', 'gap']);
const strictDifficultySchema = z.enum(['easy', 'medium', 'hard']);

const questionSlotOutputSchema = z.object({
  category: interviewQuestionCategorySchema,
  source: interviewQuestionSourceSchema,
  dimension: z.string(),
  topic: z.string(),
  evidence: z.string(),
  difficulty: strictDifficultySchema,
}).strict();

export const interviewBlueprintOutputSchema = z.object({
  resumeFacts: z.array(z.string()),
  jdRequirements: z.array(z.string()),
  gaps: z.array(z.string()),
  slots: z.array(questionSlotOutputSchema),
}).strict();

export const dimensionSuggestionsOutputSchema = z.object({
  dimensions: z.array(z.object({
    key: interviewQuestionCategorySchema,
    weight: z.number().int().min(1).max(5),
    description: z.string().min(200).max(1600),
  }).strict()),
}).strict();

const difficultySchema = z
  .union([z.enum(['easy', 'medium', 'hard']), z.string(), z.null(), z.undefined()])
  .transform((v) => (v === 'easy' || v === 'medium' || v === 'hard' ? v : 'medium'));

const rawQuestionSchema = z.object({
  dimension: z.string(),
  // Metadata is optional here because older providers and persisted JSON omit it;
  // the server supplies canonical values when assembling generated questions.
  category: interviewQuestionCategorySchema.optional(),
  source: interviewQuestionSourceSchema.optional(),
  evidence: z.string().optional(),
  question: z.string(),
  intent: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
  rubric: z
    .union([
      z.object({
        excellent: z.string(),
        pass: z.string(),
        fail: z.string(),
      }),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => v ?? { excellent: '', pass: '', fail: '' }),
  // 追问从纯字符串升级成「目的 + 问题」。老数据和偶尔偷懒的模型
  // 还会给字符串，统一补成 purpose 为空。
  followUps: z
    .union([
      z.array(
        z.union([
          z.object({
            purpose: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
            question: z.string(),
            answer: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
          }),
          z.string().transform((q) => ({ purpose: '', question: q, answer: '' })),
        ]),
      ),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => v ?? []),
  referencePoints: stringArray,
  redFlags: stringArray,
  // 只有客观题才该有参考答案，开放题模型会留空或整个漏掉。
  referenceAnswer: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v ?? ''),
  estimatedMinutes: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const n = typeof v === 'string' ? Number(v) : v;
      return Number.isFinite(n) && (n as number) > 0 ? Math.round(n as number) : 5;
    }),
  difficulty: difficultySchema,
});

export const questionsOutputSchema = z.object({
  questions: z.array(rawQuestionSchema).min(1),
});

export type QuestionsOutput = z.infer<typeof questionsOutputSchema>;

const recommendationSchema = z
  .union([z.enum(['strong_hire', 'hire', 'hold', 'no_hire']), z.string(), z.null(), z.undefined()])
  .transform((v) =>
    v === 'strong_hire' || v === 'hire' || v === 'hold' || v === 'no_hire' ? v : 'hold',
  );

export const evaluationOutputSchema = z.object({
  questionEvaluations: z.array(
    z.object({
      questionId: z.string(),
      answerSummary: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
      answered: z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => v ?? false),
      score: score0to100,
      highlights: stringArray,
      weaknesses: stringArray,
    }),
  ),
  dimensionScores: z.array(
    z.object({
      key: z.string(),
      score: score0to100,
    }),
  ),
  strengths: stringArray,
  concerns: stringArray,
  overallComment: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
  recommendation: recommendationSchema,
  recommendationReason: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v ?? ''),
});

export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
