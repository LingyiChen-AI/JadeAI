/** 考察维度配置。预置维度的 label 由 i18n 填充，自定义维度由用户输入。 */
export interface DimensionConfig {
  key: string;
  label: string;
  /** 相对权重，正整数。决定该维度出几道题、以及在总分里占多大比例。 */
  weight: number;
  custom: boolean;
  /**
   * 这个维度要考察什么、该怎么问。出题时原样进 prompt，可以理解为
   * 「这一类题目的提示词」。老数据里没有这个字段，读的时候要兜底。
   */
  description?: string;
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface InterviewQuestion {
  id: string;
  /** 对应 DimensionConfig.key */
  dimension: string;
  question: string;
  /** 考察点：这道题真正想看什么 */
  intent: string;
  rubric: {
    excellent: string;
    pass: string;
    fail: string;
  };
  followUps: string[];
  referencePoints: string[];
  /**
   * 参考答案。只有有确定技术答案的题目才有，开放题/行为题留空。
   */
  referenceAnswer?: string;
  estimatedMinutes: number;
  difficulty: QuestionDifficulty;
  /** 面试中记录的候选人回答。空表示这题还没记。 */
  answer?: string;
}

export interface DimensionScore {
  key: string;
  label: string;
  /** 0-100，由模型给出 */
  score: number;
  /** 计算总分时用的权重，冗余存储以便报告复现 */
  weight: number;
}

export interface QuestionEvaluation {
  questionId: string;
  question: string;
  /** AI 从面试记录中定位到的回答摘要 */
  answerSummary: string;
  /** 记录中是否能找到对应回答 */
  answered: boolean;
  score: number;
  highlights: string[];
  weaknesses: string[];
}

export type Recommendation = 'strong_hire' | 'hire' | 'hold' | 'no_hire';

export type CandidateStatus = 'pending' | 'questions_ready' | 'evaluated';

export interface RecruitJob {
  id: string;
  userId: string;
  title: string;
  jobDescription: string;
  dimensions: DimensionConfig[];
  questionCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RecruitCandidate {
  id: string;
  jobId: string;
  name: string;
  status: CandidateStatus;
  resumeText: string;
  resumeData: unknown | null;
  dimensionsOverride: DimensionConfig[] | null;
  questions: InterviewQuestion[] | null;
  transcript: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RecruitEvaluation {
  id: string;
  candidateId: string;
  overallScore: number;
  dimensionScores: DimensionScore[];
  questionEvaluations: QuestionEvaluation[];
  recommendation: Recommendation;
  recommendationReason: string;
  strengths: string[];
  concerns: string[];
  overallComment: string;
  createdAt: Date | string;
}

/** 岗位详情页列表用：候选人 + 其评价摘要，不含大 JSON */
export interface CandidateSummary {
  id: string;
  name: string;
  status: CandidateStatus;
  /** 简历是否已填。正文不进列表响应，只给个布尔 */
  hasResume: boolean;
  questionCount: number;
  /** 已记录回答的题数，「继续面试 5/14」里的 5 */
  answeredCount: number;
  overallScore: number | null;
  recommendation: Recommendation | null;
  createdAt: Date | string;
}

export const QUESTION_COUNT_MIN = 5;
export const QUESTION_COUNT_MAX = 20;
export const QUESTION_COUNT_DEFAULT = 10;
