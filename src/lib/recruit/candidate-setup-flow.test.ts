import { describe, expect, it } from 'vitest';
import {
  CandidateSetupError,
  runCandidateSetup,
  type CandidateSetupProgress,
} from './candidate-setup-flow';

describe('runCandidateSetup', () => {
  it('出题失败后从失败步骤重试，不重复创建候选人或保存简历', async () => {
    const calls = { create: 0, resume: 0, questions: 0 };
    let progress: CandidateSetupProgress = { candidateId: null, resumeSaved: false };
    const actions = {
      createCandidate: async () => {
        calls.create += 1;
        return 'candidate-1';
      },
      saveResume: async (candidateId: string) => {
        expect(candidateId).toBe('candidate-1');
        calls.resume += 1;
      },
      generateQuestions: async (candidateId: string) => {
        expect(candidateId).toBe('candidate-1');
        calls.questions += 1;
        if (calls.questions === 1) throw new Error('AI unavailable');
      },
    };

    try {
      await runCandidateSetup(progress, actions);
      throw new Error('expected question generation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CandidateSetupError);
      const failure = error as CandidateSetupError;
      expect(failure.step).toBe('questions');
      progress = failure.progress;
    }

    const completed = await runCandidateSetup(progress, actions);

    expect(completed).toEqual({ candidateId: 'candidate-1', resumeSaved: true });
    expect(calls).toEqual({ create: 1, resume: 1, questions: 2 });
  });

  it('简历失败后保留已创建候选人，仅重试简历和后续步骤', async () => {
    const calls = { create: 0, resume: 0, questions: 0 };
    let progress: CandidateSetupProgress = { candidateId: null, resumeSaved: false };
    const actions = {
      createCandidate: async () => {
        calls.create += 1;
        return 'candidate-2';
      },
      saveResume: async () => {
        calls.resume += 1;
        if (calls.resume === 1) throw new Error('parse failed');
      },
      generateQuestions: async () => {
        calls.questions += 1;
      },
    };

    try {
      await runCandidateSetup(progress, actions);
    } catch (error) {
      progress = (error as CandidateSetupError).progress;
    }
    await runCandidateSetup(progress, actions);

    expect(calls).toEqual({ create: 1, resume: 2, questions: 1 });
  });
});
