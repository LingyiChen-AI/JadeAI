import path from 'node:path';

export const STABLE_EXPORT_FONT_FAMILY = 'Noto Sans SC';

export interface ResolvedExportFont {
  family: typeof STABLE_EXPORT_FONT_FAMILY;
  regularPath: string;
  boldPath: string;
  word: {
    ascii: string;
    hAnsi: string;
    eastAsia: string;
    cs: string;
  };
}

export function resolveExportFont(requestedFamily?: string): ResolvedExportFont {
  void requestedFamily;
  return {
    family: STABLE_EXPORT_FONT_FAMILY,
    regularPath: path.join(process.cwd(), 'public/fonts/NotoSansSC-Regular.otf'),
    boldPath: path.join(process.cwd(), 'public/fonts/NotoSansSC-Bold.otf'),
    word: {
      ascii: STABLE_EXPORT_FONT_FAMILY,
      hAnsi: STABLE_EXPORT_FONT_FAMILY,
      eastAsia: STABLE_EXPORT_FONT_FAMILY,
      cs: STABLE_EXPORT_FONT_FAMILY,
    },
  };
}
