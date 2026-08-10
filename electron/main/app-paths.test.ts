import { describe, expect, it } from 'vitest';
import { resolveAssetRoot } from './app-paths';

describe('resolveAssetRoot', () => {
  it('uses resourcesPath when packaged', () => {
    expect(
      resolveAssetRoot({
        isPackaged: true,
        resourcesPath: '/Applications/JadeAI.app/Contents/Resources',
        appRoot: '/repo',
      }),
    ).toBe('/Applications/JadeAI.app/Contents/Resources');
  });

  it('uses the repo root when not packaged', () => {
    expect(
      resolveAssetRoot({
        isPackaged: false,
        resourcesPath: '/somewhere/electron/dist/resources',
        appRoot: '/repo',
      }),
    ).toBe('/repo');
  });
});
