import { allocateQuestions } from '@/lib/recruit/scoring';
import { resolveDimensionGuide } from '@/lib/recruit/dimension-guides';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const LANGUAGE_RULE = `IMPORTANT: Detect the primary language of the job description. You MUST respond entirely in that language. If the JD is in Chinese, all output (questions, rubrics, comments) must be in Chinese.`;

const JSON_RULE = `CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

const QUESTIONS_SYSTEM = `You are a senior interviewer at a top-tier technology company, known for questions that separate people who actually did the work from people who can describe it. You are writing the questions for ONE competency only — the one named in the user message.

${LANGUAGE_RULE}

THE MOST IMPORTANT RULE — keep the question SHORT:
- One sentence. One thing asked. Under 40 Chinese characters (or ~25 English words).
- A real interviewer says "跟我讲讲你为什么用 Golang 重写订单服务？" and then digs in based on the answer. They do NOT read out a paragraph with four sub-clauses.
- Long multi-clause questions actively hurt: the candidate answers only the last clause, and you lose the chance to see whether they can structure an answer themselves.
- Depth lives in "followUps", NOT in the question. Never front-load conditions, constraints or sub-questions into the stem — move every one of them into a follow-up.
- For experience questions, prefer: 跟我讲讲… / 带我过一遍… / 你当时怎么决定… / 说一次你…
- For scenario questions, state only the minimum situation and first decision: "支付成功率突然从 99.9% 降到 97%，你先做什么？" Put scale, constraints and changing conditions in follow-ups.

QUESTION PORTFOLIO — archetype and dimension are two different axes:
Question archetype is NOT the same as competency dimension. The competency says what to score;
the archetype says what kind of evidence to elicit. Before writing, silently assign each question one
of these archetypes. Do not add an archetype field to the JSON.

1. project deep-dive — verify work claimed on the résumé: ownership, architecture, trade-offs,
   production failures, measurable outcome and retrospective.
2. work scenario — give a realistic incident, design task or ambiguous business constraint from this
   role; let the candidate clarify, prioritize, propose, test and revise instead of guessing a slogan.
3. fundamentals — test mechanisms, boundaries and failure behavior behind a JD-required skill
   (the Chinese interview style sometimes calls this 八股文). Do not ask isolated definitions: connect
   the mechanism to debugging, design choice or a concrete consequence.
4. HR pressure — professionally challenge a résumé transition, failure, expectation, motivation or
   inconsistency. Apply firm follow-up pressure without humiliation, trick questions, discrimination,
   or questions about protected/private personal circumstances.
5. communication / collaboration — ask for a real conflict, stakeholder disagreement, difficult
   feedback or cross-team dependency; require a STAR-like account and inspect the candidate's exact words/actions.
6. JD gap probe — test an important JD requirement that the résumé does not prove. Do not assume the
   candidate has used it; distinguish transferable reasoning from fabricated experience.

Choose archetypes that genuinely reveal THIS competency:
- professional: primarily project deep-dive, work scenario, fundamentals and JD gap probe.
- logic: primarily work scenario, project debugging and JD gap probe.
- communication/teamwork/leadership/learning: primarily project evidence and communication / collaboration.
- stress/motivation: primarily HR pressure and project evidence.
- a custom competency: infer the best two or more archetypes from its description.
When producing 2+ questions, use at least two applicable archetypes. When producing 4+, include at
least one résumé-backed archetype and one JD-backed archetype. Never repeat the same event, knowledge
point or scenario with cosmetic rewording. Quality and applicability override mechanical quota filling.

Evidence anchor and factual boundaries:
- Every question must have a clear evidence anchor in either the résumé, the JD, or an explicit gap
  between them. A generic question that could be used unchanged for any role and candidate is a failure.
- Resume-backed questions may name only projects, technologies, responsibilities, transitions and
  numbers actually present in the résumé. Never invent a company situation, personal contribution,
  metric, failure, scale or outcome. If ownership is unclear, ask who owned it instead of asserting it.
- JD-backed questions may create a realistic hypothetical work situation using the JD's responsibilities
  and stack. Clearly phrase it as a scenario; never imply it happened to this candidate.
- If résumé and JD disagree, turn the mismatch into a neutral JD gap probe rather than silently treating
  either side as fact.

Seniority calibration:
- Infer the expected seniority from the job title, JD scope and résumé evidence. If signals conflict,
  calibrate to the JD and use follow-ups to find the candidate's ceiling.
- Junior: mechanisms, bounded implementation choices, local debugging, learning process and when to escalate.
- Mid-level: independent ownership, production diagnosis, cross-component trade-offs, delivery risk and collaboration.
- Senior / staff: ambiguous system design, scale/cost/reliability trade-offs, evolution and rollback,
  cross-team influence, prioritization and organizational consequences.
- Difficulty comes from the depth of reasoning and evidence required, not obscure trivia. Do not give a
  senior candidate junior recall questions or demand staff-level scope from a junior candidate.

Depth bar:
- Project questions must expose what the candidate personally did, why, under what constraint, what
  evidence they used, what went wrong and what they learned. Do not accept "we used X" as proof.
- Scenario questions must allow clarification and trade-offs; do not hide one magic answer or rely on riddles.
- Fundamentals questions must ask for cause-and-effect: mechanism → observable symptom → decision or fix.
- At least one third must be "hard" — the kind where someone who only used the tool superficially runs out of things to say within a minute.
- No warm-ups, no "tell me about yourself", no "what are your strengths".

"followUps" is the heart of the question. Give 4-6 of them, ordered as a funnel (wide → narrow). Each one has THREE fields:
- "purpose" — one of exactly these labels:
  · "要细节" — force out concrete numbers, scale, timeline
  · "要归因" — separate what THEY did from what the team did
  · "反事实" — remove an assumption and see if they still reason ("如果不能用 Redis 呢？")
  · "挑战" — push back once on their answer; a strong candidate defends with reasons, a weak one immediately folds
  · "要教训" — what would they change now
- "question" — the probe itself, one short sentence
- "answer" — REQUIRED. What a good answer to THIS probe sounds like, 2-4 sentences. Name the actual
  mechanism, the metric, the order of magnitude, the trade-off. The interviewer is not an expert in
  every area they interview for — without this they cannot tell whether the answer was good, and they
  cannot decide where to push next. For a behavioural probe, describe the shape of a strong answer
  (what a credible account contains) rather than a factual answer.
A good ladder uses at least three different purposes. Two generic follow-ups is a failure, and a
follow-up without an "answer" is a failure.

Other fields:
- "dimension" must be exactly the dimension key given in the user message, on every question.
- "intent" states what the question really discriminates between — a strong candidate and a plausible-sounding weak one. Not a restatement of the question.
- "rubric" describes an excellent / passing / failing answer concretely enough that an interviewer who is not an expert in this area can still tell them apart.
- "redFlags" — 2-4 things that, if you hear them, should count against the candidate. This is what an experienced interviewer actually carries in their head. Examples of the right shape: "把「我们团队做了」和「我做了」混着说，问细节就转回团队"、"只会复述文档里的默认配置". Not generic ("回答不深入").
- "referenceAnswer" — REQUIRED on every question, never empty. Write it as 4-6 lines separated by
  newlines. Each line is "标签：内容" — e.g. 定位阶段 / 技术细节 / 解决方案 / 具体指标 / 常见误区 —
  and names a concrete mechanism, term, metric or trade-off a strong answer would contain. This is the interviewer's cheat sheet: they read it after the candidate answers, to
  judge the answer and to decide what to dig into. Vague summaries ("能体现深度理解") are useless — be
  specific enough that someone who has never worked with this technology could still spot a wrong
  answer. For open-ended or behavioural questions, describe the skeleton of a strong account
  (what facts, what numbers, what self-criticism it would contain) instead of a factual answer.
- "estimatedMinutes" is an integer covering the question AND its follow-ups; "difficulty" is one of easy / medium / hard.

Return JSON with this exact shape:
{"questions":[{"dimension":"","question":"","intent":"","rubric":{"excellent":"","pass":"","fail":""},"followUps":[{"purpose":"要细节","question":"","answer":""}],"redFlags":[],"referenceAnswer":"","estimatedMinutes":8,"difficulty":"medium"}]}

${JSON_RULE}`;

const EVALUATION_SYSTEM = `You are a seasoned hiring interviewer scoring a completed interview. You are given the JD, the candidate's resume, the question set (with rubrics), and the raw interview transcript.

${LANGUAGE_RULE}

Rules:
- Some questions include a "Candidate's recorded answer" line. For those, score that recorded answer directly — do not search the transcript for them, and always set "answered" to true.
- For each question, locate the candidate's answer in the transcript. Summarize it in "answerSummary".
- If a question was never asked or never answered, set "answered" to false and "score" to 0. Do NOT invent an answer.
- Score each question 0-100 against its rubric.
- For each dimension, give a 0-100 score based ONLY on the questions in that dimension that were actually answered. If no question in a dimension was answered, still return the dimension with score 0 — the caller will exclude it.
- Do NOT compute any aggregate or total score. The caller computes it from the dimension scores and the configured weights.
- "recommendation" is one of: strong_hire, hire, hold, no_hire. Base it on the whole picture, not just the numbers.
- "strengths" and "concerns" are concrete, evidence-backed observations from the transcript — not generic praise.

Return JSON with this exact shape:
{"questionEvaluations":[{"questionId":"","answerSummary":"","answered":true,"score":0,"highlights":[],"weaknesses":[]}],"dimensionScores":[{"key":"","score":0}],"strengths":[],"concerns":[],"overallComment":"","recommendation":"hold","recommendationReason":""}

${JSON_RULE}`;

export interface QuestionsPromptInput {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  dimensions: DimensionConfig[];
  questionCount: number;
}

/**
 * 按权重把题数分给各维度。出题按维度分开、并发去请求，
 * 调用方拿这个结果决定每一路要几道题。
 */
export function planQuestionGeneration(
  input: QuestionsPromptInput,
): { dimension: DimensionConfig; count: number }[] {
  const allocation = allocateQuestions(input.dimensions, input.questionCount);
  return input.dimensions
    .map((dimension) => ({ dimension, count: allocation[dimension.key] ?? 0 }))
    .filter((task) => task.count > 0);
}

export interface DimensionQuestionsPromptInput extends Omit<QuestionsPromptInput, 'questionCount'> {
  dimension: DimensionConfig;
  count: number;
}

/**
 * 单个维度的出题 prompt。
 *
 * 一次让模型出完所有维度的话，它会把注意力摊平，八个维度出来的题
 * 长得像同一道题换了主语。拆开之后每一路只盯着一个考察点，
 * 而且那个维度的描述能整段进 prompt，问法才真的有区别。
 */
export function buildDimensionQuestionsPrompt(input: DimensionQuestionsPromptInput): {
  system: string;
  prompt: string;
} {
  const guide = resolveDimensionGuide(input.dimension);
  const guideBlock = guide ? `\nHow to probe this competency:\n${guide}\n` : '';

  // 把别的维度列出来，让模型知道哪些角度不归它管，避免几路问出重复的题。
  const others = input.dimensions
    .filter((d) => d.key !== input.dimension.key)
    .map((d) => d.label);
  const othersBlock = others.length
    ? `\nOther interviewers are covering these competencies — do NOT ask about them: ${others.join(', ')}\n`
    : '';

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Competency to assess: ${input.dimension.label} (key: ${input.dimension.key})
${guideBlock}${othersBlock}
Produce exactly ${input.count} question${input.count === 1 ? '' : 's'}, all with "dimension" set to "${input.dimension.key}".

Respond with JSON only.`;

  return { system: QUESTIONS_SYSTEM, prompt };
}

export interface EvaluationPromptInput {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  dimensions: DimensionConfig[];
  questions: InterviewQuestion[];
  transcript: string;
}

export function buildEvaluationPrompt(input: EvaluationPromptInput): {
  system: string;
  prompt: string;
} {
  const questionBlocks = input.questions
    .map((q, i) => {
      const base = `${i + 1}. [id: ${q.id}] [dimension: ${q.dimension}]
Question: ${q.question}
What it probes: ${q.intent}
Excellent answer: ${q.rubric.excellent}
Passing answer: ${q.rubric.pass}
Failing answer: ${q.rubric.fail}
Reference points: ${q.referencePoints.join('; ')}${
        q.redFlags?.length ? `\nRed flags: ${q.redFlags.join('; ')}` : ''
      }${
        // 客观题带了参考答案，拿它当基准比只看 rubric 判得准
        q.referenceAnswer?.trim() ? `\nReference answer: ${q.referenceAnswer.trim()}` : ''
      }`;

      // 面试中逐题记下来的答案是确定的，直接给模型，省得它从整段速记里
      // 猜哪句对应哪题——那正是归错题的来源。
      const answer = q.answer?.trim();
      return answer ? `${base}\nCandidate's recorded answer: ${answer}` : base;
    })
    .join('\n\n');

  const dimensionLines = input.dimensions
    .map((d) => `- ${d.label} (key: ${d.key})`)
    .join('\n');

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Dimensions to score:
${dimensionLines}

Question set:
${questionBlocks}

Interview transcript:
${input.transcript}

Respond with JSON only.`;

  return { system: EVALUATION_SYSTEM, prompt };
}
