import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createExecutableTools: vi.fn(),
  findById: vi.fn(),
  findSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  addMessage: vi.fn(),
  getModel: vi.fn(() => 'model'),
}));

vi.mock('ai', () => ({
  streamText: mocks.streamText,
  convertToModelMessages: vi.fn(async (messages) => messages),
  stepCountIs: vi.fn(() => 'stop-condition'),
}));
vi.mock('@/lib/ai/provider', () => ({
  getModel: mocks.getModel,
  extractAIConfig: vi.fn(() => ({})),
  AIConfigError: class AIConfigError extends Error {},
}));
vi.mock('@/lib/auth/helpers', () => ({
  resolveUser: vi.fn(async () => ({ id: 'user-1' })),
  getUserIdFromRequest: vi.fn(() => 'fingerprint'),
}));
vi.mock('@/lib/db/repositories/resume.repository', () => ({
  resumeRepository: { findById: mocks.findById },
}));
vi.mock('@/lib/db/repositories/chat.repository', () => ({
  chatRepository: {
    findSession: mocks.findSession,
    updateSessionTitle: mocks.updateSessionTitle,
    addMessage: mocks.addMessage,
  },
}));

vi.mock('@/lib/ai/tools', () => ({ createExecutableTools: mocks.createExecutableTools }));

import { POST } from './route';

function request(beautify?: unknown) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [], resumeId: 'resume-1', ...(beautify === undefined ? {} : { beautify }) }),
  });
}

function sessionRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('AI chat beautify boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockReset();
    mocks.findSession.mockReset();
    mocks.findById.mockResolvedValue({
      id: 'resume-1', userId: 'user-1', template: 'modern', templateSource: 'legacy', templateVersionId: null,
      themeConfig: { primaryColor: '#111111' }, sections: [],
    });
    mocks.findSession.mockResolvedValue(null);
    mocks.createExecutableTools.mockReturnValue({ updateSection: {} });
    mocks.streamText.mockReturnValue({ toUIMessageStreamResponse: () => new Response('stream') });
  });

  it('defaults to no style context and no beautify tools', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createExecutableTools).toHaveBeenCalledWith('resume-1', {}, { beautify: false, userId: 'user-1' });
    expect(mocks.streamText.mock.calls[0][0].system).not.toContain('Current Resume Style');
  });

  it('keeps style context and beautify tools disabled for explicit false', async () => {
    const response = await POST(request(false));

    expect(response.status).toBe(200);
    expect(mocks.createExecutableTools).toHaveBeenCalledWith('resume-1', {}, { beautify: false, userId: 'user-1' });
    expect(mocks.streamText.mock.calls[0][0].system).not.toContain('Current Resume Style');
  });

  it('adds style context and authorizes tools only for literal true', async () => {
    await POST(request(true));

    expect(mocks.createExecutableTools).toHaveBeenCalledWith('resume-1', {}, { beautify: true, userId: 'user-1' });
    expect(mocks.streamText.mock.calls[0][0].system).toContain('Current Resume Style');
    expect(mocks.streamText.mock.calls[0][0].system).toContain('#111111');
  });

  it('rejects string-like truthy values before model execution', async () => {
    const response = await POST(request('true'));

    expect(response.status).toBe(400);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('does not expose or mutate a resume owned by another user', async () => {
    mocks.findById.mockResolvedValueOnce({
      id: 'resume-1', userId: 'user-2', template: 'modern', templateSource: 'legacy',
      themeConfig: { primaryColor: '#111111' }, sections: [{ content: { text: 'private' } }],
    });

    const response = await POST(request(true));

    expect(response.status).toBe(404);
    expect(mocks.createExecutableTools).not.toHaveBeenCalled();
    expect(mocks.getModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('returns the same 404 without model or tool execution when the resume does not exist', async () => {
    mocks.findById.mockResolvedValueOnce(null);

    const response = await POST(request(true));

    expect(response.status).toBe(404);
    expect(mocks.createExecutableTools).not.toHaveBeenCalled();
    expect(mocks.getModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects a session whose resume belongs to another user even without a resumeId', async () => {
    mocks.findSession.mockResolvedValueOnce({ id: 'session-2', resumeId: 'resume-2' });
    mocks.findById.mockResolvedValueOnce({
      id: 'resume-2', userId: 'user-2', sections: [{ content: { text: 'private' } }],
    });

    const response = await POST(sessionRequest({
      sessionId: 'session-2',
      messages: [{ role: 'user', content: 'rewrite this' }],
    }));

    expect(response.status).toBe(404);
    expect(mocks.updateSessionTitle).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.getModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects a session that is not attached to the requested resume', async () => {
    mocks.findSession.mockResolvedValueOnce({ id: 'session-2', resumeId: 'resume-2' });

    const response = await POST(sessionRequest({
      sessionId: 'session-2',
      resumeId: 'resume-1',
      messages: [{ role: 'user', content: 'rewrite this' }],
    }));

    expect(response.status).toBe(404);
    expect(mocks.updateSessionTitle).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.getModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('allows an owned session attached to the requested resume', async () => {
    mocks.findSession.mockResolvedValueOnce({ id: 'session-1', resumeId: 'resume-1' });

    const response = await POST(sessionRequest({
      sessionId: 'session-1',
      resumeId: 'resume-1',
      messages: [{ role: 'user', content: 'rewrite this' }],
    }));

    expect(response.status).toBe(200);
    expect(mocks.updateSessionTitle).toHaveBeenCalledWith('session-1', 'rewrite this');
    expect(mocks.addMessage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      role: 'user',
      content: 'rewrite this',
    });
    expect(mocks.streamText).toHaveBeenCalledOnce();
  });
});
