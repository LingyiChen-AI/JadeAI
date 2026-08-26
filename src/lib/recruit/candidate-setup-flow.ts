export type CandidateSetupStep = 'create' | 'resume' | 'questions';

export interface CandidateSetupProgress {
  candidateId: string | null;
  resumeSaved: boolean;
}

interface CandidateSetupActions {
  createCandidate: () => Promise<string>;
  saveResume: (candidateId: string) => Promise<void>;
  generateQuestions: (candidateId: string) => Promise<void>;
  onStep?: (step: CandidateSetupStep) => void;
}

export class CandidateSetupError extends Error {
  constructor(
    public readonly step: CandidateSetupStep,
    public readonly progress: CandidateSetupProgress,
  ) {
    super(`Candidate setup failed at ${step}`);
    this.name = 'CandidateSetupError';
  }
}

export async function runCandidateSetup(
  initial: CandidateSetupProgress,
  actions: CandidateSetupActions,
): Promise<CandidateSetupProgress> {
  let progress = { ...initial };

  if (!progress.candidateId) {
    actions.onStep?.('create');
    try {
      progress = { ...progress, candidateId: await actions.createCandidate() };
    } catch {
      throw new CandidateSetupError('create', progress);
    }
  }
  const candidateId = progress.candidateId;
  if (!candidateId) throw new CandidateSetupError('create', progress);

  if (!progress.resumeSaved) {
    actions.onStep?.('resume');
    try {
      await actions.saveResume(candidateId);
      progress = { ...progress, resumeSaved: true };
    } catch {
      throw new CandidateSetupError('resume', progress);
    }
  }

  actions.onStep?.('questions');
  try {
    await actions.generateQuestions(candidateId);
  } catch {
    throw new CandidateSetupError('questions', progress);
  }

  return progress;
}
