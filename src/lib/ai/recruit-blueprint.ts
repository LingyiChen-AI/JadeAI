import type { DimensionConfig, InterviewBlueprint, QuestionSlot } from '@/types/recruit';
import type { QuestionsOutput } from './recruit-schema';

type IndexedQuestionSlot = QuestionSlot & { slotIndex: number };

export type GeneratedGroup = {
  slots: QuestionSlot[];
  questions: QuestionsOutput['questions'];
};

export function detectGoRole(jobTitle: string, jobDescription: string): boolean {
  return /\b(?:go|golang)\b/i.test(`${jobTitle}\n${jobDescription}`);
}

export function validateBlueprint(
  input: InterviewBlueprint,
  options: {
    questionCount: number;
    dimensions: DimensionConfig[];
    isGoRole: boolean;
  },
): InterviewBlueprint {
  if (input.slots.length !== options.questionCount) {
    throw new Error(
      `Blueprint must contain exactly ${options.questionCount} slots; received ${input.slots.length}.`,
    );
  }

  const configuredDimensions = new Set(options.dimensions.map((dimension) => dimension.key));
  let goFundamentalsCount = 0;

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

    if (slot.category === 'go_fundamentals') {
      goFundamentalsCount += 1;
    }
  }

  if (options.isGoRole && options.questionCount >= 8 && goFundamentalsCount < 2) {
    throw new Error('Go roles require at least two go_fundamentals slots.');
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

export function meetsGenerationThreshold(generated: number, planned: number): boolean {
  return generated >= Math.ceil(planned * 0.7);
}

export function assembleGeneratedQuestions(
  groups: GeneratedGroup[],
  plannedCount: number,
): QuestionsOutput['questions'] {
  const ordered = groups
    .flatMap((group) => {
      const bound = bindQuestionsToSlots(group.questions, group.slots);

      return bound.map((question, index) => {
        const slot = group.slots[index] as Partial<IndexedQuestionSlot>;
        if (typeof slot.slotIndex !== 'number') {
          throw new Error('Generated question slot is missing its blueprint index.');
        }
        return { question, slotIndex: slot.slotIndex };
      });
    })
    .sort((left, right) => left.slotIndex - right.slotIndex);

  if (!meetsGenerationThreshold(ordered.length, plannedCount)) {
    throw new Error(
      `Generated ${ordered.length} of ${plannedCount} planned questions, below the 70% save threshold.`,
    );
  }

  return ordered.slice(0, plannedCount).map(({ question }) => question);
}
