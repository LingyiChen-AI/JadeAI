import type { DimensionConfig, InterviewBlueprint, QuestionSlot } from '@/types/recruit';
import { allocateQuestions } from '@/lib/recruit/scoring';
import type { QuestionsOutput } from './recruit-schema';

export type IndexedQuestionSlot = QuestionSlot & { slotIndex: number };

export type GeneratedGroup = {
  slots: IndexedQuestionSlot[];
  questions: QuestionsOutput['questions'];
};

export function detectGoRole(jobTitle: string, jobDescription: string): boolean {
  const roleText = `${jobTitle}\n${jobDescription}`;
  if (/\bgolang\b/i.test(roleText)) return true;

  const roleAdjacent = /(?:\bgo\b[ \t:/_-]+(?:backend|developer|engineer|programming|language|services?)\b|\b(?:backend|developer|engineer|programming|language|services?)[ \t:/_-]+go\b|\bgo\b[ \t]*(?:开发|后端|工程师|语言|服务)|(?:开发|后端|工程师|语言|服务)[ \t]*\bgo\b)/i;
  if (roleAdjacent.test(roleText)) return true;

  // Only accept a standalone Go token in an explicit technology/language context. Broad
  // proximity matching turns ordinary prose such as "experience ... willingness to go onsite"
  // into a false Go role.
  const explicitSkill = /\b(?:proficien(?:cy|t)|expertise|skilled|familiar(?:ity)?|knowledge|experience(?:d)?)\s+(?:(?:in|with|of|using)\s+)?go\b(?!-)/iu;
  const skillList = /\bskills?\s*:\s*[^\n;]{0,80}\bgo\b(?!-)/iu;
  const chineseSkill = /(?:精通|熟悉|掌握|使用|要求)(?:使用)?\s*go\b(?!-)/iu;
  const goExperience = /\bgo\b(?!-)\s*(?:language\s+)?(?:experience|experienced|开发经验|经验)/iu;

  return explicitSkill.test(roleText)
    || skillList.test(roleText)
    || chineseSkill.test(roleText)
    || goExperience.test(roleText);
}

function normalizeEvidence(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function evidenceSimilarity(left: string, right: string): number {
  const a = normalizeEvidence(left);
  const b = normalizeEvidence(right);
  if (a === b) return Number.POSITIVE_INFINITY;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) * 2;
  const chars = new Set(a);
  return [...new Set(b)].reduce((score, char) => score + (chars.has(char) ? 1 : 0), 0);
}

/** 将模型可能改写过的 evidence 重新绑定到对应来源列表中的原文。 */
export function canonicalizeBlueprintEvidence(input: InterviewBlueprint): InterviewBlueprint {
  const entries = {
    resume: input.resumeFacts,
    jd: input.jdRequirements,
    gap: input.gaps,
  } satisfies Record<QuestionSlot['source'], string[]>;

  return {
    ...input,
    slots: input.slots.map((slot) => {
      const candidates = entries[slot.source];
      if (candidates.length === 0) return { ...slot };
      const evidence = [...candidates].sort(
        (left, right) => evidenceSimilarity(slot.evidence, right) - evidenceSimilarity(slot.evidence, left),
      )[0];
      return { ...slot, evidence };
    }),
  };
}

export function validateBlueprint(
  input: InterviewBlueprint,
  options: {
    questionCount: number;
    dimensions: DimensionConfig[];
    isGoRole: boolean;
    enforceJdCoverage?: boolean;
  },
): InterviewBlueprint {
  if (input.slots.length !== options.questionCount) {
    throw new Error(
      `Blueprint must contain exactly ${options.questionCount} slots; received ${input.slots.length}.`,
    );
  }

  const configuredDimensions = new Set(options.dimensions.map((dimension) => dimension.key));
  const expectedDimensionCounts = allocateQuestions(options.dimensions, options.questionCount);
  const actualDimensionCounts = new Map<string, number>();
  const categoryCounts = new Map<QuestionSlot['category'], number>();
  const sourceCounts = new Map<QuestionSlot['source'], number>();
  const distinctJdEvidence = new Set<string>();
  const evidenceBySource = {
    resume: new Set(input.resumeFacts.map(normalizeEvidence)),
    jd: new Set(input.jdRequirements.map(normalizeEvidence)),
    gap: new Set(input.gaps.map(normalizeEvidence)),
  } satisfies Record<QuestionSlot['source'], Set<string>>;

  for (const slot of input.slots) {
    if (!configuredDimensions.has(slot.dimension)) {
      throw new Error(`Blueprint slot dimension "${slot.dimension}" is not configured.`);
    }

    if (!slot.topic.trim()) {
      throw new Error('Blueprint slot topic must not be empty.');
    }

    if (!slot.evidence.trim()) {
      throw new Error('Blueprint slot evidence must not be empty.');
    }

    if (!evidenceBySource[slot.source].has(normalizeEvidence(slot.evidence))) {
      const listName = slot.source === 'resume'
        ? 'resumeFacts'
        : slot.source === 'jd'
          ? 'jdRequirements'
          : 'gaps';
      throw new Error(
        `Blueprint ${slot.source} evidence must exactly match an entry in ${listName}.`,
      );
    }

    actualDimensionCounts.set(
      slot.dimension,
      (actualDimensionCounts.get(slot.dimension) ?? 0) + 1,
    );
    categoryCounts.set(slot.category, (categoryCounts.get(slot.category) ?? 0) + 1);
    sourceCounts.set(slot.source, (sourceCounts.get(slot.source) ?? 0) + 1);
    if (slot.source === 'jd') distinctJdEvidence.add(normalizeEvidence(slot.evidence));
  }

  if (options.enforceJdCoverage) {
    const resumeCount = sourceCounts.get('resume') ?? 0;
    const jdCount = sourceCounts.get('jd') ?? 0;
    const gapCount = sourceCounts.get('gap') ?? 0;
    const maxResume = Math.floor(options.questionCount * 0.4);
    const minJd = Math.ceil(options.questionCount * 0.35);
    const minJdAndGap = Math.ceil(options.questionCount * 0.6);
    const minGap = input.gaps.length > 0
      ? Math.max(2, Math.ceil(options.questionCount * 0.15))
      : 0;
    const minDistinctJd = Math.min(3, input.jdRequirements.length, minJd);

    if (resumeCount > maxResume) {
      throw new Error(`Blueprint may use at most ${maxResume} resume-sourced slots; received ${resumeCount}.`);
    }
    if (jdCount < minJd) {
      throw new Error(`Blueprint requires at least ${minJd} JD-sourced slots; received ${jdCount}.`);
    }
    if (gapCount < minGap) {
      throw new Error(`Blueprint requires at least ${minGap} gap-sourced slots; received ${gapCount}.`);
    }
    if (jdCount + gapCount < minJdAndGap) {
      throw new Error(`Blueprint requires at least ${minJdAndGap} JD-or-gap slots.`);
    }
    if (distinctJdEvidence.size < minDistinctJd) {
      throw new Error(`Blueprint must cover at least ${minDistinctJd} distinct JD requirements.`);
    }
  }

  for (const dimension of options.dimensions) {
    const expected = expectedDimensionCounts[dimension.key] ?? 0;
    const actual = actualDimensionCounts.get(dimension.key) ?? 0;
    if (actual !== expected) {
      throw new Error(
        `Blueprint dimension "${dimension.key}" must contain exactly ${expected} slots; received ${actual}.`,
      );
    }
  }

  const goFundamentalsCount = categoryCounts.get('go_fundamentals') ?? 0;
  if (options.isGoRole && options.questionCount >= 8 && goFundamentalsCount < 2) {
    throw new Error('Go roles require at least two go_fundamentals slots.');
  }

  if (options.isGoRole && options.questionCount >= 8) {
    const requiredCategories: QuestionSlot['category'][] = [
      'middleware_database',
      'project_deep_dive',
      'system_scenario',
      'communication_pressure',
      'hr_motivation',
    ];
    for (const category of requiredCategories) {
      if ((categoryCounts.get(category) ?? 0) < 1) {
        throw new Error(`Go roles with at least eight questions require a ${category} slot.`);
      }
    }
  }

  if (!options.isGoRole && goFundamentalsCount > 0) {
    throw new Error('Non-Go roles must not include go_fundamentals slots.');
  }

  return {
    resumeFacts: [...input.resumeFacts],
    jdRequirements: [...input.jdRequirements],
    gaps: [...input.gaps],
    slots: input.slots.map((slot) => ({ ...slot })),
  };
}

export function groupBlueprintSlots(
  slots: QuestionSlot[],
): Array<{ dimension: string; slots: IndexedQuestionSlot[] }> {
  const groups = new Map<string, IndexedQuestionSlot[]>();

  for (const [slotIndex, slot] of slots.entries()) {
    const indexedSlot = { ...slot, slotIndex };
    const dimensionSlots = groups.get(slot.dimension);
    if (dimensionSlots) {
      dimensionSlots.push(indexedSlot);
    } else {
      groups.set(slot.dimension, [indexedSlot]);
    }
  }

  return Array.from(groups, ([dimension, dimensionSlots]) => ({
    dimension,
    slots: dimensionSlots,
  }));
}

export function bindQuestionsToSlots(
  raw: QuestionsOutput['questions'],
  slots: QuestionSlot[],
): QuestionsOutput['questions'] {
  const count = Math.min(raw.length, slots.length);

  return Array.from({ length: count }, (_, index) => ({
    ...raw[index],
    category: slots[index].category,
    source: slots[index].source,
    dimension: slots[index].dimension,
    evidence: slots[index].evidence,
    difficulty: slots[index].difficulty,
  }));
}

export function assembleGeneratedQuestions(
  groups: GeneratedGroup[],
  plannedCount: number,
): QuestionsOutput['questions'] {
  for (const group of groups) {
    if (group.questions.length !== group.slots.length) {
      throw new Error(
        `Expected exactly ${group.slots.length} generated questions for dimension "${group.slots[0]?.dimension ?? 'unknown'}"; received ${group.questions.length}.`,
      );
    }
  }

  const ordered = groups
    .flatMap((group) => {
      const bound = bindQuestionsToSlots(group.questions, group.slots);

      return bound.map((question, index) => {
        const slot = group.slots[index];
        return { question, slotIndex: slot.slotIndex };
      });
    })
    .sort((left, right) => left.slotIndex - right.slotIndex);

  if (ordered.length !== plannedCount) {
    throw new Error(
      `Expected exactly ${plannedCount} generated questions; received ${ordered.length}.`,
    );
  }

  return ordered.map(({ question }) => question);
}
