'use client';

import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useResumeStore } from '@/stores/resume-store';
import { getAIHeaders } from '@/stores/settings-store';
import { ensureAIApiKey } from '@/lib/ai/client-config';

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

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: sessionId,
    transport,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Track completed tool call count to detect new tool results
  const completedToolCountRef = useRef(0);

  const reloadResume = useCallback(async () => {
    if (!resumeId) return;
    try {
      const store = useResumeStore.getState();
      // Cancel any pending autosave to prevent overwriting server data
      if (store._saveTimeout) clearTimeout(store._saveTimeout);

      const fp = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch(`/api/resume/${resumeId}`, {
        headers: fp ? { 'x-fingerprint': fp } : {},
      });
      if (res.ok) {
        const resume = await res.json();
        useResumeStore.getState().setResume(resume);
      }
    } catch (err) {
      console.error('Failed to reload resume after tool call:', err);
    }
  }, [resumeId]);

  // Reload resume data when new tool results appear during streaming
  useEffect(() => {
    const completedToolCount = messages.reduce((count, m) => {
      if (m.role !== 'assistant' || !m.parts) return count;
      return count + m.parts.filter((p: any) =>
        typeof p.type === 'string' && p.type.startsWith('tool-') && p.state === 'output-available'
      ).length;
    }, 0);

    if (completedToolCount > completedToolCountRef.current) {
      completedToolCountRef.current = completedToolCount;
      reloadResume();
    }
  }, [messages, reloadResume]);

  // Load initial messages when session changes; sync tool count ref to avoid false reload
  useEffect(() => {
    if (initialMessages) {
      // Pre-calculate tool count from initial messages to avoid triggering a redundant reload
      const initialToolCount = initialMessages.reduce((count, m) => {
        if (m.role !== 'assistant' || !m.parts) return count;
        return count + m.parts.filter((p: any) =>
          typeof p.type === 'string' && p.type.startsWith('tool-') && p.state === 'output-available'
        ).length;
      }, 0);
      completedToolCountRef.current = initialToolCount;
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!ensureAIApiKey({
      title: t('apiKeyMissing'),
      description: t('apiKeyMissingHint'),
      actionLabel: t('getApiKey'),
    })) return;

    sendMessage({ text: input });
    setInput('');
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
