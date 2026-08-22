'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2, AlertTriangle, RotateCcw, SpellCheck, Wand2,
  Trash2, ArrowUp, ArrowDown, Minus, ChevronLeft,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { getAIHeaders } from '@/stores/settings-store';

interface GrammarIssue {
  sectionId: string;
  sectionTitle: string;
  severity: 'high' | 'medium' | 'low';
  type: 'grammar' | 'weak_verb' | 'vague' | 'quantify' | 'spelling';
  original: string;
  suggestion: string;
}

interface GrammarCheckResult {
  issues: GrammarIssue[];
  summary: string;
  score: number;
}

interface HistoryItem {
  id: string;
  score: number;
  issueCount: number;
  createdAt: string | number;
}

interface GrammarCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

function getScoreColor(score: number): string {
  if (score < 40) return 'text-red-500';
  if (score <= 70) return 'text-yellow-500';
  return 'text-emerald-500';
}

function getScoreStroke(score: number): string {
  if (score < 40) return 'stroke-red-500';
  if (score <= 70) return 'stroke-yellow-500';
  return 'stroke-emerald-500';
}

function getScoreTrack(score: number): string {
  if (score < 40) return 'stroke-red-100';
  if (score <= 70) return 'stroke-yellow-100';
  return 'stroke-emerald-100';
}

function ScoreCircle({ score, label, size = 'lg' }: { score: number; label: string; size?: 'sm' | 'lg' }) {
  const isSm = size === 'sm';
  const radius = isSm ? 16 : 40;
  const viewBox = isSm ? '0 0 40 40' : '0 0 100 100';
  const cx = isSm ? 20 : 50;
  const strokeWidth = isSm ? 3 : 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${isSm ? 'h-10 w-10' : 'h-24 w-24'}`}>
        <svg className={`${isSm ? 'h-10 w-10' : 'h-24 w-24'} -rotate-90`} viewBox={viewBox}>
          <circle
            cx={cx} cy={cx} r={radius}
            fill="none" strokeWidth={strokeWidth}
            className={getScoreTrack(score)}
          />
          <circle
            cx={cx} cy={cx} r={radius}
            fill="none" strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${getScoreStroke(score)} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${getScoreColor(score)} ${isSm ? 'text-xs' : 'text-2xl'}`}>
            {score}
          </span>
        </div>
      </div>
      {!isSm && <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>}
    </div>
  );
}

function ScoreTrend({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff > 0) return <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (diff < 0) return <ArrowDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-zinc-400" />;
}

function formatDate(value: string | number): string {
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SeverityBadge({ severity, t }: { severity: GrammarIssue['severity']; t: any }) {
  const styles = {
    high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
    low: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  };
  const labels = {
    high: t('severityHigh'),
    medium: t('severityMedium'),
    low: t('severityLow'),
  };
  return <Badge className={styles[severity]}>{labels[severity]}</Badge>;
}

function TypeBadge({ type, t }: { type: GrammarIssue['type']; t: any }) {
  const labelMap: Record<GrammarIssue['type'], string> = {
    grammar: t('typeGrammar'),
    weak_verb: t('typeWeakVerb'),
    vague: t('typeVague'),
    quantify: t('typeQuantify'),
    spelling: t('typeSpelling'),
  };
  return (
    <Badge variant="secondary" className="text-xs">
      {labelMap[type]}
    </Badge>
  );
}

/* ── Result view (shared between new check & history detail) ── */
function GrammarCheckResultView({ result, t }: { result: GrammarCheckResult; t: any }) {
  return (
    <div className="px-6 py-4 space-y-6">
      {/* Score */}
      <div className="flex items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50/50 py-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <ScoreCircle score={result.score} label={t('score')} />
      </div>

      {/* Summary */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {t('summary')}
        </h4>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {result.summary}
        </p>
      </div>

      {/* Issues */}
      {result.issues.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {t('issues')} ({result.issues.length})
          </h4>
          <div className="space-y-2.5">
            {result.issues.map((issue, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-zinc-150 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs font-medium">
                    {issue.sectionTitle}
                  </Badge>
                  <SeverityBadge severity={issue.severity} t={t} />
                  <TypeBadge type={issue.type} t={t} />
                </div>
                <div className="space-y-1.5">
                  <div>
                    <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      {t('original')}
                    </span>
                    <p className="text-sm text-zinc-500 line-through dark:text-zinc-500">
                      {issue.original}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-brand">
                      {t('suggestion')}
                    </span>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {issue.suggestion}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('noIssues')}
          </p>
        </div>
      )}
    </div>
  );
}

export function GrammarCheckDialog({ open, onOpenChange, resumeId }: GrammarCheckDialogProps) {
  const t = useTranslations('grammarCheck');
  const ct = useTranslations('common');
  const { setShowAiChat, setPendingAiMessage } = useEditorStore();
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<GrammarCheckResult | null>(null);
  const [error, setError] = useState('');

  // History state
  const [activeTab, setActiveTab] = useState<string>('new');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<GrammarCheckResult | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [deleteToConfirm, setDeleteToConfirm] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
    return {
      'Content-Type': 'application/json',
      ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
      ...getAIHeaders(),
    };
  };

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ai/grammar-check/history?resumeId=${resumeId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    if (open && activeTab === 'history') {
      fetchHistory();
    }
  }, [open, activeTab, fetchHistory]);

  const handleCheck = async () => {
    setIsChecking(true);
    setError('');

    try {
      // 服务端按 resumeId 回库读简历，先把未保存的改动落库，否则检查的是上一版
      await useResumeStore.getState().flushSave();
      const res = await fetch('/api/ai/grammar-check', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ resumeId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Grammar check failed');
      }

      const data: GrammarCheckResult = await res.json();
      setResult(data);
      fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to check grammar');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCheckAgain = () => {
    setResult(null);
    setError('');
    handleCheck();
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setError('');
      setActiveTab('new');
      setHistoryDetail(null);
    }, 200);
  };

  const handleFixAll = () => {
    if (!result || result.issues.length === 0) return;
    const issueList = result.issues
      .map((issue, i) => `${i + 1}. [${issue.sectionTitle}] "${issue.original}" → "${issue.suggestion}"`)
      .join('\n');
    const message = `请根据以下语法检查结果，逐一修复简历中的问题：\n\n${issueList}\n\n请使用工具直接修改对应的简历模块内容。`;
    onOpenChange(false);
    setTimeout(() => {
      setPendingAiMessage(message);
      setShowAiChat(true);
    }, 300);
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await fetch(`/api/ai/grammar-check/history?id=${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (historyDetail) {
        setHistoryDetail(null);
      }
    } catch { /* ignore */ }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <SpellCheck className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0 min-h-0 flex-1">
          <div className="px-6 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="new" className="flex-1 cursor-pointer">
                {t('newCheck')}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 cursor-pointer gap-1.5">
                {t('historyTab')}
                {history.length > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-brand text-white">
                    {history.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── New Check Tab ── */}
          <TabsContent value="new" className="flex flex-col min-h-0">
            {!result ? (
              <div className="px-6 py-4 space-y-4">
                {!isChecking && !error && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <SpellCheck className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {t('description')}
                    </p>
                  </div>
                )}

                {isChecking && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {t('checking')}
                    </p>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                    {t('close')}
                  </Button>
                  <Button
                    onClick={handleCheck}
                    disabled={isChecking}
                    className="cursor-pointer bg-brand hover:bg-brand-hover"
                  >
                    {isChecking ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        {t('checking')}
                      </>
                    ) : (
                      t('check')
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <GrammarCheckResultView result={result} t={t} />
                </div>
                <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
                  <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                    {t('close')}
                  </Button>
                  <Button variant="outline" onClick={handleCheckAgain} className="cursor-pointer gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('checkAgain')}
                  </Button>
                  {result.issues.length > 0 && (
                    <Button onClick={handleFixAll} className="cursor-pointer gap-1.5 bg-brand hover:bg-brand-hover">
                      <Wand2 className="h-3.5 w-3.5" />
                      {t('fixAll')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="flex flex-col min-h-0">
            {historyDetail ? (
              <>
                <div className="px-6 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryDetail(null)}
                    className="cursor-pointer gap-1 text-zinc-500 -ml-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('historyTab')}
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <GrammarCheckResultView result={historyDetail} t={t} />
                </div>
                <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
                  <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                    {t('close')}
                  </Button>
                </div>
              </>
            ) : historyLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-brand mb-2" />
                <p className="text-sm text-zinc-500">{t('loadingHistory')}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <SpellCheck className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('noHistory')}</p>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="px-6 py-4 space-y-2.5">
                    {history.map((item, idx) => {
                      const prevScore = idx < history.length - 1 ? history[idx + 1].score : undefined;
                      return (
                        <div
                          key={item.id}
                          className="group flex items-center gap-3 rounded-lg border border-zinc-100 bg-white p-3 transition-colors hover:border-zinc-200 hover:bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50 cursor-pointer"
                          onClick={async () => {
                            setHistoryDetailLoading(true);
                            try {
                              const res = await fetch(`/api/ai/grammar-check/history?resumeId=${resumeId}&id=${item.id}`, {
                                headers: getAuthHeaders(),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                if (data.result) {
                                  setHistoryDetail(typeof data.result === 'string' ? JSON.parse(data.result) : data.result);
                                }
                              }
                            } catch { /* ignore */ } finally {
                              setHistoryDetailLoading(false);
                            }
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <ScoreCircle score={item.score} label="" size="sm" />
                            <ScoreTrend current={item.score} previous={prevScore} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                {formatDate(item.createdAt)}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {t('issueCountLabel', { count: item.issueCount })}
                              </Badge>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteToConfirm(item.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
                  <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                    {t('close')}
                  </Button>
                </div>
              </>
            )}
            {historyDetailLoading && !historyDetail && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-950/50">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteToConfirm} onOpenChange={(o) => { if (!o) setDeleteToConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteConfirm')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteConfirmDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">{ct('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 cursor-pointer"
            onClick={() => {
              if (deleteToConfirm) handleDeleteHistory(deleteToConfirm);
              setDeleteToConfirm(null);
            }}
          >
            {ct('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
