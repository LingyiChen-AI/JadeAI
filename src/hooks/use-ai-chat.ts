'use client';

import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResumeStore } from '@/stores/resume-store';
import { useSettingsStore, getAIHeaders } from '@/stores/settings-store';
import { generateId } from '@/lib/utils';

interface UseAIChatOptions {
  resumeId: string;
  sessionId?: string;
  initialMessages?: UIMessage[];
  selectedModel?: string;
}

export function useAIChat({ resumeId, sessionId, initialMessages, selectedModel }: UseAIChatOptions) {
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState<UIMessage[]>([]);

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

  const { messages, sendMessage: rawSendMessage, status, error, setMessages } = useChat({
    id: sessionId,
    transport,
  });

  /**
   * 发消息前先把未保存的改动落库。
   *
   * 请求体里只有 resumeId，服务端是回库里读简历正文的（工具改简历也是直接改库）。
   * 手动改完立刻发消息时，防抖保存可能还没触发，AI 拿到的就是上一版——issue #96。
   */
  const sendMessage = useCallback(
    async (message: Parameters<typeof rawSendMessage>[0]) => {
      await useResumeStore.getState().flushSave();
      return rawSendMessage(message);
    },
    [rawSendMessage],
  );

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

    // Check if API key is configured
    if (!useSettingsStore.getState().aiApiKey) {
      const userMsg: UIMessage = {
        id: generateId(),
        role: 'user',
        parts: [{ type: 'text', text: input }],
      };
      const errorMsg: UIMessage = {
        id: generateId(),
        role: 'assistant',
        parts: [{ type: 'text', text: '__API_KEY_MISSING__' }],
      };
      // Keep these messages separate from useChat state so they never get sent to the server
      setLocalMessages((prev) => [...prev, userMsg, errorMsg]);
      setInput('');
      return;
    }

    // Clear local-only messages when user starts a real conversation
    if (localMessages.length > 0) {
      setLocalMessages([]);
    }

    void sendMessage({ text: input });
    setInput('');
  }, [input, sendMessage, localMessages]);

  // Merge real chat messages with local-only display messages
  const allMessages = useMemo(
    () => (localMessages.length > 0 ? [...messages, ...localMessages] : messages),
    [messages, localMessages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLocalMessages([]);
  }, [setMessages]);

  return {
    messages: allMessages,
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
