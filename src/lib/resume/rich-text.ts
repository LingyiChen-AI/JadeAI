export type RichTextBlockKind = 'paragraph' | 'bullet' | 'ordered';

export interface RichTextBlock {
  kind: RichTextBlockKind;
  indent: number;
  text: string;
}

const MAX_INDENT = 3;

function clampIndent(value: number): number {
  return Math.max(0, Math.min(MAX_INDENT, value));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

export function parseRichText(value: unknown): RichTextBlock[] {
  if (value == null) return [];
  return String(value).replace(/\r\n?/g, '\n').split('\n').map((rawLine) => {
    const expanded = rawLine.replace(/^( +)/, (spaces) => '\t'.repeat(Math.floor(spaces.length / 2)));
    const leadingTabs = expanded.match(/^\t*/)?.[0].length ?? 0;
    const line = expanded.slice(leadingTabs).trim();
    const list = line.match(/^([-–•]|\d+[.)])\s+(.*)$/);
    if (!list) return { kind: 'paragraph' as const, indent: clampIndent(leadingTabs), text: line };
    return {
      kind: /^\d/.test(list[1]) ? 'ordered' as const : 'bullet' as const,
      indent: clampIndent(leadingTabs),
      text: list[2].trim(),
    };
  });
}

export function normalizeRichText(value: unknown): string {
  const blocks = parseRichText(value);
  while (blocks.length > 0 && blocks[0].text === '') blocks.shift();
  while (blocks.length > 0 && blocks.at(-1)?.text === '') blocks.pop();
  return blocks.map((block) => {
    const prefix = '\t'.repeat(block.indent);
    if (block.kind === 'bullet') return `${prefix}- ${block.text}`.trimEnd();
    if (block.kind === 'ordered') return `${prefix}1. ${block.text}`.trimEnd();
    return `${prefix}${block.text}`.trimEnd();
  }).join('\n');
}

export function renderRichTextHtml(value: unknown): string {
  const blocks = parseRichText(value);
  let html = '';
  let openList: { kind: 'bullet' | 'ordered'; indent: number } | null = null;
  const closeList = () => {
    if (!openList) return;
    html += openList.kind === 'bullet' ? '</ul>' : '</ol>';
    openList = null;
  };

  for (const block of blocks) {
    if (!block.text) {
      closeList();
      continue;
    }
    if (block.kind === 'paragraph') {
      closeList();
      html += `<p data-indent="${block.indent}" style="margin-left:${block.indent * 1.5}em">${renderInline(block.text)}</p>`;
      continue;
    }
    if (!openList || openList.kind !== block.kind || openList.indent !== block.indent) {
      closeList();
      const tag = block.kind === 'bullet' ? 'ul' : 'ol';
      html += `<${tag} data-indent="${block.indent}" style="margin:2px 0 2px ${1.5 + block.indent * 1.5}em">`;
      openList = { kind: block.kind, indent: block.indent };
    }
    html += `<li>${renderInline(block.text)}</li>`;
  }
  closeList();
  return html;
}

/** Render rich text inside an existing phrasing-content host such as p, li, or span. */
export function renderRichTextHostHtml(value: unknown): string {
  const blocks = parseRichText(value);
  const orderedIndexes = Array<number>(MAX_INDENT + 1).fill(0);

  const resetOrderedIndexes = () => orderedIndexes.fill(0);

  return blocks.map((block) => {
    if (!block.text) {
      resetOrderedIndexes();
      return '<br>';
    }

    let orderedIndex = 0;
    if (block.kind === 'ordered') {
      orderedIndexes[block.indent] += 1;
      orderedIndexes.fill(0, block.indent + 1);
      orderedIndex = orderedIndexes[block.indent];
    } else {
      orderedIndexes.fill(0, block.indent);
    }

    const indent = block.indent * 1.5;
    if (block.kind === 'paragraph') {
      return `<span data-rich-text-block="true" data-kind="paragraph" data-indent="${block.indent}" style="display:block;margin-left:${indent}em">${renderInline(block.text)}</span>`;
    }

    const marker = block.kind === 'bullet' ? '•' : `${orderedIndex}.`;
    return `<span data-rich-text-block="true" data-kind="${block.kind}" data-indent="${block.indent}" style="display:block;margin-left:${indent}em;padding-left:1.5em;text-indent:-1.5em"><span data-rich-text-marker="true">${marker} </span>${renderInline(block.text)}</span>`;
  }).join('');
}

export function richTextToPlainText(value: unknown): string {
  return parseRichText(value)
    .filter((block) => block.text)
    .map((block) => block.text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1'))
    .join('\n');
}
