import type { CSSProperties } from 'react';

import type { TemplateDocument } from '@/lib/templates/template-document';
import { QrCodesPreview } from './qr-codes-preview';

export function DeclarativeTemplateDocument({ document }: { document: TemplateDocument }) {
  const hasColumns = document.layout.type !== 'single-column';
  const sidebarWidth = `${document.layout.sidebarWidthPercent}%`;
  const style = {
    '--template-text': document.colors.text,
    '--template-muted': document.colors.muted,
    '--template-accent': document.colors.accent,
    '--template-background': document.colors.background,
    '--template-font-size': `${document.typography.baseFontSizePt}pt`,
    '--template-line-height': document.typography.lineHeight,
    '--template-page-margin': `${document.spacing.pageMarginMm}mm`,
    '--template-section-gap': `${document.spacing.sectionGapMm}mm`,
    '--template-column-gap': `${document.layout.columnGapMm}mm`,
    '--template-sidebar-width': `${document.layout.sidebarWidthPercent}%`,
    color: document.colors.text,
    backgroundColor: document.colors.background,
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: `${document.typography.baseFontSizePt}pt`,
    lineHeight: document.typography.lineHeight,
    padding: `${document.spacing.pageMarginMm}mm`,
    display: hasColumns ? 'grid' : 'block',
    gridAutoFlow: hasColumns ? 'row dense' : undefined,
    gridTemplateColumns: hasColumns
      ? document.layout.sidebarPosition === 'left'
        ? `${sidebarWidth} minmax(0, 1fr)`
        : `minmax(0, 1fr) ${sidebarWidth}`
      : undefined,
    gap: hasColumns ? `${document.layout.columnGapMm}mm` : undefined,
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
      data-layout={document.layout.type}
      data-sidebar-position={document.layout.sidebarPosition}
      data-page-numbers={document.page.showPageNumbers}
      data-max-pages={document.page.maxPages}
      style={style}
    >
      {document.sections.map((section) => {
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
            marginBottom: `${document.spacing.sectionGapMm}mm`,
            ...variantStyle('divider', section.styleVariants.divider),
          }}
        >
          <h2 style={{
            color: section.headingVariant === 'accent'
              ? document.colors.accent
              : section.headingVariant === 'muted' ? document.colors.muted : document.colors.text,
            fontSize: `${document.typography.baseFontSizePt * document.typography.headingScale}pt`,
            margin: '0 0 2mm',
            borderBottom: section.headingVariant === 'bordered' ? `1px solid ${document.colors.accent}` : undefined,
            paddingBottom: section.headingVariant === 'bordered' ? '1mm' : undefined,
            ...(section.headingVariant === 'compact' ? { fontSize: `${document.typography.baseFontSizePt}pt`, marginBottom: '1mm' } : {}),
          }}>{section.title}</h2>
          {section.blocks.map((block, blockIndex) => {
            const element = block.kind === 'contact' ? 'contact' : block.kind === 'list' ? 'bullet' : block.kind === 'qr' ? 'qr' : 'body';
            const blockVariant = section.styleVariants[element];
            const blockTextColor = blockVariant === 'accent'
              ? document.colors.accent
              : blockVariant === 'muted' ? document.colors.muted : document.colors.text;
            if (block.kind === 'list') {
              return (
                <ul key={blockIndex} data-block="list" style={{ margin: '0 0 1.5mm', paddingLeft: '5mm', ...variantStyle('bullet', section.styleVariants.bullet) }}>
                  {block.textRuns.map((textRun, textIndex) => (
                    <li key={textIndex} data-tone={textRun.tone} style={textRun.tone === 'muted' ? variantStyle('date', section.styleVariants.date) : undefined}>{textRun.text}</li>
                  ))}
                </ul>
              );
            }
            if (block.kind === 'qr' && block.images.length === 0) {
              return <div key={blockIndex} data-block="qr" style={variantStyle('qr', section.styleVariants.qr)}><QrCodesPreview items={block.links.map((link, index) => ({ id: `${section.type}:${blockIndex}:${index}`, label: link.label, url: link.href }))} /></div>;
            }
            return (
            <p key={blockIndex} data-block={block.kind} style={{ margin: '0 0 1.5mm', whiteSpace: 'pre-wrap', ...variantStyle(element, section.styleVariants[element]) }}>
              {block.images.map((image, imageIndex) => (
                // Data URLs are saved Resume content; Next Image cannot optimize them without changing bytes.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`image:${imageIndex}`} src={image.src} alt={image.alt} data-image-role={image.role} style={{ maxWidth: image.role === 'qr' ? '24mm' : '32mm', height: 'auto', objectFit: 'cover', ...variantStyle(image.role, section.styleVariants[image.role]) }} />
              ))}
              {block.textRuns.map((textRun, textIndex) => (
                <span
                  key={`text:${textIndex}`}
                  data-tone={textRun.tone}
                  style={{
                    color: textRun.tone === 'muted' ? document.colors.muted : textRun.tone === 'accent' ? document.colors.accent : blockTextColor,
                    ...(textRun.tone === 'muted' ? variantStyle('date', section.styleVariants.date) : {}),
                  }}
                >{textRun.text}{' '}</span>
              ))}
              {block.links.map((link, linkIndex) => (
                <a key={`link:${linkIndex}`} href={link.href} rel="noreferrer noopener" style={{ color: document.colors.accent }}>{link.label}{' '}</a>
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
