import { describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchDesktopReleases,
  parseDesktopTag,
  resolveUpdatePromptAction,
  selectAvailableUpdate,
  selectInstallerAsset,
  UPDATE_PROMPT_BUTTONS,
  type GitHubRelease,
  type GitHubReleaseAsset,
} from './update-check';

function release(tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease {
  return { tag_name: tag, html_url: `https://example.test/${tag}`, ...extra };
}

function asset(name: string, size: number): GitHubReleaseAsset {
  return { name, browser_download_url: `https://example.test/asset/${name}`, size };
}

describe('selectInstallerAsset', () => {
  const assets = [
    asset('JadeAI-1.0.0-mac-arm64.dmg', 1),
    asset('JadeAI-1.0.0-mac-x64.dmg', 2),
    asset('JadeAI-1.0.0-win-x64-setup.exe', 3),
  ];

  // These suffixes mirror artifactName in the electron-builder config. If they
  // drift apart the app silently stops finding its own installers.
  it.each([
    ['darwin', 'arm64', 'JadeAI-1.0.0-mac-arm64.dmg'],
    ['darwin', 'x64', 'JadeAI-1.0.0-mac-x64.dmg'],
    ['win32', 'x64', 'JadeAI-1.0.0-win-x64-setup.exe'],
  ] as const)('picks the %s %s installer', (platform, arch, expected) => {
    expect(selectInstallerAsset(assets, platform, arch)?.name).toBe(expected);
  });

  // mac arm64 must not match the x64 dmg just because both end in .dmg.
  it('does not fall back to another arch', () => {
    const onlyX64 = [asset('JadeAI-1.0.0-mac-x64.dmg', 2)];
    expect(selectInstallerAsset(onlyX64, 'darwin', 'arm64')).toBeNull();
  });

  it('returns null on a platform with no installer, rather than guessing', () => {
    expect(selectInstallerAsset(assets, 'linux', 'x64')).toBeNull();
  });

  it('returns null for an empty asset list', () => {
    expect(selectInstallerAsset([], 'darwin', 'arm64')).toBeNull();
  });
});

describe('parseDesktopTag', () => {
  it('accepts desktop tags with and without a prerelease suffix', () => {
    expect(parseDesktopTag('ds-v0.0.1')).toBe('0.0.1');
    expect(parseDesktopTag('ds-v1.2.3-beta.1')).toBe('1.2.3-beta.1');
  });

  // The repo publishes the web app under `v*` into the same releases list. If
  // those parsed, the client would offer the web release as its own update.
  it('rejects the web app tags that share this releases list', () => {
    expect(parseDesktopTag('v0.4.1')).toBeNull();
    expect(parseDesktopTag('v1.0.0')).toBeNull();
  });

  it('rejects anything it cannot parse rather than guessing', () => {
    expect(parseDesktopTag('ds-v1.2')).toBeNull();
    expect(parseDesktopTag('ds-1.2.3')).toBeNull();
    expect(parseDesktopTag('desktop-v1.2.3')).toBeNull();
    expect(parseDesktopTag('')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by the numeric triple', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('0.0.10', '0.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  // Not string ordering: '0.0.10' < '0.0.9' lexically, and a user on 0.0.10
  // would be told 0.0.9 is an upgrade.
  it('compares each segment numerically, not lexically', () => {
    expect(compareVersions('0.0.9', '0.0.10')).toBeLessThan(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });

  // Otherwise someone on the released 1.2.3 gets nagged to "upgrade" to the
  // beta that preceded it.
  it('sorts a prerelease below the release it leads to', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3-beta.1')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBeLessThan(0);
  });

  it('treats unparseable input as older, so it never triggers a prompt', () => {
    expect(compareVersions('not-a-version', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', 'not-a-version')).toBeGreaterThan(0);
  });
});

describe('selectAvailableUpdate', () => {
  it('finds the newest desktop release above the running version', () => {
    const releases = [release('ds-v0.0.1'), release('ds-v0.2.0'), release('ds-v0.1.0')];
    expect(selectAvailableUpdate(releases, '0.0.1', null)).toEqual({
      version: '0.2.0',
      tag: 'ds-v0.2.0',
      url: 'https://example.test/ds-v0.2.0',
      asset: null,
    });
  });

  it('attaches the installer built for this machine', () => {
    const releases = [
      release('ds-v0.2.0', {
        assets: [
          asset('JadeAI-0.2.0-mac-arm64.dmg', 111),
          asset('JadeAI-0.2.0-mac-x64.dmg', 222),
          asset('JadeAI-0.2.0-win-x64-setup.exe', 333),
        ],
      }),
    ];
    expect(selectAvailableUpdate(releases, '0.0.1', null, 'darwin', 'arm64')?.asset).toEqual({
      name: 'JadeAI-0.2.0-mac-arm64.dmg',
      url: 'https://example.test/asset/JadeAI-0.2.0-mac-arm64.dmg',
      size: 111,
    });
    expect(selectAvailableUpdate(releases, '0.0.1', null, 'win32', 'x64')?.asset?.size).toBe(333);
  });

  // A release with no matching asset must still be reported, so the caller can
  // fall back to opening the page rather than staying silent about an update.
  it('reports the update with a null asset when nothing matches this machine', () => {
    const releases = [release('ds-v0.2.0', { assets: [asset('JadeAI-0.2.0-mac-x64.dmg', 1)] })];
    const update = selectAvailableUpdate(releases, '0.0.1', null, 'darwin', 'arm64');
    expect(update?.version).toBe('0.2.0');
    expect(update?.asset).toBeNull();
  });

  it('returns null when the running version is already the newest', () => {
    expect(selectAvailableUpdate([release('ds-v0.0.1')], '0.0.1', null)).toBeNull();
    expect(selectAvailableUpdate([release('ds-v0.0.1')], '0.1.0', null)).toBeNull();
  });

  // The reason this module filters at all. A web release is always "newer" by
  // number (0.4.1 today) and would otherwise be offered to the client.
  it('ignores the web app releases sharing the same list', () => {
    const releases = [release('v0.4.1'), release('v9.9.9'), release('ds-v0.0.1')];
    expect(selectAvailableUpdate(releases, '0.0.1', null)).toBeNull();
  });

  it('ignores drafts and prereleases', () => {
    const releases = [
      release('ds-v9.0.0', { draft: true }),
      release('ds-v8.0.0', { prerelease: true }),
    ];
    expect(selectAvailableUpdate(releases, '0.0.1', null)).toBeNull();
  });

  it('stays quiet about a version the user chose to skip', () => {
    const releases = [release('ds-v0.2.0')];
    expect(selectAvailableUpdate(releases, '0.0.1', '0.2.0')).toBeNull();
  });

  // Skipping one version must not mute every later one.
  it('still reports a version newer than the skipped one', () => {
    const releases = [release('ds-v0.2.0'), release('ds-v0.3.0')];
    expect(selectAvailableUpdate(releases, '0.0.1', '0.2.0')?.version).toBe('0.3.0');
  });

  it('returns null for an empty list', () => {
    expect(selectAvailableUpdate([], '0.0.1', null)).toBeNull();
  });
});

describe('resolveUpdatePromptAction', () => {
  // Pins each label to its behaviour by looking the index up from the same
  // array the dialog renders. Reordering the buttons without updating the
  // mapping would otherwise turn "skip this version" into "download".
  it.each([
    ['立即下载', 'open'],
    ['稍后再说', 'dismiss'],
    ['跳过此版本', 'skip'],
  ] as const)('maps %s to %s', (label, expected) => {
    expect(resolveUpdatePromptAction(UPDATE_PROMPT_BUTTONS.indexOf(label))).toBe(expected);
  });

  // A dialog closed by Esc or the window going away reports an index of its
  // own; none of those are consent to never hear about this version again.
  it('treats any unexpected response as dismiss, never as skip', () => {
    expect(resolveUpdatePromptAction(-1)).toBe('dismiss');
    expect(resolveUpdatePromptAction(99)).toBe('dismiss');
  });
});

describe('fetchDesktopReleases', () => {
  it('returns the parsed releases list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([release('ds-v0.0.1')]),
    });
    const result = await fetchDesktopReleases({ fetch: fetchImpl, repository: 'owner/repo' });
    expect(result).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/owner/repo/releases?per_page=30',
    );
    // GitHub rejects requests with no User-Agent.
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBeTruthy();
  });

  // An update check is the only network call this app makes. Failing it must be
  // invisible — never a dialog, never a delayed launch, and never a throw that
  // reaches the caller.
  it('returns an empty list instead of throwing when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      fetchDesktopReleases({ fetch: fetchImpl, repository: 'owner/repo' }),
    ).resolves.toEqual([]);
  });

  it('returns an empty list on a rate-limit or error response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      fetchDesktopReleases({ fetch: fetchImpl, repository: 'owner/repo' }),
    ).resolves.toEqual([]);
  });

  it('returns an empty list when the body is not an array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Not Found' }),
    });
    await expect(
      fetchDesktopReleases({ fetch: fetchImpl, repository: 'owner/repo' }),
    ).resolves.toEqual([]);
  });
});
