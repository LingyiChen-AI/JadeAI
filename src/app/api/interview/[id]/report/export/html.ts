import type { RoundEvaluation, DimensionScore, ImprovementItem } from '@/types/interview';
import { BRAND_COLORS } from '@/lib/brand-constants';

function getGradeLabel(score: number): { zh: string; color: string } {
  if (score >= 90) return { zh: '优秀', color: '#16a34a' };
  if (score >= 75) return { zh: '良好', color: '#2563eb' };
  if (score >= 60) return { zh: '合格', color: '#ca8a04' };
  return { zh: '需提升', color: '#dc2626' };
}

function starHtml(score: number): string {
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < score ? '#facc15' : '#e5e7eb'};">★</span>`
  ).join('');
}

export function generateInterviewReportHtml(report: any, session: any): string {
  const grade = getGradeLabel(report.overallScore);
  const rounds = (report.roundEvaluations || []) as RoundEvaluation[];
  const dimensions = (report.dimensionScores || []) as DimensionScore[];
  const improvements = (report.improvementPlan || []) as ImprovementItem[];
  const date = new Date(session.createdAt).toLocaleDateString();

  const priorityColors: Record<string, { bg: string; text: string }> = {
    high: { bg: '#fef2f2', text: '#dc2626' },
    medium: { bg: '#fefce8', text: '#ca8a04' },
    low: { bg: '#f0fdf4', text: '#16a34a' },
  };
  const priorityLabels: Record<string, string> = { high: '高', medium: '中', low: '低' };

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>面试报告 - ${session.jobTitle}</title>
<style>
  @page { margin: 15mm 12mm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #18181b; font-size: 12px; line-height: 1.7; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px; }

  .header { display: flex; align-items: center; gap: 20px; padding-bottom: 20px; border-bottom: 2px solid #f4f4f5; margin-bottom: 24px; }
  .score-circle { width: 72px; height: 72px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 3px solid ${grade.color}; flex-shrink: 0; }
  .score-number { font-size: 26px; font-weight: 800; color: ${grade.color}; line-height: 1; }
  .score-label { font-size: 10px; font-weight: 600; color: ${grade.color}; margin-top: 2px; }
  .header-info h1 { font-size: 18px; font-weight: 700; margin-bottom: 3px; }
  .header-info p { font-size: 11px; color: #71717a; }

  .section { margin-bottom: 22px; }
  .section-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #f4f4f5; }

  .feedback { background: #fafafa; border-radius: 6px; padding: 14px; font-size: 12px; line-height: 1.8; white-space: pre-wrap; }

  .dim-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .dim-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #fafafa; border-radius: 5px; }
  .dim-name { flex: 1; font-size: 11px; white-space: nowrap; }
  .dim-bar-outer { width: 100px; height: 6px; background: #f4f4f5; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
  .dim-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, ${BRAND_COLORS.brand}, ${BRAND_COLORS.brandMuted}); }
  .dim-score { font-size: 11px; font-weight: 700; color: ${BRAND_COLORS.brand}; width: 24px; text-align: right; flex-shrink: 0; }

  .round { border: 1px solid #f4f4f5; border-radius: 6px; margin-bottom: 14px; overflow: hidden; break-inside: avoid; }
  .round-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #fafafa; }
  .round-name { font-weight: 600; font-size: 13px; }
  .round-score { font-size: 16px; font-weight: 800; color: ${BRAND_COLORS.brand}; }
  .round-feedback { padding: 10px 14px; font-size: 11px; color: #52525b; border-bottom: 1px solid #f4f4f5; }
  .question { padding: 10px 14px; border-bottom: 1px solid #f4f4f5; }
  .question:last-child { border-bottom: none; }
  .q-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .q-num { font-size: 10px; font-weight: 600; color: #a1a1aa; }
  .q-stars { font-size: 11px; letter-spacing: 1px; }
  .q-tag { font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
  .q-tag-review { background: #fef3c7; color: #92400e; }
  .q-tag-hint { background: #fef9c3; color: #854d0e; }
  .q-tag-skip { background: #f4f4f5; color: #71717a; }
  .q-text { font-size: 12px; font-weight: 600; margin-bottom: 3px; }
  .q-answer { font-size: 11px; color: #52525b; margin-bottom: 5px; }
  .q-detail { font-size: 10px; margin-bottom: 2px; }
  .q-detail-label { font-weight: 600; }
  .q-detail-green { color: #16a34a; }
  .q-detail-red { color: #dc2626; }
  .q-detail-blue { color: #2563eb; }

  .imp-item { display: flex; gap: 10px; padding: 10px; background: #fafafa; border-radius: 6px; margin-bottom: 6px; break-inside: avoid; }
  .imp-badge { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px; white-space: nowrap; height: fit-content; }
  .imp-content { flex: 1; }
  .imp-area { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
  .imp-desc { font-size: 11px; color: #52525b; margin-bottom: 3px; }
  .imp-resources { font-size: 10px; color: #71717a; }

  .footer { text-align: center; padding-top: 16px; border-top: 1px solid #f4f4f5; margin-top: 24px; font-size: 10px; color: #a1a1aa; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="score-circle">
      <div class="score-number">${report.overallScore}</div>
      <div class="score-label">${grade.zh}</div>
    </div>
    <div class="header-info">
      <h1>${session.jobTitle}</h1>
      <p>${date} · ${rounds.length} 轮面试 · ${rounds.reduce((s: number, r: RoundEvaluation) => s + r.questions.length, 0)} 题</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">总体评价</div>
    <div class="feedback">${report.overallFeedback}</div>
  </div>

  <div class="section">
    <div class="section-title">能力维度</div>
    <div class="dim-grid">
      ${dimensions.map(d => `
        <div class="dim-item">
          <span class="dim-name">${d.dimension}</span>
          <div class="dim-bar-outer"><div class="dim-bar-fill" style="width:${d.score}%"></div></div>
          <span class="dim-score">${d.score}</span>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="section">
    <div class="section-title">分轮评估</div>
    ${rounds.map(r => `
      <div class="round">
        <div class="round-header">
          <span class="round-name">${r.interviewerName} · ${r.interviewerType}</span>
          <span class="round-score">${r.score}</span>
        </div>
        <div class="round-feedback">${r.feedback}</div>
        ${r.questions.map((q, qi) => `
          <div class="question">
            <div class="q-header">
              <span class="q-num">Q${qi + 1}</span>
              <span class="q-stars">${starHtml(q.score)}</span>
              ${q.marked ? '<span class="q-tag q-tag-review">标记复习</span>' : ''}
              ${q.hinted ? '<span class="q-tag q-tag-hint">使用提示</span>' : ''}
              ${q.skipped ? '<span class="q-tag q-tag-skip">已跳过</span>' : ''}
            </div>
            <div class="q-text">${q.question}</div>
            <div class="q-answer">${q.answerSummary}</div>
            ${q.highlights.length ? `<div class="q-detail"><span class="q-detail-label q-detail-green">亮点：</span>${q.highlights.join('；')}</div>` : ''}
            ${q.weaknesses.length ? `<div class="q-detail"><span class="q-detail-label q-detail-red">不足：</span>${q.weaknesses.join('；')}</div>` : ''}
            <div class="q-detail"><span class="q-detail-label q-detail-blue">参考：</span>${q.referenceTips}</div>
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>

  <div class="section">
    <div class="section-title">改进建议</div>
    ${improvements.map(item => {
      const pc = priorityColors[item.priority] || priorityColors.medium;
      return `
        <div class="imp-item">
          <span class="imp-badge" style="background:${pc.bg};color:${pc.text};">${priorityLabels[item.priority] || item.priority}</span>
          <div class="imp-content">
            <div class="imp-area">${item.area}</div>
            <div class="imp-desc">${item.description}</div>
            ${item.resources.length ? `<div class="imp-resources">推荐资源：${item.resources.join('；')}</div>` : ''}
          </div>
        </div>
      `;
    }).join('')}
  </div>

  <div class="footer">Generated by 小逆offer · ${date}</div>
</div>
</body>
</html>`;
}
