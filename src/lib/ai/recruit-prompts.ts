import { resolveDimensionGuide } from '@/lib/recruit/dimension-guides';
import { detectGoRole } from '@/lib/ai/recruit-blueprint';
import { allocateQuestions } from '@/lib/recruit/scoring';
import type {
  DimensionConfig,
  InterviewBlueprint,
  InterviewQuestion,
  QuestionSlot,
} from '@/types/recruit';

const LANGUAGE_RULE = `IMPORTANT: Detect the primary language of the job description. You MUST respond entirely in that language. If the JD is in Chinese, all output (questions, rubrics, comments) must be in Chinese.`;

const JSON_RULE = `CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

const SLOT_QUESTIONS_SYSTEM = `You are a senior interviewer at a top-tier technology company, known for questions that separate people who actually did the work from people who can describe it. You are writing the questions for ONE competency only — the one named in the user message.

${LANGUAGE_RULE}

THE MOST IMPORTANT RULE — keep the question SHORT:
- One sentence. One thing asked. Under 40 Chinese characters (or ~25 English words).
- A real interviewer says "跟我讲讲你为什么用 Golang 重写订单服务？" and then digs in based on the answer. They do NOT read out a paragraph with four sub-clauses.
- Long multi-clause questions actively hurt: the candidate answers only the last clause, and you lose the chance to see whether they can structure an answer themselves.
- Depth lives in "followUps", NOT in the question. Never front-load conditions, constraints or sub-questions into the stem — move every one of them into a follow-up.
- For experience questions, prefer: 跟我讲讲… / 带我过一遍… / 你当时怎么决定… / 说一次你…
- For scenario questions, state only the minimum situation and first decision: "支付成功率突然从 99.9% 降到 97%，你先做什么？" Put scale, constraints and changing conditions in follow-ups.

SLOT ASSIGNMENT — the user message lists ordered question slots. A slot is the complete question assignment: its category, source, dimension, topic, evidence, and difficulty are already decided.
Generate exactly one output question for each input slot, in that same order. Do not choose or rebalance categories, sources, dimensions, or difficulty. Do not substitute a different topic, evidence anchor, or question type. Never merge two slots or add a question. Use the category only to shape the question:
project deep dives verify claimed work; scenarios are hypothetical; fundamentals connect mechanism →
symptom → engineering decision; communication or HR pressure remains professional and non-discriminatory.

Evidence anchor and factual boundaries:
- The input slot's source and evidence are the authoritative evidence anchor. A generic question that
  could be used unchanged for any role and candidate is a failure.
- For source "resume", evidence must come from "resumeFacts". Resume-backed questions may name only
  those facts; Never invent a company situation, personal contribution, metric, failure, scale, outcome,
  architecture, ownership, or tool. If ownership is unclear, ask who owned it instead of asserting it.
- For source "jd", evidence must come from "jdRequirements". JD-backed questions may create a realistic
  hypothetical work situation using only that requirement; never imply it happened to this candidate.
- For source "gap", evidence must come from "gaps". A gap question must not imply prior experience;
  test transferable reasoning or learning instead. If "gaps" is empty, do not generate a gap question.

Seniority calibration:
- Honor each slot's assigned difficulty. Infer the expected seniority from the job title, JD scope and résumé evidence to calibrate the follow-up depth; if signals conflict, calibrate to the JD and use follow-ups to find the candidate's ceiling.
- Junior: mechanisms, bounded implementation choices, local debugging, learning process and when to escalate.
- Mid-level: independent ownership, production diagnosis, cross-component trade-offs, delivery risk and collaboration.
- Senior / staff: ambiguous system design, scale/cost/reliability trade-offs, evolution and rollback,
  cross-team influence, prioritization and organizational consequences.
- Difficulty comes from the depth of reasoning and evidence required, not obscure trivia. Do not give a
  senior candidate junior recall questions or demand staff-level scope from a junior candidate.

REAL INTERVIEW QUESTION SHAPE — follow the slot category, not whatever buzzword is easiest to ask:
- Every question must test a JD must-have, a credible résumé claim, or a material gap. If the connection to
  job performance is not obvious, rewrite it. A question that merely sounds technical is a failure.
- Do not ask for an obscure constant, default value, API name, or library name unless the JD explicitly
  requires that exact knowledge or the résumé explicitly claims having tuned/implemented it. Never turn a
  gap into a vocabulary quiz such as “name a Python CLI library”. Test how the person would deliver the work.
- Project deep-dive stem: begin from the claimed project, ask for the person's responsibility or a concrete
  decision, then use follow-ups for implementation, evidence, failure, and reflection. Do not assume they
  tuned a parameter, owned an architecture, or achieved a metric before they say so.
- Scenario stem: give one realistic job task with a concrete desired outcome. Follow-ups progressively add
  input/output, failure, observability, security, delivery, or acceptance constraints. Do not ask “how would
  you design X” without enough workplace context to make trade-offs possible.
- Fundamentals stem: prefer high-frequency core mechanisms that affect this JD. Connect mechanism to a code
  example, production symptom, debugging signal, or engineering choice; never stop at reciting a definition.
- Behavioral / pressure stem: ask for one past event and require Situation → personal Action → Result →
  reflection evidence. Hypothetical slogans such as “I would communicate more” are not enough.
- HR motivation stem: test the concrete choice, expectations, constraints, and consistency with this role;
  do not ask generic self-introduction, personality, family, age, relationship, or other protected topics.

Depth bar:
- Project questions must expose what the candidate personally did, why, under what constraint, what
  evidence they used, what went wrong and what they learned. Do not accept "we used X" as proof.
- Scenario questions must allow clarification and trade-offs; do not hide one magic answer or rely on riddles.
- Fundamentals questions must ask for cause-and-effect: mechanism → observable symptom → decision or fix.
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

const EVALUATION_SYSTEM = `You are a seasoned hiring interviewer writing an internal hiring decision memo for HR. You are given the JD, the resume, the question set (with rubrics), and the raw interview transcript.

${LANGUAGE_RULE}

Rules:
- Some questions include a "Candidate's recorded answer" line. For those, score that recorded answer directly — do not search the transcript for them, and always set "answered" to true.
- For each question, locate the candidate's answer in the transcript. Summarize it in "answerSummary".
- If a question was never asked or never answered, set "answered" to false and "score" to 0. Do NOT invent an answer.
- A JD-sourced question's premise, reference answer, or hypothetical reasoning is not evidence of prior experience. A gap-sourced question's premise, reference answer, or hypothetical reasoning is not evidence of prior experience. An explicit concrete prior-work account in the candidate's recorded answer or transcript may be treated as interview evidence and assessed for specificity and credibility; do not upgrade mere hypotheticals into experience.
- Score each question 0-100 against its rubric.
- For each dimension, give a 0-100 score based ONLY on the questions in that dimension that were actually answered. If no question in a dimension was answered, still return the dimension with score 0 — the caller will exclude it.
- Do NOT compute any aggregate or total score. The caller computes it from the dimension scores and the configured weights.
- "recommendation" is one of: strong_hire, hire, hold, no_hire. Base it on the whole picture, not just the numbers.
- Explicitly match against the JD must-haves; bonus skills cannot compensate for an unverified must-have.
- This is an internal evidence memo, not feedback addressed to the interviewee. Never use the candidate name,
  greetings, second-person address, or repeated labels such as “候选人/该候选人”. Write findings directly
  and impersonally: “已展示…”, “回答显示…”, “本轮未验证…”.
- Do not use demographic or identity labels (student status, age, gender, school tier, marital/family status)
  unless the JD contains a lawful, job-essential requirement and the interview produced directly relevant evidence.
  Never use personality-laden wording such as “稚嫩”, “聪明”, “老实”, “有灵性”, or “气场不足”.
- Evidence boundary: a résumé claim is context, not verified evidence. Use the interview answers to confirm it.
  A missing answer means “本轮未验证”, not “不会/缺乏/能力差”. Do not infer collaboration, learning ability,
  ownership, stability, or engineering maturity from unrelated technical answers.
- Coverage guardrail: if fewer than 5 substantive questions were assessed, or fewer than half of configured
  dimensions have answered evidence, force recommendation="hold". State that evidence is insufficient and list
  exactly what a follow-up interview must verify; do not produce a confident hire/no-hire conclusion.
- "strengths": 3-5 substantive advantages. Each item must contain (1) a clear competency conclusion,
  (2) concrete evidence from a specific recorded answer/transcript detail, and (3) why that evidence matters
  for this JD. Do not write generic praise or repeat dimension scores.
- "concerns": 3-5 substantive weaknesses or risks. Each item must contain (1) the observed gap,
  (2) concrete answer evidence or an explicit lack of evidence, (3) its likely impact on this JD, and
  (4) what should be verified next. Distinguish "not demonstrated" from "cannot do".
- "overallComment": write a detailed, decision-useful Chinese assessment of roughly 600-1000 Chinese
  characters (or equivalent detail in the JD language). Use exactly these four paragraph labels, each followed
  by evidence-based prose: “岗位匹配：”, “已验证能力：”, “主要风险：”, “录用建议：”. For every conclusion,
  cite the question/answer evidence that supports it. Put unassessed must-haves under “主要风险” as “本轮未验证”
  with a proposed verification method. Do not restate the résumé, JD, score, strengths list, or concerns list.
- "recommendationReason": 100-200 Chinese characters (or equivalent), explicitly connecting the recommendation
  to must-have JD coverage, strongest evidence, and the most important unresolved risk.

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

function buildPortfolioRules(questionCount: number): string {
  const minimum = (share: number) => Math.max(1, Math.round(questionCount * share));
  const range = (lowerShare: number, upperShare: number) => {
    const lower = minimum(lowerShare);
    return [lower, Math.max(lower, Math.floor(questionCount * upperShare))] as const;
  };

  const foundations = Math.max(1, Math.ceil(questionCount * 0.3));
  const [projectMinimum, projectMaximum] = range(0.2, 0.3);
  const [scenarioMinimum, scenarioMaximum] = range(0.15, 0.25);
  const [communicationMinimum, communicationMaximum] = range(0.15, 0.25);

  return `Portfolio coverage — use these count-aware, feasible integer equivalents of the percentage targets:
- Technical foundations (go_fundamentals, backend_fundamentals, middleware_database): at least ${foundations} slots (≥30%).
- Project deep-dives: ${projectMinimum}–${projectMaximum} slots (20–30%).
- System scenarios: ${scenarioMinimum}–${scenarioMaximum} slots (15–25%).
- Communication and HR: ${communicationMinimum}–${communicationMaximum} slots (15–25%).`;
}

export function buildInterviewBlueprintPrompt(input: QuestionsPromptInput): {
  system: string;
  prompt: string;
} {
  const allocation = allocateQuestions(input.dimensions, input.questionCount);
  const dimensionLines = input.dimensions
    .map((dimension) => {
      const description = resolveDimensionGuide(dimension) || '(no description configured)';
      return `- ${dimension.label} (key: ${dimension.key}, weight: ${dimension.weight}, exactly ${allocation[dimension.key] ?? 0} slots)\n  Description: ${description}`;
    })
    .join('\n');
  const isGoRole = detectGoRole(input.jobTitle, input.jobDescription);
  const goMinimum = isGoRole && input.questionCount >= 8
    ? 'The server classified this as a Go-specific role. Include at least 2 go_fundamentals slots.'
    : isGoRole
      ? 'The server classified this as a Go-specific role. Include go_fundamentals only where the small slot count allows.'
      : 'The server classified this as a non-Go role. Do not use go_fundamentals.';
  const requiredGoPortfolio = isGoRole && input.questionCount >= 8
    ? `Required Go interview portfolio:
- at least 1 middleware_database slot
- at least 1 project_deep_dive slot
- at least 1 system_scenario slot
- at least 1 communication_pressure slot
- at least 1 hr_motivation slot`
    : '';
  const portfolioRules = buildPortfolioRules(input.questionCount);
  const maxResume = Math.floor(input.questionCount * 0.4);
  const minJd = Math.ceil(input.questionCount * 0.35);
  const minGap = Math.max(2, Math.ceil(input.questionCount * 0.15));
  const minJdAndGap = Math.ceil(input.questionCount * 0.6);

  const system = `You are an interview planner. Return only one strict interview blueprint JSON object.

${LANGUAGE_RULE}

First extract concise, explicit facts into three separate lists:
- "resumeFacts": only facts stated in the résumé.
- "jdRequirements": split the JD into atomic requirements. Include every material must-have responsibility
  and skill (language, tools, workflow, deliverables, engineering practices), not only requirements that overlap
  with the résumé.
- "gaps": neutral, explicit comparisons where a material JD requirement is not proven by the résumé.
Never convert an inference into a résumé fact. Do not invent metrics, architecture, incidents, ownership,
tools, scale, outcomes, or a candidate's experience.

Then create exactly ${input.questionCount} slots. ${goMinimum}

Each slot must use one configured dimension key, one allowed category, one allowed source, a concrete topic,
a concrete evidence string, and a difficulty. Allowed categories: go_fundamentals, backend_fundamentals,
middleware_database, project_deep_dive, system_scenario, communication_pressure, hr_motivation. Allowed
sources: resume, jd, gap. For a fundamentals slot, express its topic as mechanism → observable symptom →
engineering decision. Allowed difficulty values: easy | medium | hard. Cover important evidence without
duplicating the same event or knowledge point.

For every slot, copy one complete entry exactly from the corresponding source list into "evidence":
resume → resumeFacts, jd → jdRequirements, gap → gaps. Do not paraphrase, shorten, combine, or extend it.

Mandatory source portfolio:
- resume: at most ${maxResume} slots (≤40%).
- jd: at least ${minJd} slots (≥35%), covering at least 3 distinct JD requirements when available.
- gap: when gaps is non-empty, at least ${minGap} slots (≥15% and at least 2); otherwise 0 gap slots.
- jd + gap combined: at least ${minJdAndGap} slots (≥60%).
Prioritize the JD's must-have requirements before bonus items. Reusing one evidence entry is allowed only for
genuinely different topics; do not let a strong résumé crowd out Python, AI coding tools, Skill/plugin/CLI,
Prompt/API integration, Git/automation, or other explicit JD requirements.

${portfolioRules}

${requiredGoPortfolio}

If gaps is non-empty, satisfy the mandatory gap quota above. If gaps is empty, include at least one jd system_scenario slot instead, and do not create a gap slot.

Configured dimensions and mandatory slot allocations (use every key exactly the stated number of times):
${dimensionLines}

Return JSON with this exact shape:
{"resumeFacts":[""],"jdRequirements":[""],"gaps":[""],"slots":[{"category":"backend_fundamentals","source":"jd","dimension":"","topic":"","evidence":"","difficulty":"medium"}]}

${JSON_RULE}`;

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Configured interview dimensions:
${dimensionLines}

Plan the interview blueprint now.`;

  return { system, prompt };
}

export interface DimensionQuestionsPromptInput extends Omit<QuestionsPromptInput, 'questionCount'> {
  dimension: DimensionConfig;
  blueprint: InterviewBlueprint;
  slots: QuestionSlot[];
}

/**
 * 单个维度的出题 prompt。
 *
 * 一次让模型出完所有维度的话，它会把注意力摊平，八个维度出来的题
 * 长得像同一道题换了主语。拆开之后每一路只盯着一个考察点，
 * 而且那个维度的描述能整段进 prompt，问法才真的有区别。
 */
export function buildDimensionQuestionsPrompt(
  input: DimensionQuestionsPromptInput,
): {
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
  const listFacts = (facts: string[]) =>
    facts.length ? facts.map((fact) => `- ${fact}`).join('\n') : '- (none)';
  const slotBlocks = input.slots
    .map(
      (slot, index) => `Slot ${index + 1}
category: ${slot.category}
source: ${slot.source}
dimension: ${slot.dimension}
topic: ${slot.topic}
evidence: ${slot.evidence}
difficulty: ${slot.difficulty}`,
    )
    .join('\n\n');

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Global blueprint facts — these are the shared factual boundaries for every question:
Resume facts:
${listFacts(input.blueprint.resumeFacts)}

JD requirements:
${listFacts(input.blueprint.jdRequirements)}

Gaps:
${listFacts(input.blueprint.gaps)}

Competency to assess: ${input.dimension.label} (key: ${input.dimension.key})
${guideBlock}${othersBlock}Assigned slots:
${slotBlocks}

Produce one output question per slot, in order. Preserve each slot's category, source, dimension, topic,
evidence, and difficulty; the slot is the complete question assignment.

Respond with JSON only.`;

  return { system: SLOT_QUESTIONS_SYSTEM, prompt };
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
      const evidence = q.evidence?.trim();
      const metadata = evidence
        ? [
            q.category ? `Category: ${q.category}` : '',
            q.source ? `Source: ${q.source}` : '',
            `Evidence: ${evidence}`,
          ].filter(Boolean)
        : [];
      const base = `${i + 1}. [id: ${q.id}] [dimension: ${q.dimension}]
Question: ${q.question}
${metadata.length ? `${metadata.join('\n')}\n` : ''}What it probes: ${q.intent}
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
  const assessedDimensionCount = new Set(input.questions.map((q) => q.dimension)).size;

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Dimensions to score:
${dimensionLines}

Interview coverage: ${input.questions.length} questions across ${assessedDimensionCount} of ${input.dimensions.length} configured dimensions.

Question set:
${questionBlocks}

Interview transcript:
${input.transcript}

Respond with JSON only.`;

  return { system: EVALUATION_SYSTEM, prompt };
}
