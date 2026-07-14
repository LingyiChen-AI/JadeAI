'use client';

import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { MessageSquare, Minus, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AIChatContent } from './ai-chat-panel';

const WIN_W_DESKTOP = 440;
const WIN_H_DESKTOP = 620;
const BUBBLE_SIZE = 56; // h-14 = 56px
const GAP = 12;
const MARGIN = 8;
const MOBILE_BREAKPOINT = 640;

function getWinSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: WIN_W_DESKTOP, h: WIN_H_DESKTOP };
  if (window.innerWidth < MOBILE_BREAKPOINT) {
    return {
      w: Math.min(window.innerWidth - MARGIN * 2, 360),
      h: Math.min(window.innerHeight - 120, 480),
    };
  }
  return { w: WIN_W_DESKTOP, h: WIN_H_DESKTOP };
}

interface AIChatBubbleProps {
  resumeId: string;
}

/** Compute the best left/top for the chat window given the bubble position. */
function calcWindowPos(bubbleRight: number, bubbleBottom: number, winW: number, winH: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const bubbleLeft = vw - bubbleRight - BUBBLE_SIZE;
  const bubbleTop = vh - bubbleBottom - BUBBLE_SIZE;

  let left = bubbleLeft + BUBBLE_SIZE - winW;
  let top = bubbleTop - GAP - winH;

  if (top < MARGIN) top = bubbleTop + BUBBLE_SIZE + GAP;
  if (top + winH > vh - MARGIN) top = vh - MARGIN - winH;
  if (top < MARGIN) top = MARGIN;
  if (left < MARGIN) left = MARGIN;
  if (left + winW > vw - MARGIN) left = vw - MARGIN - winW;

  return { left, top };
}

export function AIChatBubble({ resumeId }: AIChatBubbleProps) {
  const t = useTranslations('ai');
  const { showAiChat, toggleAiChat } = useEditorStore();
  const hasApiKey = useSettingsStore((s) => !!s.aiApiKey);

  // Bubble position (draggable, right/bottom offsets)
  const [bubblePos, setBubblePos] = useState({ x: 24, y: 24 });
  const bubbleDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const didDragRef = useRef(false);

  // Chat window position (left/top, null = auto-calculate from bubble)
  const [windowPos, setWindowPos] = useState<{ left: number; top: number } | null>(null);
  const windowDragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number; origBubbleX: number; origBubbleY: number } | null>(null);

  // Tooltip
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-calculated window position (recalculated when bubble moves and window hasn't been manually dragged)
  const [winSize, setWinSize] = useState(getWinSize);
  useEffect(() => {
    const onResize = () => setWinSize(getWinSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const autoWindowPos = useMemo(() => {
    if (typeof window === 'undefined') return { left: 100, top: 100 };
    return calcWindowPos(bubblePos.x, bubblePos.y, winSize.w, winSize.h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubblePos.x, bubblePos.y, winSize.w, winSize.h]);

  const winPos = windowPos ?? autoWindowPos;

  // --- Bubble drag ---
  const onBubbleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    didDragRef.current = false;
    bubbleDragRef.current = { startX: e.clientX, startY: e.clientY, origX: bubblePos.x, origY: bubblePos.y };

    const onMouseMove = (ev: MouseEvent) => {
      if (!bubbleDragRef.current) return;
      const dx = ev.clientX - bubbleDragRef.current.startX;
      const dy = ev.clientY - bubbleDragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
      setBubblePos({
        x: Math.max(0, bubbleDragRef.current.origX - dx),
        y: Math.max(0, bubbleDragRef.current.origY - dy),
      });
    };

    const onMouseUp = () => {
      bubbleDragRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Reset manual window position so it recalculates from new bubble pos
      setWindowPos(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [bubblePos]);

  const onBubbleClick = useCallback(() => {
    if (!didDragRef.current) toggleAiChat();
  }, [toggleAiChat]);

  // --- Window drag (title bar, uses left/top) ---
  const onWindowMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const current = winPos;
    windowDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origLeft: current.left, origTop: current.top,
      origBubbleX: bubblePos.x, origBubbleY: bubblePos.y,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!windowDragRef.current) return;
      const dx = ev.clientX - windowDragRef.current.startX;
      const dy = ev.clientY - windowDragRef.current.startY;
      setWindowPos({
        left: windowDragRef.current.origLeft + dx,
        top: windowDragRef.current.origTop + dy,
      });
      // Move bubble in sync (right/bottom offsets move inversely to left/top)
      setBubblePos({
        x: Math.max(0, windowDragRef.current.origBubbleX - dx),
        y: Math.max(0, windowDragRef.current.origBubbleY - dy),
      });
    };

    const onMouseUp = () => {
      windowDragRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [winPos, bubblePos]);

  return (
    <>
      {/* Floating chat window — always mounted to preserve state, toggled via CSS */}
      <div
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl transition-opacity duration-200"
        style={{
          width: winSize.w,
          height: winSize.h,
          left: winPos.left,
          top: winPos.top,
          opacity: showAiChat ? 1 : 0,
          pointerEvents: showAiChat ? 'auto' : 'none',
        }}
      >
        {/* Draggable title bar */}
        <div
          className="flex cursor-move items-center justify-between bg-gradient-to-r from-brand to-brand-hover px-4 py-2.5"
          onMouseDown={onWindowMouseDown}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-white" />
            <span className="text-sm font-semibold text-white">{t('panelTitle')}</span>
          </div>
          <button
            className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
            onClick={toggleAiChat}
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {/* Chat content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <AIChatContent resumeId={resumeId} hideTitle />
        </div>
      </div>

      {/* Bubble button — globally draggable */}
      <div
        className="fixed z-50"
        style={{ right: bubblePos.x, bottom: bubblePos.y }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Tooltip */}
        {showTooltip && !showAiChat && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-white shadow-lg">
            {hasApiKey ? t('bubbleTooltip') : t('apiKeyMissingBubble')}
            <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-zinc-800" />
          </div>
        )}
        <button
          data-tour="ai-chat"
          aria-label={hasApiKey ? t('bubbleTooltip') : t('apiKeyMissingBubble')}
          title={hasApiKey ? t('bubbleTooltip') : t('apiKeyMissingBubble')}
          className="relative flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-hover text-white shadow-lg transition-transform hover:scale-110 active:cursor-grabbing active:scale-95"
          onMouseDown={onBubbleMouseDown}
          onClick={onBubbleClick}
        >
          <MessageSquare className="h-6 w-6" />
          {!hasApiKey && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 shadow-sm">
              <AlertTriangle className="h-3 w-3 text-amber-900" />
            </span>
          )}
        </button>
      </div>
    </>
  );
}
