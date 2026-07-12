'use client';

import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/settings-store';
import { API_KEY_URL } from './config';

interface ApiKeyToastMessages {
  title: string;
  description: string;
  actionLabel: string;
}

export function hasAIApiKey() {
  return Boolean(useSettingsStore.getState().aiApiKey.trim());
}

export function ensureAIApiKey(messages: ApiKeyToastMessages) {
  if (hasAIApiKey()) return true;

  toast.error(messages.title, {
    description: messages.description,
    action: {
      label: messages.actionLabel,
      onClick: () => window.open(API_KEY_URL, '_blank', 'noopener,noreferrer'),
    },
  });

  return false;
}
