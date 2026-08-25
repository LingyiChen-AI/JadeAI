import { describe, expect, it } from 'vitest';
import type { DimensionConfig, InterviewBlueprint, QuestionSlot } from '@/types/recruit';
import type { QuestionsOutput } from './recruit-schema';
import {
  assembleGeneratedQuestions,
  canonicalizeBlueprintEvidence,
  bindQuestionsToSlots,
  detectGoRole,
  groupBlueprintSlots,
  validateBlueprint,
} from './recruit-blueprint';

describe('canonicalizeBlueprintEvidence', () => {
  it('把模型改写的证据绑定回对应来源列表中的原文', () => {
    const result = canonicalizeBlueprintEvidence({
      resumeFacts: ['负责高并发服务开发', '参与前端页面维护'],
      jdRequirements: ['熟悉 Redis 和 Kafka'],
      gaps: [],
      slots: [{
        category: 'project_deep_dive',
        source: 'resume',
        dimension: 'project_deep_dive',
        topic: '高并发服务',
        evidence: '候选人负责过高并发后端服务的开发',
        difficulty: 'medium',
      }],
    });

    expect(result.slots[0].evidence).toBe('负责高并发服务开发');
  });
});

const dimensions: DimensionConfig[] = [
  { key: 'professional', label: 'Professional skill', weight: 6, custom: false },
  { key: 'communication', label: 'Communication', weight: 2, custom: false },
];

const slotA: QuestionSlot = {
  category: 'go_fundamentals',
  source: 'jd',
  dimension: 'professional',
  topic: 'Goroutine scheduling',
  evidence: 'Strong Go experience',
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
  evidence: 'No database tuning examples',
  difficulty: 'medium',
};

const blueprintWith8SlotsAnd2Go: InterviewBlueprint = {
  resumeFacts: ['Built backend services', 'The resume describes cross-team projects'],
  jdRequirements: ['Strong Go experience', 'Database and middleware experience'],
  gaps: ['No database tuning examples'],
  slots: [
    slotA,
    { ...slotA, topic: 'Channel ownership' },
    {
      ...slotA,
      category: 'middleware_database',
      topic: 'Transaction isolation',
      evidence: 'Database and middleware experience',
    },
    {
      ...slotA,
      category: 'project_deep_dive',
      source: 'resume',
      topic: 'Backend service ownership',
      evidence: 'Built backend services',
    },
    { ...slotC, category: 'system_scenario', topic: 'Caching failure' },
    { ...slotA, category: 'backend_fundamentals', topic: 'HTTP timeouts' },
    slotB,
    { ...slotB, category: 'hr_motivation', topic: 'Role motivation' },
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
  it('enforces JD and gap source coverage when enabled', () => {
    expect(() => validateBlueprint(blueprintWith8SlotsAnd2Go, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
      enforceJdCoverage: true,
    })).toThrow(/gap-sourced/);
  });
  it('accepts source evidence that differs only in punctuation and whitespace', () => {
    const input = structuredClone(blueprintWith8SlotsAnd2Go);
    input.jdRequirements[0] = 'Strong Go experience。';
    input.slots[0].evidence = '“Strong  Go experience”';

    expect(() => validateBlueprint(input, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).not.toThrow();
  });
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

  it.each([
    [5, 4, 1],
    [6, 5, 1],
    [7, 5, 2],
  ])('accepts a %i-slot Go blueprint without the large-interview portfolio', (
    questionCount,
    professionalCount,
    communicationCount,
  ) => {
    const blueprintWithSmallPortfolio = {
      ...blueprintWith8SlotsAnd2Go,
      slots: [
        ...blueprintWith8SlotsAnd2Go.slots.slice(0, professionalCount),
        ...blueprintWith8SlotsAnd2Go.slots.slice(6, 6 + communicationCount),
      ],
    };

    const result = validateBlueprint(blueprintWithSmallPortfolio, {
      questionCount,
      dimensions: [
        { ...dimensions[0], weight: professionalCount },
        { ...dimensions[1], weight: communicationCount },
      ],
      isGoRole: true,
    });

    expect(result.slots).toHaveLength(questionCount);
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

  it('rejects slot counts that do not match the configured weight allocation', () => {
    const wronglyAllocated = {
      ...blueprintWith8SlotsAnd2Go,
      slots: blueprintWith8SlotsAnd2Go.slots.map((slot, index) => (
        index === 5 ? { ...slot, dimension: 'communication' } : slot
      )),
    };

    expect(() => validateBlueprint(wronglyAllocated, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(/professional.*6.*5/);
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

  it.each([
    'middleware_database',
    'project_deep_dive',
    'system_scenario',
    'communication_pressure',
    'hr_motivation',
  ] as const)('requires %s coverage for Go interviews with at least eight slots', (category) => {
    const withoutCategory = {
      ...blueprintWith8SlotsAnd2Go,
      slots: blueprintWith8SlotsAnd2Go.slots.map((slot) => (
        slot.category === category ? { ...slot, category: 'backend_fundamentals' as const } : slot
      )),
    };

    expect(() => validateBlueprint(withoutCategory, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(new RegExp(category));
  });

  it('accepts normalized exact evidence from the declared source list', () => {
    const normalizedEvidence = {
      ...blueprintWith8SlotsAnd2Go,
      slots: blueprintWith8SlotsAnd2Go.slots.map((slot, index) => (
        index === 3 ? { ...slot, evidence: '  BUILT   backend services  ' } : slot
      )),
    };

    expect(validateBlueprint(normalizedEvidence, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    }).slots[3].evidence).toBe('  BUILT   backend services  ');
  });

  it.each([
    ['resume', 'Built high-scale backend services'],
    ['jd', 'Strong Go and Kubernetes experience'],
    ['gap', 'No production database tuning examples'],
  ] as const)('rejects %s evidence that is not a normalized exact list member', (source, evidence) => {
    const slotIndex = source === 'resume' ? 3 : source === 'jd' ? 0 : 4;
    const mismatchedEvidence = {
      ...blueprintWith8SlotsAnd2Go,
      slots: blueprintWith8SlotsAnd2Go.slots.map((slot, index) => (
        index === slotIndex ? { ...slot, evidence } : slot
      )),
    };

    expect(() => validateBlueprint(mismatchedEvidence, {
      questionCount: 8,
      dimensions,
      isGoRole: true,
    })).toThrow(new RegExp(`${source}.*evidence`));
  });
});

describe('groupBlueprintSlots', () => {
  it('groups slots by dimension in stable first-seen order', () => {
    expect(groupBlueprintSlots([slotA, slotB, slotC])).toEqual([
      {
        dimension: 'professional',
        slots: [{ ...slotA, slotIndex: 0 }, { ...slotC, slotIndex: 2 }],
      },
      { dimension: 'communication', slots: [{ ...slotB, slotIndex: 1 }] },
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

describe('assembleGeneratedQuestions', () => {
  if (false) {
    assembleGeneratedQuestions([{
      // @ts-expect-error Assembly only accepts slots carrying their internal blueprint index.
      slots: [slotA],
      questions: [rawQuestion],
    }], 1);
  }

  it('restores global blueprint order after positional binding within dimension groups', () => {
    const groups = groupBlueprintSlots([slotA, slotB, slotC]);
    const generated = groups.map((group) => ({
      slots: group.slots,
      questions: group.dimension === 'professional'
        ? [
            { ...rawQuestion, question: 'question A' },
            { ...rawQuestion, question: 'question C' },
          ]
        : [{ ...rawQuestion, question: 'question B' }],
    }));

    expect(assembleGeneratedQuestions(generated, 3).map((question) => question.question)).toEqual([
      'question A',
      'question B',
      'question C',
    ]);
  });

  it.each([6, 7])('rejects %i generated questions when ten were planned', (generatedCount) => {
    const slots = Array.from({ length: 10 }, (_, index) => ({
      ...slotA,
      topic: `topic ${index}`,
    }));
    const [group] = groupBlueprintSlots(slots);

    expect(() => assembleGeneratedQuestions([{
      slots: group.slots,
      questions: Array.from({ length: generatedCount }, (_, index) => ({
        ...rawQuestion,
        question: `question ${index}`,
      })),
    }], 10)).toThrow(new RegExp(`exactly 10.*${generatedCount}`));
  });

  it('rejects more questions than were planned instead of truncating them', () => {
    const slots = Array.from({ length: 10 }, (_, index) => ({
      ...slotA,
      topic: `topic ${index}`,
    }));
    const [group] = groupBlueprintSlots(slots);

    expect(() => assembleGeneratedQuestions([{
      slots: group.slots,
      questions: Array.from({ length: 11 }, (_, index) => ({
        ...rawQuestion,
        question: `question ${index}`,
      })),
    }], 10)).toThrow(/exactly 10.*11/);
  });
});

describe('detectGoRole', () => {
  it.each([
    ['Golang engineer', '', true],
    ['Backend engineer', 'Build Go backend services', true],
    ['Backend Go', 'Build APIs', true],
    ['后端工程师', '负责 Go 开发与服务治理', true],
    ['Backend engineer', 'Proficiency in Go and MySQL', true],
    ['后端工程师', '精通 Go，熟悉 MySQL', true],
    ['Backend engineer', 'At least 3 years of Go experience', true],
    ['Backend engineer', 'Skills: Go, MySQL', true],
    ['Java engineer', 'Build Spring services', false],
    ['Cloud engineer', 'Operate Google Cloud infrastructure', false],
    ['Go-to-market Manager', 'Own revenue strategy', false],
    ['Release Manager', 'Coordinate the production go-live', false],
    ['Product Manager', 'Proficiency in go-to-market strategy', false],
    ['Java engineer', 'Experience with Java and willingness to go onsite', false],
  ])('detects Go from role text without substring false positives', (title, description, expected) => {
    expect(detectGoRole(title, description)).toBe(expected);
  });
});
