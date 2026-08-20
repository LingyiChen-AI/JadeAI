import { allocateQuestions } from '@/lib/recruit/scoring';
import { resolveDimensionGuide } from '@/lib/recruit/dimension-guides';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const LANGUAGE_RULE = `IMPORTANT: Detect the primary language of the job description. You MUST respond entirely in that language. If the JD is in Chinese, all output (questions, rubrics, comments) must be in Chinese.`;

const JSON_RULE = `CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

const QUESTIONS_SYSTEM = `You are a senior interviewer at a top-tier technology company, known for questions that separate people who actually did the work from people who can describe it. You are writing the questions for ONE competency only — the one named in the user message.

${LANGUAGE_RULE}

Depth bar — this matters more than any other rule:
- Every question must name something specific from THIS résumé: a project, a system, a technology, a number, a transition. A question that could be pasted into any other interview is a failure.
- Never ask for a definition, a comparison of two technologies in the abstract, or anything answerable from documentation. Ask what they decided, what it cost, what broke, what they would do differently.
- Aim high: at least one third of the questions must be "hard" — the kind where a candidate who only used the tool superficially will run out of things to say within a minute.
- No warm-ups, no "tell me about yourself", no "what are your strengths".

Field rules:
- "dimension" must be exactly the dimension key given in the user message, on every question.
- "intent" states what the question really discriminates between — a strong candidate and a plausible-sounding weak one. Not a restatement of the question.
- "rubric" describes an excellent / passing / failing answer concretely enough that an interviewer who is not an expert in this area can still tell them apart.
- "followUps" are 2-3 pointed probes for when the first answer is rehearsed or vague.
- "referencePoints" are the specific points a strong answer should hit.
- "referenceAnswer" is a model answer, 3-6 sentences, ONLY for questions that have a determinate technical answer. For open-ended, behavioural, or experience questions there is no correct answer — return an empty string. Do not pad it with generic advice.
- "estimatedMinutes" is an integer; "difficulty" is one of easy / medium / hard.

Return JSON with this exact shape:
{"questions":[{"dimension":"","question":"","intent":"","rubric":{"excellent":"","pass":"","fail":""},"followUps":[],"referencePoints":[],"referenceAnswer":"","estimatedMinutes":5,"difficulty":"medium"}]}

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
