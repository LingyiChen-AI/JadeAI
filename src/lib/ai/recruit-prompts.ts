import { allocateQuestions } from '@/lib/recruit/scoring';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const LANGUAGE_RULE = `IMPORTANT: Detect the primary language of the job description. You MUST respond entirely in that language. If the JD is in Chinese, all output (questions, rubrics, comments) must be in Chinese.`;

const JSON_RULE = `CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

const QUESTIONS_SYSTEM = `You are a seasoned hiring interviewer. Given a job description, a candidate's resume, and the competencies to assess, design a personalized interview question set.

${LANGUAGE_RULE}

Rules:
- Follow the per-dimension question counts given in the user message EXACTLY. If it says 6 questions for 专业技能, produce exactly 6 questions whose "dimension" field is that dimension's key.
- Ground every question in this specific candidate's resume and this specific JD. Never produce generic questions that could be asked of anyone.
- "intent" states what the question is really probing for — not a restatement of the question.
- "rubric" describes what an excellent / passing / failing answer looks like, concretely enough that a non-expert interviewer can judge.
- "followUps" are 2-3 probing directions to prevent rehearsed answers.
- "referencePoints" are the points a strong answer should cover.
- "estimatedMinutes" is an integer; "difficulty" is one of easy / medium / hard.

Return JSON with this exact shape:
{"questions":[{"dimension":"","question":"","intent":"","rubric":{"excellent":"","pass":"","fail":""},"followUps":[],"referencePoints":[],"estimatedMinutes":5,"difficulty":"medium"}]}

${JSON_RULE}`;

const EVALUATION_SYSTEM = `You are a seasoned hiring interviewer scoring a completed interview. You are given the JD, the candidate's resume, the question set (with rubrics), and the raw interview transcript.

${LANGUAGE_RULE}

Rules:
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

export function buildQuestionsPrompt(input: QuestionsPromptInput): {
  system: string;
  prompt: string;
  allocation: Record<string, number>;
} {
  const allocation = allocateQuestions(input.dimensions, input.questionCount);

  // 逐维度写死题数——不这么做的话，用户配的权重对模型毫无约束力。
  const allocationLines = input.dimensions
    .map((d) => `- ${d.label} (key: ${d.key}): ${allocation[d.key] ?? 0} questions`)
    .join('\n');

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Competencies to assess and the exact number of questions for each:
${allocationLines}

Total questions: ${input.questionCount}

Respond with JSON only.`;

  return { system: QUESTIONS_SYSTEM, prompt, allocation };
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
    .map(
      (q, i) => `${i + 1}. [id: ${q.id}] [dimension: ${q.dimension}]
Question: ${q.question}
What it probes: ${q.intent}
Excellent answer: ${q.rubric.excellent}
Passing answer: ${q.rubric.pass}
Failing answer: ${q.rubric.fail}
Reference points: ${q.referencePoints.join('; ')}`,
    )
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
