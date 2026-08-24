import type { DimensionConfig, InterviewBlueprint, QuestionSlot } from '@/types/recruit';
import type { QuestionsOutput } from './recruit-schema';

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

  if (options.isGoRole && goFundamentalsCount < 2) {
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
): Array<{ dimension: string; slots: QuestionSlot[] }> {
  const groups = new Map<string, QuestionSlot[]>();

  for (const slot of slots) {
    const dimensionSlots = groups.get(slot.dimension);
    if (dimensionSlots) {
      dimensionSlots.push({ ...slot });
    } else {
      groups.set(slot.dimension, [{ ...slot }]);
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
