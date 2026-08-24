import { describe, expect, it } from 'vitest';
import type { DimensionConfig, InterviewBlueprint, QuestionSlot } from '@/types/recruit';
import type { QuestionsOutput } from './recruit-schema';
import {
  bindQuestionsToSlots,
  groupBlueprintSlots,
  meetsGenerationThreshold,
  validateBlueprint,
} from './recruit-blueprint';

const dimensions: DimensionConfig[] = [
  { key: 'professional', label: 'Professional skill', weight: 2, custom: false },
  { key: 'communication', label: 'Communication', weight: 1, custom: false },
];

const slotA: QuestionSlot = {
  category: 'go_fundamentals',
  source: 'jd',
  dimension: 'professional',
  topic: 'Goroutine scheduling',
  evidence: 'The role requires Go concurrency experience',
  difficulty: 'hard',
};

const slotB: QuestionSlot = {
  category: 'communication_pressure',
  source: 'resume',
  dimension: 'communication',
  topic: 'Stakeholder alignment',
  evidence: 'The resume describes cross-team projects',
  difficulty: 'medium',
};

const slotC: QuestionSlot = {
  category: 'backend_fundamentals',
  source: 'gap',
  dimension: 'professional',
  topic: 'Database indexes',
  evidence: 'The resume lacks database optimization details',
  difficulty: 'medium',
};

const blueprintWith8SlotsAnd2Go: InterviewBlueprint = {
  resumeFacts: ['Built backend services'],
  jdRequirements: ['Strong Go experience'],
  gaps: ['No database tuning examples'],
  slots: [
    slotA,
    { ...slotA, topic: 'Channel ownership' },
    slotB,
    slotC,
    { ...slotB, topic: 'Conflict resolution' },
    { ...slotC, topic: 'Transaction isolation' },
    { ...slotB, topic: 'Technical explanation' },
    { ...slotC, topic: 'Caching strategy' },
  ],
};

const rawQuestion: QuestionsOutput['questions'][number] = {
  dimension: 'incorrect-model-dimension',
  category: 'hr_motivation',
  source: 'resume',
  evidence: 'incorrect model evidence',
  question: 'How would you explain a goroutine leak?',
  intent: 'Assess debugging skill',
  rubric: { excellent: 'Explains detection and remediation', pass: 'Names a cause', fail: 'Cannot explain' },
  followUps: [],
  referencePoints: ['pprof'],
  redFlags: [],
  referenceAnswer: '',
  estimatedMinutes: 7,
  difficulty: 'easy',
};

describe('validateBlueprint', () => {
  it('accepts a Go blueprint with the requested number of slots', () => {
    const result = validateBlueprint(blueprintWith8SlotsAnd2Go, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    });

    expect(result.slots).toHaveLength(8);
  });

  it('returns a fresh blueprint without mutating its input', () => {
    const original = structuredClone(blueprintWith8SlotsAnd2Go);
    const result = validateBlueprint(blueprintWith8SlotsAnd2Go, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    });

    expect(result).toEqual(original);
    expect(result).not.toBe(blueprintWith8SlotsAnd2Go);
    expect(result.slots).not.toBe(blueprintWith8SlotsAnd2Go.slots);
    expect(blueprintWith8SlotsAnd2Go).toEqual(original);
  });

  it('rejects a Go blueprint with fewer than two Go fundamentals slots', () => {
    const blueprintWithOnly1GoSlot = {
      ...blueprintWith8SlotsAnd2Go,
      slots: [
        slotA,
        { ...slotA, category: 'backend_fundamentals' as const },
        ...blueprintWith8SlotsAnd2Go.slots.slice(2),
      ],
    };

    expect(() => validateBlueprint(blueprintWithOnly1GoSlot, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(/go_fundamentals/);
  });

  it('rejects slots whose dimension is not configured', () => {
    const blueprintWithUnknownDimension = {
      ...blueprintWith8SlotsAnd2Go,
      slots: [{ ...slotA, dimension: 'unconfigured' }, ...blueprintWith8SlotsAnd2Go.slots.slice(1)],
    };

    expect(() => validateBlueprint(blueprintWithUnknownDimension, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(/dimension/);
  });

  it('rejects any slot-count mismatch', () => {
    expect(() => validateBlueprint({
      ...blueprintWith8SlotsAnd2Go,
      slots: blueprintWith8SlotsAnd2Go.slots.slice(0, 7),
    }, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(/8/);
  });

  it.each([
    ['topic', { ...slotA, topic: '   ' }],
    ['evidence', { ...slotA, evidence: '' }],
  ])('rejects an empty slot %s', (field, invalidSlot) => {
    expect(() => validateBlueprint({
      ...blueprintWith8SlotsAnd2Go,
      slots: [invalidSlot, ...blueprintWith8SlotsAnd2Go.slots.slice(1)],
    }, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(new RegExp(field));
  });

  it('rejects Go fundamentals slots for non-Go roles', () => {
    expect(() => validateBlueprint(blueprintWith8SlotsAnd2Go, {
      questionCount: 8,
      dimensions,
      isGoRole: false,
    })).toThrow(/go_fundamentals/);
  });
});

describe('groupBlueprintSlots', () => {
  it('groups slots by dimension in stable first-seen order', () => {
    expect(groupBlueprintSlots([slotA, slotB, slotC])).toEqual([
      { dimension: 'professional', slots: [slotA, slotC] },
      { dimension: 'communication', slots: [slotB] },
    ]);
  });
});

describe('bindQuestionsToSlots', () => {
  it('binds canonical slot metadata to each positional raw question', () => {
    expect(bindQuestionsToSlots([rawQuestion], [slotA])[0]).toMatchObject({
      category: slotA.category,
      source: slotA.source,
      dimension: slotA.dimension,
      evidence: slotA.evidence,
      difficulty: slotA.difficulty,
    });
  });

  it('stops at the shorter positional input', () => {
    expect(bindQuestionsToSlots([rawQuestion, rawQuestion], [slotA])).toHaveLength(1);
    expect(bindQuestionsToSlots([rawQuestion], [slotA, slotB])).toHaveLength(1);
  });
});

describe('meetsGenerationThreshold', () => {
  it('accepts generation at the rounded-up seventy percent threshold', () => {
    expect(meetsGenerationThreshold(7, 10)).toBe(true);
  });

  it('rejects generation below the rounded-up seventy percent threshold', () => {
    expect(meetsGenerationThreshold(6, 10)).toBe(false);
  });
});
