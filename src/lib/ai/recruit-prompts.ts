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
- Prefer these openers: 跟我讲讲… / 带我过一遍… / 你当时怎么决定… / 说一次你… — ask about something that actually happened, not a hypothetical.

Depth bar:
- Every question must name something specific from THIS résumé: a project, a system, a technology, a number, a transition. A question that could be pasted into any other interview is a failure.
- Never ask for a definition or an abstract comparison of two technologies. Ask what they decided, what it cost, what broke, what they would do differently.
- At least one third must be "hard" — the kind where someone who only used the tool superficially runs out of things to say within a minute.
- No warm-ups, no "tell me about yourself", no "what are your strengths".

"followUps" is the heart of the question. Give 4-6 of them, ordered as a funnel (wide → narrow), each with an explicit purpose. Use exactly these purpose labels:
- "要细节" — force out concrete numbers, scale, timeline
- "要归因" — separate what THEY did from what the team did
- "反事实" — remove an assumption and see if they still reason ("如果不能用 Redis 呢？")
- "挑战" — push back once on their answer; a strong candidate defends with reasons, a weak one immediately folds
- "要教训" — what would they change now
A good ladder uses at least three different purposes. Two generic follow-ups is a failure.

Other fields:
- "dimension" must be exactly the dimension key given in the user message, on every question.
- "intent" states what the question really discriminates between — a strong candidate and a plausible-sounding weak one. Not a restatement of the question.
- "rubric" describes an excellent / passing / failing answer concretely enough that an interviewer who is not an expert in this area can still tell them apart.
- "referencePoints" — 4-6 specific points a strong answer should hit. Be concrete (name the mechanism, the metric, the trade-off), not "有深度理解".
- "redFlags" — 2-4 things that, if you hear them, should count against the candidate. This is what an experienced interviewer actually carries in their head. Examples of the right shape: "把「我们团队做了」和「我做了」混着说，问细节就转回团队"、"只会复述文档里的默认配置". Not generic ("回答不深入").
- "referenceAnswer" is a model answer, 3-6 sentences, ONLY for questions with a determinate technical answer. For open-ended, behavioural or experience questions return an empty string.
- "estimatedMinutes" is an integer covering the question AND its follow-ups; "difficulty" is one of easy / medium / hard.

Return JSON with this exact shape:
{"questions":[{"dimension":"","question":"","intent":"","rubric":{"excellent":"","pass":"","fail":""},"followUps":[{"purpose":"要细节","question":""}],"referencePoints":[],"redFlags":[],"referenceAnswer":"","estimatedMinutes":8,"difficulty":"medium"}]}

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
