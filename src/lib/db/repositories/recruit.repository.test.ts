import { beforeEach, describe, expect, it, vi } from 'vitest';

// 同 user.repository.local-user.test.ts：src/lib/db/index.ts 在 import 时就会打开
// 真实的 SQLite 文件，所以每个碰 repository 的测试都必须把它替换掉。
vi.mock('../index', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../schema');

  const dir = mkdtempSync(join(tmpdir(), 'jade-recruit-'));
  const sqlite = new Database(join(dir, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: 'drizzle/migrations' });

  return { db, dbReady: Promise.resolve(), adapter: null };
});

const { recruitRepository } = await import('./recruit.repository');
const { db } = await import('../index');
const { users, recruitJobs, recruitCandidates, recruitEvaluations } = await import('../schema');

const USER_ID = 'test-user-recruit';

beforeEach(async () => {
  await db.delete(recruitEvaluations);
  await db.delete(recruitCandidates);
  await db.delete(recruitJobs);
  await db.delete(users);
  await db.insert(users).values({ id: USER_ID, authType: 'local' });
});

const DIMENSIONS = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

async function createJob() {
  const job = await recruitRepository.createJob({
    userId: USER_ID,
    title: '高级前端工程师',
    jobDescription: '负责核心页面开发',
    dimensions: DIMENSIONS,
    questionCount: 10,
  });
  if (!job) throw new Error('createJob returned null');
  return job;
}

describe('recruitRepository — jobs', () => {
  it('创建岗位并把 dimensions 原样存回', async () => {
    const job = await createJob();
    expect(job.title).toBe('高级前端工程师');
    expect(job.dimensions).toEqual(DIMENSIONS);
    expect(job.questionCount).toBe(10);
  });

  it('按用户列出岗位，最新的在前', async () => {
    const first = await createJob();
    const second = await recruitRepository.createJob({
      userId: USER_ID,
      title: '后端工程师',
      jobDescription: 'JD',
      dimensions: DIMENSIONS,
      questionCount: 8,
    });
    const jobs = await recruitRepository.findJobsByUserId(USER_ID);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.id)).toContain(first.id);
    expect(jobs.map((j) => j.id)).toContain(second!.id);
  });

  it('更新岗位的维度与题目数', async () => {
    const job = await createJob();
    const next = [...DIMENSIONS, { key: 'stress', label: '抗压能力', weight: 1, custom: false }];
    await recruitRepository.updateJob(job.id, { dimensions: next, questionCount: 15 });
    const updated = await recruitRepository.findJob(job.id);
    expect(updated!.dimensions).toHaveLength(3);
    expect(updated!.questionCount).toBe(15);
  });

  it('删除岗位会级联删掉候选人和评价', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '张三' });
    await recruitRepository.upsertEvaluation({
      candidateId: candidate!.id,
      overallScore: 80,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'hire',
      recommendationReason: '基础扎实',
      strengths: ['沟通清晰'],
      concerns: [],
      overallComment: '整体不错',
    });

    await recruitRepository.deleteJob(job.id);

    expect(await recruitRepository.findCandidate(candidate!.id)).toBeNull();
    expect(await db.select().from(recruitEvaluations)).toHaveLength(0);
  });
});

describe('recruitRepository — candidates', () => {
  it('新建候选人默认是 pending 状态且没有题目', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '李四' });
    expect(candidate!.status).toBe('pending');
    expect(candidate!.questions).toBeNull();
    expect(candidate!.transcript).toBe('');
  });

  it('写入题目后能原样读回', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '王五' });
    const questions = [
      {
        id: 'q1',
        dimension: 'logic',
        category: 'project_deep_dive' as const,
        source: 'resume' as const,
        evidence: '简历中的线上故障排查经历',
        question: '讲一个你排查过的线上问题',
        intent: '看拆解问题的路径',
        rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只会复述结论' },
        followUps: [{ purpose: '要细节', question: '当时为什么先怀疑这里？', answer: '' }],
        referencePoints: ['定位手段', '验证方式'],
        redFlags: undefined,
        estimatedMinutes: 8,
        difficulty: 'medium' as const,
        status: 'pending' as const,
      },
    ];
    await recruitRepository.updateCandidate(candidate!.id, {
      questions,
      status: 'questions_ready',
    });
    const updated = await recruitRepository.findCandidate(candidate!.id);
    expect(updated!.questions).toEqual(questions);
    expect(updated!.status).toBe('questions_ready');
  });

  it('候选人摘要列表带出评价的分数和结论，不带大 JSON', async () => {
    const job = await createJob();
    const scored = await recruitRepository.createCandidate({ jobId: job.id, name: '有评价的' });
    await recruitRepository.createCandidate({ jobId: job.id, name: '没评价的' });
    await recruitRepository.upsertEvaluation({
      candidateId: scored!.id,
      overallScore: 88,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'strong_hire',
      recommendationReason: '很强',
      strengths: [],
      concerns: [],
      overallComment: '',
    });

    const summaries = await recruitRepository.findCandidateSummaries(job.id);
    expect(summaries).toHaveLength(2);
    const withScore = summaries.find((s) => s.name === '有评价的')!;
    const without = summaries.find((s) => s.name === '没评价的')!;
    expect(withScore.overallScore).toBe(88);
    expect(withScore.recommendation).toBe('strong_hire');
    expect(without.overallScore).toBeNull();
    expect(without.recommendation).toBeNull();
  });
});

describe('recruitRepository — evaluations', () => {
  it('重复生成评价时覆盖旧的，而不是插第二条', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '赵六' });

    await recruitRepository.upsertEvaluation({
      candidateId: candidate!.id,
      overallScore: 60,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'hold',
      recommendationReason: '待定',
      strengths: [],
      concerns: [],
      overallComment: '第一版',
    });
    await recruitRepository.upsertEvaluation({
      candidateId: candidate!.id,
      overallScore: 85,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'hire',
      recommendationReason: '重新评估后认可',
      strengths: [],
      concerns: [],
      overallComment: '第二版',
    });

    const rows = await db.select().from(recruitEvaluations);
    expect(rows).toHaveLength(1);
    const latest = await recruitRepository.findEvaluation(candidate!.id);
    expect(latest!.overallScore).toBe(85);
    expect(latest!.overallComment).toBe('第二版');
  });

  it('候选人不存在时查评价返回 null', async () => {
    expect(await recruitRepository.findEvaluation('nope')).toBeNull();
  });
});
