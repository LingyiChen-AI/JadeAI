export type ExportFormat = 'pdf' | 'pdf-one-page' | 'docx' | 'html' | 'txt' | 'json';

const EXTENSIONS: Record<ExportFormat, string> = {
  pdf: 'pdf',
  'pdf-one-page': 'pdf',
  docx: 'docx',
  html: 'html',
  txt: 'txt',
  json: 'json',
};

export function buildExportUrl(resumeId: string, format: ExportFormat): string {
  const encodedId = encodeURIComponent(resumeId);
  if (format === 'pdf-one-page') {
    return `/api/resume/${encodedId}/export?format=pdf&fitOnePage=true`;
  }
  return `/api/resume/${encodedId}/export?format=${format}`;
}

function decodeFilename(value: string): string | null {
  const normalized = value.trim().replace(/^"|"$/g, '');
  if (!normalized) return null;
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8) return decodeFilename(utf8[1]);
  const quoted = /filename\s*=\s*("[^"]+"|[^;]+)/i.exec(header);
  return quoted ? decodeFilename(quoted[1]) : null;
}

function timestamp(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

export function fallbackExportFilename(title: string, format: ExportFormat, now = new Date()): string {
  const safeTitle = (title || 'resume').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return `${safeTitle}-${timestamp(now)}.${EXTENSIONS[format]}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
