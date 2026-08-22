/**
 * 把招聘模块存量的 UUID 主键换成短 id。
 *
 * 短 id 是后加的，只对新建的记录生效，老的岗位和候选人还带着 36 位 UUID，
 * 一条 URL 里塞两个就没法看也没法念。这个脚本把它们一次性换掉。
 *
 * 外键是 onDelete cascade、没有 onUpdate，所以不能直接 UPDATE 主键。
 * 走「复制一份新 id 的 → 把子表指过去 → 删掉旧的」三步：删旧的时候子表
 * 已经不指向它了，cascade 不会误伤。
 *
 * 幂等：已经是短 id 的直接跳过，可以重复跑。
 *
 *   DB_TYPE=postgresql DATABASE_URL=... pnpm tsx scripts/shorten-recruit-ids.ts
 */
import { eq } from 'drizzle-orm';
import { db, dbReady } from '../src/lib/db';
import { recruitJobs, recruitCandidates, recruitEvaluations } from '../src/lib/db/schema';
import { shortId } from '../src/lib/recruit/short-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  await dbReady;

  const jobs = await db.select().from(recruitJobs);
  const candidates = await db.select().from(recruitCandidates);
  const evaluations = await db.select().from(recruitEvaluations);

  const longJobs = jobs.filter((j: { id: string }) => UUID.test(j.id));
  const longCands = candidates.filter((c: { id: string }) => UUID.test(c.id));
  const longEvals = evaluations.filter((e: { id: string }) => UUID.test(e.id));

  console.log(
    `岗位 ${longJobs.length}/${jobs.length} · 候选人 ${longCands.length}/${candidates.length} · 评价 ${longEvals.length}/${evaluations.length} 需要改`,
  );
  if (!longJobs.length && !longCands.length && !longEvals.length) {
    console.log('没有需要改的，退出');
    return;
  }

  // ── 岗位：子表是候选人 ────────────────────────────────────────
  for (const job of longJobs) {
    const next = shortId();
    await db.insert(recruitJobs).values({ ...job, id: next } as never);
    await db
      .update(recruitCandidates)
      .set({ jobId: next } as never)
      .where(eq(recruitCandidates.jobId, job.id));
    await db.delete(recruitJobs).where(eq(recruitJobs.id, job.id));
    console.log(`岗位 ${job.id} -> ${next}  (${job.title})`);
  }

  // ── 候选人：子表是评价 ────────────────────────────────────────
  for (const cand of longCands) {
    const next = shortId();
    // 上一步可能已经改过 jobId，重新读一次拿最新的行
    const rows = await db
      .select()
      .from(recruitCandidates)
      .where(eq(recruitCandidates.id, cand.id))
      .limit(1);
    const fresh = rows[0];
    if (!fresh) continue;
    await db.insert(recruitCandidates).values({ ...fresh, id: next } as never);
    await db
      .update(recruitEvaluations)
      .set({ candidateId: next } as never)
      .where(eq(recruitEvaluations.candidateId, cand.id));
    await db.delete(recruitCandidates).where(eq(recruitCandidates.id, cand.id));
    console.log(`候选人 ${cand.id} -> ${next}  (${fresh.name})`);
  }

  // ── 评价：没有子表，直接改 ────────────────────────────────────
  for (const ev of longEvals) {
    const next = shortId();
    await db
      .update(recruitEvaluations)
      .set({ id: next } as never)
      .where(eq(recruitEvaluations.id, ev.id));
    console.log(`评价 ${ev.id} -> ${next}`);
  }

  console.log('完成');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
