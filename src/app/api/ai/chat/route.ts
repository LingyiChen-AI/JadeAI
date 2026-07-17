import { NextRequest } from 'next/server';
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { getModel, extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { chatRepository } from '@/lib/db/repositories/chat.repository';
import { getSystemPrompt } from '@/lib/ai/prompts';
import { createExecutableTools } from '@/lib/ai/tools';
import { serializeResumeForModel } from '@/lib/ai/model-context';
import { buildBeautifyContext, parseBeautifyFlag } from '@/lib/ai/beautify';

const MAX_ROUNDS = 10;
const MAX_MESSAGES = MAX_ROUNDS * 2; // 10 rounds = 20 messages (user + assistant)

interface ChatRequestMessage {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
  content?: string;
}

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;
    let beautify: boolean;
    try {
      beautify = parseBeautifyFlag(body);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_beautify_flag' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const { messages, resumeId, model: modelId, sessionId } = body as {
      messages: ChatRequestMessage[];
      resumeId?: string;
      model?: string;
      sessionId?: string;
    };

    let resumeContext = '';
    let beautifyContext = '';
    if (resumeId) {
      const resume = await resumeRepository.findById(resumeId);
      if (!resume || resume.userId !== user.id) {
        return new Response('Not found', { status: 404 });
      }
      resumeContext = serializeResumeForModel(resume.sections);
      beautifyContext = buildBeautifyContext(resume, beautify);
    }

    if (sessionId) {
      const session = await chatRepository.findSession(sessionId);
      if (!session || (resumeId && session.resumeId !== resumeId)) {
        return new Response('Not found', { status: 404 });
      }

      if (!resumeId) {
        const sessionResume = await resumeRepository.findById(session.resumeId);
        if (!sessionResume || sessionResume.userId !== user.id) {
          return new Response('Not found', { status: 404 });
        }
      }
    }

    // Save user message to DB before streaming
    if (sessionId && messages.length > 0) {
      const lastMessage = messages[messages.length - 1] as {
        role?: unknown;
        parts?: unknown;
        content?: unknown;
      };
      if (lastMessage.role === 'user') {
        const textPart = Array.isArray(lastMessage.parts)
          ? lastMessage.parts.find((part): part is { type: 'text'; text: string } => (
            !!part && typeof part === 'object'
            && (part as { type?: unknown }).type === 'text'
            && typeof (part as { text?: unknown }).text === 'string'
          ))
          : undefined;
        const content = textPart?.text
          || (typeof lastMessage.content === 'string' ? lastMessage.content : '');
        if (content) {
          // First user message in this session → set as session title
          const userMessages = messages.filter((m: { role: string }) => m.role === 'user');
          if (userMessages.length === 1) {
            const title = content.slice(0, 50);
            await chatRepository.updateSessionTitle(sessionId, title);
          }

          await chatRepository.addMessage({
            sessionId,
            role: 'user',
            content,
          });
        }
      }
    }

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig, modelId);
    const modelMessages = await convertToModelMessages(messages as unknown as UIMessage[]);

    // Truncate to last N rounds for LLM context
    const truncatedMessages = modelMessages.slice(-MAX_MESSAGES);

    const tools = resumeId
      ? createExecutableTools(resumeId, aiConfig, { beautify, userId: user.id })
      : undefined;

    const result = streamText({
      model,
      system: `${getSystemPrompt(resumeContext)}${beautifyContext ? `\n\n${beautifyContext}` : ''}`,
      messages: truncatedMessages,
      tools,
      stopWhen: tools ? stepCountIs(25) : undefined,
      onFinish: async ({ text, steps }) => {
        if (!sessionId) return;

        // Build ordered parts array preserving the interleaving of text and tool calls
        const orderedParts: ({ type: 'text'; text: string } | { type: 'tool'; toolName: string; args: unknown; result: unknown })[] = [];

        for (const step of steps) {
          if (step.text) {
            orderedParts.push({ type: 'text', text: step.text });
          }
          const tcs = step.toolCalls ?? [];
          const trs = step.toolResults ?? [];
          for (let i = 0; i < tcs.length; i++) {
            const toolCall = tcs[i] as { toolName: string; input: unknown };
            const toolResult = trs[i] as { output?: unknown } | undefined;
            orderedParts.push({
              type: 'tool',
              toolName: toolCall.toolName,
              args: toolCall.input,
              result: toolResult?.output,
            });
          }
        }

        const fullText = text || '';
        if (fullText || orderedParts.some((p) => p.type === 'tool')) {
          await chatRepository.addMessage({
            sessionId,
            role: 'assistant',
            content: fullText,
            metadata: orderedParts.length > 0 ? { orderedParts } : {},
          });
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (error instanceof AIConfigError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 401 });
    }
    console.error('POST /api/ai/chat error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
