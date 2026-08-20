import { eq, desc } from 'drizzle-orm';
import { db } from '../index';
import { recruitJobs, recruitCandidates, recruitEvaluations } from '../schema';
import type { CandidateStatRow } from '@/lib/recruit/job-stats';
import { countAnswered } from '@/lib/recruit/answers';
import { normalizeQuestions } from '@/lib/recruit/questions';
// 岗位和候选人 id 都进 URL，短 id 才念得出来；存量 UUID 继续可用
import { shortId } from '@/lib/recruit/short-id';
import type {
  CandidateStatus,
  CandidateSummary,
  DimensionConfig,
  DimensionScore,
  InterviewQuestion,
  QuestionEvaluation,
  Recommendation,
} from '@/types/recruit';

export const recruitRepository = {
  // ── Jobs ────────────────────────────────────────────────────────────────────

  async createJob(data: {
    userId: string;
    title: string;
    jobDescription: string;
    dimensions: DimensionConfig[];
    questionCount: number;
  }) {
    const id = shortId();
    await db.insert(recruitJobs).values({
      id,
      userId: data.userId,
      title: data.title,
      jobDescription: data.jobDescription,
      dimensions: data.dimensions as any,
      questionCount: data.questionCount,
    } as any);
    return this.findJob(id);
  },

  async findJob(jobId: string): Promise<typeof recruitJobs.$inferSelect | null> {
    const rows = await db.select().from(recruitJobs).where(eq(recruitJobs.id, jobId)).limit(1);
    return rows[0] ?? null;
  },

  async findJobsByUserId(userId: string): Promise<(typeof recruitJobs.$inferSelect)[]> {
    return db
      .select()
      .from(recruitJobs)
      .where(eq(recruitJobs.userId, userId))
      .orderBy(desc(recruitJobs.createdAt));
  },

  /**
   * 该用户名下所有候选人的「岗位 + 评价结论」明细，供岗位列表卡片统计用。
   *
   * 一次查询取全量再在 JS 里聚合：单个用户的候选人总量很小，
   * 而聚合 SQL 在 SQLite 与 PG 之间要额外小心，不值得引方言分支。
   */
  async findCandidateStatsByUserId(userId: string): Promise<CandidateStatRow[]> {
    const rows = await db
      .select({
        jobId: recruitCandidates.jobId,
        status: recruitCandidates.status,
        recommendation: recruitEvaluations.recommendation,
      })
      .from(recruitCandidates)
      .innerJoin(recruitJobs, eq(recruitJobs.id, recruitCandidates.jobId))
      .leftJoin(recruitEvaluations, eq(recruitEvaluations.candidateId, recruitCandidates.id))
      .where(eq(recruitJobs.userId, userId));

    return rows.map((r: any) => ({
      jobId: r.jobId as string,
      status: r.status as CandidateStatus,
      recommendation: (r.recommendation ?? null) as Recommendation | null,
    }));
  },

  async updateJob(
    jobId: string,
    data: Partial<{
      title: string;
      jobDescription: string;
      dimensions: DimensionConfig[];
      questionCount: number;
    }>,
  ) {
    await db
      .update(recruitJobs)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(recruitJobs.id, jobId));
    return this.findJob(jobId);
  },

  async deleteJob(jobId: string) {
    await db.delete(recruitJobs).where(eq(recruitJobs.id, jobId));
  },

  // ── Candidates ──────────────────────────────────────────────────────────────

  async createCandidate(data: { jobId: string; name: string }) {
    const id = shortId();
    await db.insert(recruitCandidates).values({
      id,
      jobId: data.jobId,
      name: data.name,
    } as any);
    return this.findCandidate(id);
  },

  async findCandidate(candidateId: string): Promise<typeof recruitCandidates.$inferSelect | null> {
    const rows = await db
      .select()
      .from(recruitCandidates)
      .where(eq(recruitCandidates.id, candidateId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    // 题目结构升级过（followUps 从字符串变成对象），库里还有老形状的数据。
    // 在这里统一兜一次，下游就不用各自防御。
    return { ...row, questions: normalizeQuestions((row as any).questions) } as any;
  },

  async findCandidatesByJobId(jobId: string): Promise<(typeof recruitCandidates.$inferSelect)[]> {
    return db
      .select()
      .from(recruitCandidates)
      .where(eq(recruitCandidates.jobId, jobId))
      .orderBy(desc(recruitCandidates.createdAt));
  },

  /**
   * 岗位详情页的候选人列表：只取列表要显示的列，评价的大 JSON 不查出来。
   */
  async findCandidateSummaries(jobId: string): Promise<CandidateSummary[]> {
    const rows = await db
      .select({
        id: recruitCandidates.id,
        name: recruitCandidates.name,
        status: recruitCandidates.status,
        createdAt: recruitCandidates.createdAt,
        // 列表那一行的主按钮要靠这两个字段判断走到哪一步了
        resumeText: recruitCandidates.resumeText,
        questions: recruitCandidates.questions,
        overallScore: recruitEvaluations.overallScore,
        recommendation: recruitEvaluations.recommendation,
      })
      .from(recruitCandidates)
      .leftJoin(recruitEvaluations, eq(recruitEvaluations.candidateId, recruitCandidates.id))
      .where(eq(recruitCandidates.jobId, jobId))
      .orderBy(desc(recruitCandidates.createdAt));

    return rows.map((r: any) => {
      const questions = (r.questions ?? []) as InterviewQuestion[];
      return {
        id: r.id,
        name: r.name,
        status: r.status as CandidateStatus,
        createdAt: r.createdAt,
        // 只回传布尔和计数，简历正文和题目大 JSON 不进列表响应
        hasResume: Boolean((r.resumeText ?? '').trim()),
        questionCount: questions.length,
        answeredCount: countAnswered(questions),
        overallScore: r.overallScore ?? null,
        recommendation: (r.recommendation ?? null) as Recommendation | null,
      };
    });
  },

  async updateCandidate(
    candidateId: string,
    data: Partial<{
      name: string;
      status: CandidateStatus;
      resumeText: string;
      resumeData: unknown;
      dimensionsOverride: DimensionConfig[] | null;
      questions: InterviewQuestion[] | null;
      transcript: string;
    }>,
  ) {
    await db
      .update(recruitCandidates)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(recruitCandidates.id, candidateId));
    return this.findCandidate(candidateId);
  },

  async deleteCandidate(candidateId: string) {
    await db.delete(recruitCandidates).where(eq(recruitCandidates.id, candidateId));
  },

  // ── Evaluations ─────────────────────────────────────────────────────────────

  async findEvaluation(candidateId: string): Promise<typeof recruitEvaluations.$inferSelect | null> {
    const rows = await db
      .select()
      .from(recruitEvaluations)
      .where(eq(recruitEvaluations.candidateId, candidateId))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * 一个候选人一份评价。重新生成时先删后插——candidate_id 上有 unique 约束，
   * 直接 insert 会撞约束。
   */
  async upsertEvaluation(data: {
    candidateId: string;
    overallScore: number;
    dimensionScores: DimensionScore[];
    questionEvaluations: QuestionEvaluation[];
    recommendation: Recommendation;
    recommendationReason: string;
    strengths: string[];
    concerns: string[];
    overallComment: string;
  }) {
    await db
      .delete(recruitEvaluations)
      .where(eq(recruitEvaluations.candidateId, data.candidateId));
    const id = shortId();
    await db.insert(recruitEvaluations).values({
      id,
      candidateId: data.candidateId,
      overallScore: data.overallScore,
      dimensionScores: data.dimensionScores as any,
      questionEvaluations: data.questionEvaluations as any,
      recommendation: data.recommendation,
      recommendationReason: data.recommendationReason,
      strengths: data.strengths as any,
      concerns: data.concerns as any,
      overallComment: data.overallComment,
    } as any);
    return this.findEvaluation(data.candidateId);
  },
};
