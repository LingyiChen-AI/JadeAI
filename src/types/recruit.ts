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
export type InterviewQuestionStatus = 'pending' | 'answered' | 'skipped';

export type InterviewQuestionCategory =
  | 'go_fundamentals'
  | 'backend_fundamentals'
  | 'middleware_database'
  | 'project_deep_dive'
  | 'system_scenario'
  | 'communication_pressure'
  | 'hr_motivation';

export type InterviewQuestionSource = 'resume' | 'jd' | 'gap';

export interface QuestionSlot {
  category: InterviewQuestionCategory;
  source: InterviewQuestionSource;
  dimension: string;
  topic: string;
  evidence: string;
  difficulty: QuestionDifficulty;
}

export interface InterviewBlueprint {
  resumeFacts: string[];
  jdRequirements: string[];
  gaps: string[];
  slots: QuestionSlot[];
}

/** 一条追问。老数据里 followUps 是纯字符串，读取时会补成 purpose 为空。 */
export interface FollowUp {
  /** 这一问想拿到什么。空字符串表示老数据没标 */
  purpose: string;
  question: string;
  /**
   * 这一问的参考答案。面试官不可能记住所有知识点，
   * 对方答完之后要靠它判断答得对不对、还能往哪儿拉。
   */
  answer?: string;
}

export interface InterviewQuestion {
  id: string;
  /** 对应 DimensionConfig.key */
  dimension: string;
  /** 面试题分类；老数据可能没有此字段。 */
  category?: InterviewQuestionCategory;
  /** 题目依据的材料来源；老数据可能没有此字段。 */
  source?: InterviewQuestionSource;
  /** 题目所依据的简历、JD 或差距证据；老数据可能没有此字段。 */
  evidence?: string;
  question: string;
  /** 考察点：这道题真正想看什么 */
  intent: string;
  rubric: {
    excellent: string;
    pass: string;
    fail: string;
  };
  /**
   * 追问阶梯。深度靠这些挖，不靠把条件全塞进题干。
   * purpose 是这一问的目的（要细节/要归因/反事实/挑战/要教训）。
   */
  followUps: FollowUp[];
  /** 强答案会覆盖到的点 */
  referencePoints: string[];
  /** 危险信号：听到这些表述就该扣分 */
  redFlags?: string[];
  /**
   * 主问题的参考答案。分点写，覆盖强答案该讲到的机制、术语和量级。
   * 开放题/行为题给的是「一个强答案长什么样」的骨架，不是标准答案。
   */
  referenceAnswer?: string;
  estimatedMinutes: number;
  difficulty: QuestionDifficulty;
  /** 面试记录状态。老数据读取时会根据 answer 自动补齐。 */
  status?: InterviewQuestionStatus;
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
export const QUESTION_COUNT_MAX = 30;
export const QUESTION_COUNT_DEFAULT = 10;
