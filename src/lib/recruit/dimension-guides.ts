import type { DimensionConfig } from '@/types/recruit';

/**
 * 预置维度的出题指引（英文兜底版）。
 *
 * 维度的 description 才是出题时真正喂给模型的那段提示词。新建岗位时
 * description 由界面从 i18n 预填，用户可以改；这里这份只在两种情况下用到：
 * 1. 老岗位——加 description 字段之前建的，库里那条 JSON 没有这个键；
 * 2. 用户把描述清空了。
 *
 * 所以 messages/*.json 里的中英文描述和这里的英文有一份重复。这是有意的：
 * 那边是给人看、可编辑的副本，这边是服务端保底，两者跑偏也不会出错。
 */
export const PRESET_DIMENSION_GUIDES: Record<string, string> = {
  professional: `Probe depth in the exact stack and systems named on this résumé. Ask about design trade-offs actually faced, why one approach was chosen over a named alternative, what the failure modes were, and what broke in production. A strong answer cites concrete constraints, numbers, and lessons; a weak one recites textbook definitions or stays at the "we used X" level.`,

  logic: `Probe how the candidate decomposes a messy or under-specified problem. Give a realistic scenario drawn from this role — a metric that moved the wrong way, a system that is slow for 1% of requests, a capacity estimate — and watch them order hypotheses by likelihood and cost to check. No brainteasers or puzzle riddles. A strong answer states assumptions out loud, splits the space, and says what evidence would falsify each branch.`,

  communication: `Probe whether the candidate can make a complex thing from their own work land with a specific audience — a PM, a junior engineer, an angry customer. Also probe how they handle being disagreed with by someone more senior. Judge structure (conclusion first), calibration to the listener, and whether they compress or ramble. Not "are they friendly".`,

  stress: `Probe real high-pressure episodes from this résumé: a production incident they owned, a deadline that got cut in half, two managers demanding opposite things. Then push back on their answer once to see whether they hold their reasoning or fold. A strong answer is specific about what they triaged, what they dropped, and what they would do differently — not "I just work harder".`,

  teamwork: `Probe friction, not harmony: a code review that turned into a standoff, taking over a teammate's half-finished mess, a cross-team dependency that kept slipping. Judge how they attribute credit and blame, and whether they built a concrete mechanism (a doc, an interface contract, a weekly sync) or just "communicated more".`,

  learning: `Probe the most recent thing they had to learn under time pressure — what the deadline was, how they got from zero to shipping, what they got wrong on the first attempt. Judge the method (source selection, building to check understanding) and whether the learning transferred to something else. Not a list of courses watched.`,

  motivation: `Probe each transition on this résumé — why they left, what they were optimizing for, what would have kept them. Also probe what they want the next two years to look like and how this role fits. Judge consistency with the résumé timeline and specificity. A weak answer is generic career language that would fit any company.`,

  leadership: `Probe influence without formal authority: driving a technical decision across teams, mentoring someone who was struggling, owning an outcome end-to-end, making an unpopular call. Judge whether other people actually changed what they did, and whether the candidate owned the result — including when it went badly.`,
};

/**
 * 出题时用的维度指引：优先用用户存的描述，为空再退到预置指引。
 * 自定义维度没有预置指引，返回空串，出题 prompt 里那一段会整块略掉。
 */
export function resolveDimensionGuide(dimension: DimensionConfig): string {
  const own = dimension.description?.trim();
  if (own) return own;
  return PRESET_DIMENSION_GUIDES[dimension.key] ?? '';
}
