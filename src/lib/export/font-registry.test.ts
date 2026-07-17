import { describe, expect, it } from 'vitest';

import { resolveExportFont } from './font-registry';

describe('export font registry', () => {
  it('resolves bundled and unsupported theme fonts to one embedded Noto family', () => {
    for (const requested of ['Noto Sans SC', 'Inter', 'Georgia', 'Garamond', 'Decorative Missing Font']) {
      const font = resolveExportFont(requested);

      expect(font.family).toBe('Noto Sans SC');
      expect(font.word).toEqual({
        ascii: 'Noto Sans SC',
        hAnsi: 'Noto Sans SC',
        eastAsia: 'Noto Sans SC',
        cs: 'Noto Sans SC',
      });
      expect(font.regularPath).toMatch(/NotoSansSC-Regular\.otf$/);
      expect(font.boldPath).toMatch(/NotoSansSC-Bold\.otf$/);
    }
  });
});
