'use client';

import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { getAIHeaders } from '@/stores/settings-store';
import { ensureAIApiKey } from '@/lib/ai/client-config';
import { recordAIWriteback, snapshotResumeSections } from '@/lib/resume/diff-ai-changes';

const MUTATING_TOOL_TYPES = new Set([
  'tool-updateSection',
  'tool-rewriteText',
  'tool-suggestSkills',
  'tool-addSection',
  'tool-translateResume',
]);

function isCompletedToolPart(part: unknown): part is { type: string; state: 'output-available' } {
  if (!part || typeof part !== 'object') return false;
  const candidate = part as { type?: unknown; state?: unknown };
  return typeof candidate.type === 'string' && candidate.state === 'output-available';
}

interface UseAIChatOptions {
  resumeId: string;
  sessionId?: string;
  initialMessages?: UIMessage[];
  selectedModel?: string;
}

export function useAIChat({ resumeId, sessionId, initialMessages, selectedModel }: UseAIChatOptions) {
  const t = useTranslations('ai');
  const [input, setInput] = useState('');

  const modelRef = useRef(selectedModel);
  modelRef.current = selectedModel;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        body: () => ({ resumeId, model: modelRef.current, sessionId: sessionIdRef.current }),
        // headers must be a function — useChat never updates the transport ref,
        // so a static object would freeze stale values from before store hydration.
        headers: () => {
          const fp = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
          return { ...(fp ? { 'x-fingerprint': fp } : {}), ...getAIHeaders() };
        },
      }),
    [resumeId]
  );

  const { messages, sendMessage: sendRawMessage, status, error, setMessages } = useChat({
    id: sessionId,
    transport,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Track completed tool call count to detect new tool results
  const completedToolCount = useCallback((items: UIMessage[]) => items.reduce((count, message) => {
    if (message.role !== 'assistant' || !message.parts) return count;
    return count + message.parts.filter((part) => (
      isCompletedToolPart(part) && part.type.startsWith('tool-')
    )).length;
  }, 0), []);

  const completedToolCountRef = useRef(completedToolCount(initialMessages ?? []));

  const reloadResume = useCallback(async (trackChanges: boolean) => {
    if (!resumeId) return;
    try {
      const store = useResumeStore.getState();
      const before = trackChanges ? snapshotResumeSections(store.sections) : null;
      // Cancel any pending autosave to prevent overwriting server data
      if (store._saveTimeout) clearTimeout(store._saveTimeout);

      const fp = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch(`/api/resume/${resumeId}`, {
        headers: fp ? { 'x-fingerprint': fp } : {},
      });
      if (res.ok) {
        const resume = await res.json();
        useResumeStore.getState().setResume(resume);
        if (before) {
          await recordAIWriteback({
            resumeId,
            userId: resume.userId,
            before,
            after: resume.sections || [],
            source: 'chat-tool',
            serverRevision: resume.revision,
          }, {
            appendHistory: async (entry) => {
              await useEditorStore.getState().appendAIHistory(entry);
              const historyError = useEditorStore.getState().aiHistoryError;
              if (historyError) throw new Error(historyError);
            },
            mergeChanges: useEditorStore.getState().mergeAiChanges,
            onPersistenceError: (error) => console.warn('AI history persistence degraded:', error),
          });
        }
      }
    } catch (err) {
      console.error('Failed to reload resume after tool call:', err);
    }
  }, [resumeId]);

  // Reload resume data when new tool results appear during streaming
  useEffect(() => {
    const completedToolCountValue = completedToolCount(messages);

    if (completedToolCountValue > completedToolCountRef.current) {
      completedToolCountRef.current = completedToolCountValue;
      const hasMutatingTool = messages.some((message) =>
        message.role === 'assistant'
        && message.parts?.some((part) =>
          isCompletedToolPart(part) && MUTATING_TOOL_TYPES.has(part.type)
        )
      );
      reloadResume(hasMutatingTool);
    }
  }, [completedToolCount, messages, reloadResume]);

  // Load initial messages when session changes; sync tool count ref to avoid false reload
  useEffect(() => {
    if (initialMessages) {
      // Pre-calculate tool count from initial messages to avoid triggering a redundant reload
      completedToolCountRef.current = completedToolCount(initialMessages);
      setMessages(initialMessages);
    }
  }, [completedToolCount, initialMessages, setMessages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const sendMessage = useCallback(async ({ text }: { text: string }) => {
    const store = useResumeStore.getState();
    const saved = await store.save();
    if (!saved || !store.beginAiEditing(resumeId)) return false;

    try {
      await sendRawMessage({ text });
      return true;
    } finally {
      useResumeStore.getState().endAiEditing(resumeId);
    }
  }, [resumeId, sendRawMessage]);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!ensureAIApiKey({
      title: t('apiKeyMissing'),
      description: t('apiKeyMissingHint'),
      actionLabel: t('getApiKey'),
    })) return;

    const pending = input;
    setInput('');
    const sent = await sendMessage({ text: pending });
    if (!sent) setInput(pending);
  }, [input, sendMessage, t]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    error,
    clearMessages,
    sendMessage,
  };
}
