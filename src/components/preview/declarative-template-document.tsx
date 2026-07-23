import type { CSSProperties } from 'react';

import { renderRichTextInlineHtml } from '@/lib/resume/rich-text';
import type { TemplateDocument } from '@/lib/templates/template-document';
import { QrCodesPreview } from './qr-codes-preview';

function cssNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function DeclarativeTemplateDocument({ document }: { document: TemplateDocument }) {
  const presentation = document.presentation;
  const hasColumns = document.layout.type !== 'single-column';
  const sidebarWidth = `${document.layout.sidebarWidthPercent}%`;
  const pageMargin = document.page.marginMm;
  const baseFontSize = cssNumber(document.typography.baseFontSizePt);
  const style = {
    '--template-text': document.colors.text,
    '--template-heading': document.headingColor,
    '--template-muted': document.colors.muted,
    '--template-accent': document.colors.accent,
    '--template-background': document.colors.background,
    '--template-font-size': `${baseFontSize}pt`,
    '--template-line-height': document.typography.lineHeight,
    '--template-page-margin-top': `${pageMargin.top}mm`,
    '--template-page-margin-right': `${pageMargin.right}mm`,
    '--template-page-margin-bottom': `${pageMargin.bottom}mm`,
    '--template-page-margin-left': `${pageMargin.left}mm`,
    '--template-section-gap': `${document.spacing.sectionGapMm}mm`,
    '--template-column-gap': `${document.layout.columnGapMm}mm`,
    '--template-sidebar-width': `${document.layout.sidebarWidthPercent}%`,
    '--template-secondary': presentation?.palette.secondary,
    '--template-surface': presentation?.palette.surface,
    '--template-border': presentation?.palette.border,
    '--template-border-width': presentation ? `${presentation.border.widthPt}pt` : undefined,
    '--template-radius': presentation ? `${presentation.border.radiusMm}mm` : undefined,
    color: document.colors.text,
    backgroundColor: document.colors.background,
    fontFamily: document.fontFamily === 'noto-sans-sc' ? '"Noto Sans SC", sans-serif' : 'sans-serif',
    fontSize: `${baseFontSize}pt`,
    lineHeight: document.typography.lineHeight,
    padding: `${pageMargin.top}mm ${pageMargin.right}mm ${pageMargin.bottom}mm ${pageMargin.left}mm`,
    display: hasColumns ? 'grid' : 'block',
    gridAutoFlow: hasColumns ? 'row dense' : undefined,
    gridTemplateColumns: hasColumns
      ? document.layout.sidebarPosition === 'left'
        ? `${sidebarWidth} minmax(0, 1fr)`
        : `minmax(0, 1fr) ${sidebarWidth}`
      : undefined,
    gap: hasColumns ? `${document.layout.columnGapMm}mm` : undefined,
    borderTop: presentation?.decoration.variant === 'top-rule' ? `${presentation.border.widthPt}pt solid ${document.colors.accent}` : undefined,
    borderLeft: presentation?.decoration.variant === 'side-rule' ? `${presentation.border.widthPt}pt solid ${document.colors.accent}` : undefined,
    borderRadius: presentation ? `${presentation.border.radiusMm}mm` : undefined,
    backgroundImage: presentation?.decoration.variant === 'corner-accent'
      ? `linear-gradient(135deg, ${presentation.palette.surface} 0 14mm, transparent 14mm)`
      : presentation?.decoration.variant === 'grid-lines'
        ? `linear-gradient(${presentation.palette.border} 1px, transparent 1px), linear-gradient(90deg, ${presentation.palette.border} 1px, transparent 1px)`
        : undefined,
    backgroundSize: presentation?.decoration.variant === 'grid-lines' ? '6mm 6mm' : undefined,
  } as CSSProperties;

  const sectionColumn = (placement: TemplateDocument['sections'][number]['placement']) => {
    if (!hasColumns) return undefined;
    if (placement === 'header' || placement === 'footer') return '1 / -1';
    if (placement === 'sidebar') return document.layout.sidebarPosition === 'left' ? '1' : '2';
    return document.layout.sidebarPosition === 'left' ? '2' : '1';
  };

  const variantStyle = (element: string, variant: string | undefined): CSSProperties => {
    if (variant === 'compact') {
      if (element === 'avatar' || element === 'qr') return { maxWidth: element === 'qr' ? '20mm' : '24mm' };
      if (element === 'divider') return { marginBottom: '1mm', paddingBottom: '1mm' };
      return { fontSize: '0.9em', lineHeight: 1.25 };
    }
    if (variant === 'accent') {
      if (element === 'divider') return { borderBottom: `1px solid ${document.colors.accent}` };
      if (element === 'avatar' || element === 'qr') return { border: `2px solid ${document.colors.accent}` };
      return { color: document.colors.accent };
    }
    if (variant === 'muted') {
      if (element === 'divider') return { borderBottom: `1px solid ${document.colors.muted}` };
      if (element === 'avatar' || element === 'qr') return { opacity: 0.72 };
      return { color: document.colors.muted };
    }
    if (variant === 'bordered') {
      if (element === 'divider') return { borderBottom: `1px solid ${document.colors.muted}`, paddingBottom: '2mm' };
      if (element === 'avatar' || element === 'qr') return { border: `2px solid ${document.colors.accent}`, padding: '1mm' };
      return { borderLeft: `2px solid ${document.colors.accent}`, paddingLeft: '2mm' };
    }
    return {};
  };

  return (
    <article
      className="declarative-resume"
      data-renderer-kind={presentation ? 'declarative-v2' : undefined}
      data-header-variant={presentation?.header.variant}
      data-contact-layout={presentation?.header.contactLayout}
      data-entry-variant={presentation?.entry.variant}
      data-section-heading={presentation?.section.headingVariant}
      data-skills-variant={presentation?.skills.variant}
      data-decoration={presentation?.decoration.variant}
      data-density={presentation?.density}
      data-layout={document.layout.type}
      data-avatar-style={document.avatarStyle}
      data-sidebar-position={document.layout.sidebarPosition}
      data-page-numbers={document.page.showPageNumbers}
      data-max-pages={document.page.maxPages}
      style={style}
    >
      {document.sections.map((section) => {
        const isHeader = section.placement === 'header';
        const isSplitHeader = isHeader && presentation?.header.variant === 'split';
        const v2HeadingStyle: CSSProperties = presentation?.section.headingVariant === 'underline'
          ? { borderBottom: `${presentation.border.widthPt}pt solid ${presentation.palette.border}`, paddingBottom: '1mm' }
          : presentation?.section.headingVariant === 'bordered'
            ? { border: `${presentation.border.widthPt}pt solid ${presentation.palette.border}`, borderRadius: `${presentation.border.radiusMm}mm`, padding: '1mm 2mm' }
            : presentation?.section.headingVariant === 'accent-block'
              ? { background: document.colors.accent, color: document.colors.background, borderRadius: `${presentation.border.radiusMm}mm`, padding: '1mm 2mm' }
              : presentation?.section.headingVariant === 'small-caps'
                ? { fontSize: `${baseFontSize}pt`, textTransform: 'uppercase', letterSpacing: 0 }
                : presentation?.section.headingVariant === 'side-rule'
                  ? { borderLeft: `${presentation.border.widthPt * 2}pt solid ${document.colors.accent}`, paddingLeft: '2mm' }
                  : {};
        const styleAttributes = Object.fromEntries(
          Object.entries(section.styleVariants).map(([element, variant]) => [`data-style-${element}`, variant]),
        );
        return (
        <section
          key={`${section.type}:${section.order}`}
          data-section={section.type}
          data-placement={section.placement}
          data-heading-variant={section.headingVariant}
          {...styleAttributes}
          style={{
            gridColumn: sectionColumn(section.placement),
            marginBottom: `${document.spacing.sectionGapMm * (presentation?.density === 'compact' ? 0.7 : presentation?.density === 'comfortable' ? 1.25 : 1)}mm`,
            ...(isHeader && presentation?.header.variant === 'centered' ? { textAlign: 'center' as const } : {}),
            ...(isHeader && presentation?.header.variant === 'band' ? { background: presentation.palette.secondary, color: document.colors.background, padding: '5mm', borderRadius: `${presentation.border.radiusMm}mm` } : {}),
            ...(isSplitHeader ? { display: 'grid', gridTemplateColumns: 'minmax(24mm, auto) minmax(0, 1fr)', gap: '2mm 4mm', alignItems: 'start' } : {}),
            ...(isHeader && presentation?.header.variant === 'editorial' ? { borderBottom: `${presentation.border.widthPt * 2}pt solid ${document.colors.accent}`, paddingBottom: '3mm' } : {}),
            ...(!isHeader && presentation?.entry.variant === 'timeline' ? { borderLeft: `${presentation.border.widthPt}pt solid ${presentation.palette.border}`, paddingLeft: '4mm' } : {}),
            ...(section.type === 'skills' && presentation?.skills.variant === 'compact-grid' ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1mm 4mm' } : {}),
            ...variantStyle('divider', section.styleVariants.divider),
          }}
        >
          <h2 style={{
            color: section.headingVariant === 'accent'
              ? document.colors.accent
              : section.headingVariant === 'muted' ? document.colors.muted : document.headingColor,
            fontSize: `${cssNumber(document.typography.baseFontSizePt * document.typography.headingScale)}pt`,
            margin: '0 0 2mm',
            borderBottom: section.headingVariant === 'bordered' ? `1px solid ${document.colors.accent}` : undefined,
            paddingBottom: section.headingVariant === 'bordered' ? '1mm' : undefined,
            gridColumn: isSplitHeader ? 1 : undefined,
            ...(section.headingVariant === 'compact' ? { fontSize: `${baseFontSize}pt`, marginBottom: '1mm' } : {}),
            ...v2HeadingStyle,
            ...(isHeader && presentation?.header.variant === 'band' ? { color: document.colors.background } : {}),
          }}>{section.title}</h2>
          {section.blocks.map((block, blockIndex) => {
            const element = block.kind === 'contact' ? 'contact' : block.kind === 'list' ? 'bullet' : block.kind === 'qr' ? 'qr' : 'body';
            const blockVariant = section.styleVariants[element];
            const blockTextColor = blockVariant === 'accent'
              ? document.colors.accent
              : blockVariant === 'muted' ? document.colors.muted : document.colors.text;
            if (block.kind === 'list') {
              return (
                <ul key={blockIndex} data-block="list" style={{ margin: '0 0 1.5mm', paddingLeft: '5mm', gridColumn: isSplitHeader ? 2 : undefined, ...variantStyle('bullet', section.styleVariants.bullet) }}>
                  {block.textRuns.map((textRun, textIndex) => (
                    <li
                      key={textIndex}
                      data-tone={textRun.tone}
                      data-placeholder={textRun.placeholder ? 'true' : undefined}
                      style={{
                        ...(textRun.tone === 'muted' ? variantStyle('date', section.styleVariants.date) : {}),
                        opacity: textRun.placeholder ? 0.58 : undefined,
                      }}
                      dangerouslySetInnerHTML={{ __html: renderRichTextInlineHtml(textRun.text) }}
                    />
                  ))}
                </ul>
              );
            }
            if (block.kind === 'qr' && block.images.length === 0) {
              const linkHasPlaceholder = (linkIndex: number) => Boolean(
                block.links[linkIndex]?.placeholder || block.textRuns[linkIndex]?.placeholder,
              );
              const hasPlaceholderContent = block.links.some((_, linkIndex) => linkHasPlaceholder(linkIndex))
                || block.textRuns.some((textRun) => textRun.placeholder);
              return (
                <div key={blockIndex} data-block="qr" style={{ gridColumn: isSplitHeader ? 2 : undefined, ...variantStyle('qr', section.styleVariants.qr) }}>
                  {hasPlaceholderContent
                    ? block.links.map((link, linkIndex) => (
                        <a
                          key={`link:${linkIndex}`}
                          href={link.href}
                          rel="noreferrer noopener"
                          data-placeholder={linkHasPlaceholder(linkIndex) ? 'true' : undefined}
                          style={{ opacity: linkHasPlaceholder(linkIndex) ? 0.58 : undefined }}
                        >{link.label}</a>
                      ))
                    : <QrCodesPreview items={block.links.map((link, index) => ({ id: `${section.type}:${blockIndex}:${index}`, label: link.label, url: link.href }))} />}
                </div>
              );
            }
            return (
            <p key={blockIndex} data-block={block.kind} style={{
              margin: presentation?.entry.variant === 'compact' ? '0 0 .7mm' : '0 0 1.5mm',
              whiteSpace: 'pre-wrap',
              gridColumn: isSplitHeader ? 2 : undefined,
              ...(block.kind === 'contact' && (presentation?.header.contactLayout === 'inline' || presentation?.header.contactLayout === 'separated') ? { display: 'flex', flexWrap: 'wrap', gap: '1mm 4mm' } : {}),
              ...variantStyle(element, section.styleVariants[element]),
            }}>
              {block.images.map((image, imageIndex) => (
                // Data URLs are saved Resume content; Next Image cannot optimize them without changing bytes.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`image:${imageIndex}`} src={image.src} alt={image.alt} data-image-role={image.role} style={{ maxWidth: image.role === 'qr' ? '24mm' : '32mm', height: 'auto', objectFit: 'cover', borderRadius: image.role === 'avatar' && document.avatarStyle === 'circle' ? '9999px' : undefined, ...variantStyle(image.role, section.styleVariants[image.role]) }} />
              ))}
              {block.textRuns.map((textRun, textIndex) => (
                <span
                  key={`text:${textIndex}`}
                  data-tone={textRun.tone}
                  data-placeholder={textRun.placeholder ? 'true' : undefined}
                  style={{
                    opacity: textRun.placeholder ? 0.58 : undefined,
                    color: textRun.tone === 'muted' ? document.colors.muted : textRun.tone === 'accent' ? document.colors.accent : blockTextColor,
                    ...(textRun.tone === 'muted' ? variantStyle('date', section.styleVariants.date) : {}),
                    ...(textRun.tone === 'muted' && presentation?.entry.variant === 'date-rail' ? { display: 'inline-block', minWidth: '24mm', color: presentation.palette.secondary } : {}),
                    ...(section.type === 'skills' && presentation?.skills.variant === 'tags' ? { display: 'inline-block', background: presentation.palette.surface, border: `${presentation.border.widthPt}pt solid ${presentation.palette.border}`, borderRadius: `${presentation.border.radiusMm}mm`, padding: '.5mm 2mm', margin: '.5mm' } : {}),
                  }}
                  dangerouslySetInnerHTML={{ __html: `${renderRichTextInlineHtml(textRun.text)} ` }}
                />
              ))}
              {block.links.map((link, linkIndex) => (
                <a key={`link:${linkIndex}`} href={link.href} rel="noreferrer noopener" data-placeholder={link.placeholder ? 'true' : undefined} style={{ color: document.colors.accent, overflowWrap: 'anywhere', opacity: link.placeholder ? 0.58 : undefined }}>{link.label}{' '}</a>
              ))}
            </p>
            );
          })}
        </section>
        );
      })}
      {document.page.showPageNumbers && <footer data-page-number="1">1</footer>}
    </article>
  );
}
