import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  resolveUser: vi.fn(),
  getUserIdFromRequest: vi.fn(() => 'fingerprint-a'),
  getModel: vi.fn(() => ({ modelId: 'test-model' })),
  extractAIConfig: vi.fn(() => ({})),
  getJsonProviderOptions: vi.fn(() => ({})),
  repository: {
    create: vi.fn(),
    createSection: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('ai', () => ({ generateText: mocks.generateText }));
vi.mock('@/lib/auth/helpers', () => ({
  resolveUser: mocks.resolveUser,
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));
vi.mock('@/lib/ai/provider', () => ({
  getModel: mocks.getModel,
  extractAIConfig: mocks.extractAIConfig,
  getJsonProviderOptions: mocks.getJsonProviderOptions,
  AIConfigError: class AIConfigError extends Error {},
}));
vi.mock('@/lib/db/repositories/resume.repository', () => ({ resumeRepository: mocks.repository }));

import { POST } from './route';

const generated = {
  personal_info: { fullName: 'Ada', jobTitle: 'Engineer', email: 'ada@example.com', phone: '1', location: 'NY' },
  summary: { text: 'Summary' },
  work_experience: { items: [] },
  education: { items: [] },
  skills: { categories: [] },
  projects: { items: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUser.mockResolvedValue({ id: 'user-a' });
  mocks.generateText.mockResolvedValue({ text: JSON.stringify(generated) });
  mocks.repository.create.mockImplementation(async (input) => ({
    id: 'resume-ai',
    userId: 'user-a',
    title: input.title,
    sections: input.sections,
  }));
});

describe('AI generate Resume binding', () => {
  test('persists binding and all generated sections in one create transaction', async () => {
    const response = await POST(new Request('http://localhost/api/ai/generate-resume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobTitle: 'Engineer',
        binding: { kind: 'public', templateSlug: 'classic', version: '1.0.0' },
      }),
    }) as never);

    expect(response.status).toBe(200);
    expect(mocks.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      binding: { kind: 'public', templateSlug: 'classic', version: '1.0.0' },
      sections: expect.arrayContaining([
        expect.objectContaining({ type: 'personal_info', content: expect.objectContaining({ fullName: 'Ada' }) }),
        expect.objectContaining({ type: 'projects', content: { items: [] } }),
      ]),
    }));
    expect(mocks.repository.create.mock.calls[0]![0].sections).toHaveLength(6);
    expect(mocks.repository.createSection).not.toHaveBeenCalled();
    expect(mocks.repository.findById).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ resumeId: 'resume-ai', sections: expect.any(Array) });
  });
});
