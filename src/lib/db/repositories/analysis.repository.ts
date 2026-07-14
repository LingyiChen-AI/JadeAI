import { eq, desc } from 'drizzle-orm';
import { db } from '../index';
import { jdAnalyses, grammarChecks } from '../pg-schema';

export const analysisRepository = {
  // ── JD Analysis ──────────────────────────────────────────

  async createJdAnalysis(data: {
    resumeId: string;
    jobDescription: string;
    result: unknown;
    overallScore: number;
    atsScore: number;
  }) {
    const id = crypto.randomUUID();
    await db.insert(jdAnalyses).values({
      id,
      resumeId: data.resumeId,
      jobDescription: data.jobDescription,
      result: data.result,
      overallScore: data.overallScore,
      atsScore: data.atsScore,
    } as any);
    const rows = await db.select().from(jdAnalyses).where(eq(jdAnalyses.id, id)).limit(1);
    return rows[0];
  },

  async findJdAnalysesByResumeId(resumeId: string, limit = 20) {
    return db
      .select()
      .from(jdAnalyses)
      .where(eq(jdAnalyses.resumeId, resumeId))
      .orderBy(desc(jdAnalyses.createdAt))
      .limit(limit);
  },

  async findJdAnalysisById(id: string) {
    const rows = await db.select().from(jdAnalyses).where(eq(jdAnalyses.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async deleteJdAnalysis(id: string) {
    await db.delete(jdAnalyses).where(eq(jdAnalyses.id, id));
  },

  // ── Grammar Check ────────────────────────────────────────

  async createGrammarCheck(data: {
    resumeId: string;
    result: unknown;
    score: number;
    issueCount: number;
  }) {
    const id = crypto.randomUUID();
    await db.insert(grammarChecks).values({
      id,
      resumeId: data.resumeId,
      result: data.result,
      score: data.score,
      issueCount: data.issueCount,
    } as any);
    const rows = await db.select().from(grammarChecks).where(eq(grammarChecks.id, id)).limit(1);
    return rows[0];
  },

  async findGrammarChecksByResumeId(resumeId: string, limit = 20) {
    return db
      .select()
      .from(grammarChecks)
      .where(eq(grammarChecks.resumeId, resumeId))
      .orderBy(desc(grammarChecks.createdAt))
      .limit(limit);
  },

  async findGrammarCheckById(id: string) {
    const rows = await db.select().from(grammarChecks).where(eq(grammarChecks.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async deleteGrammarCheck(id: string) {
    await db.delete(grammarChecks).where(eq(grammarChecks.id, id));
  },
};
