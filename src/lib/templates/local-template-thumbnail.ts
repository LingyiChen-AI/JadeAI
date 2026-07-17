import type { DeclarativeTemplateManifest } from '@/types/template';

const FALLBACK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3n0YVwAAAABJRU5ErkJggg==';

function fallbackThumbnail(): Blob {
  const bytes = Uint8Array.from(atob(FALLBACK_PNG_BASE64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

export async function createLocalTemplateThumbnail(manifest: DeclarativeTemplateManifest): Promise<Blob> {
  if (typeof document === 'undefined') return fallbackThumbnail();
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 320;
    const context = canvas.getContext('2d');
    if (!context) return fallbackThumbnail();
    context.fillStyle = manifest.colors.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = manifest.colors.accent;
    context.fillRect(18, 18, 72, 8);
    context.fillStyle = manifest.colors.text;
    context.fillRect(18, 38, 132, 5);
    context.fillStyle = manifest.colors.muted;
    for (let line = 0; line < 8; line += 1) {
      const width = line % 3 === 0 ? 184 : line % 3 === 1 ? 150 : 168;
      context.fillRect(18, 70 + line * 24, width, 4);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ?? fallbackThumbnail();
  } catch {
    return fallbackThumbnail();
  }
}
