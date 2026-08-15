import { describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchDesktopReleases,
  parseReleaseTag,
  selectAvailableUpdate,
  selectInstallerAsset,
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

describe('parseReleaseTag', () => {
  it('accepts the unified v* tags', () => {
    expect(parseReleaseTag('v0.5.0')).toBe('0.5.0');
    expect(parseReleaseTag('v1.2.3-beta.1')).toBe('1.2.3-beta.1');
  });

  // A client installed before the tag schemes merged must still recognise its
  // own release history, or its "current version" has nothing to compare to.
  it('still accepts the legacy ds-v* tags', () => {
    expect(parseReleaseTag('ds-v0.0.4')).toBe('0.0.4');
    expect(parseReleaseTag('ds-v1.2.3-beta.1')).toBe('1.2.3-beta.1');
  });

  it('rejects anything it cannot parse rather than guessing', () => {
    expect(parseReleaseTag('v1.2')).toBeNull();
    expect(parseReleaseTag('1.2.3')).toBeNull();
    expect(parseReleaseTag('ds-1.2.3')).toBeNull();
    expect(parseReleaseTag('desktop-v1.2.3')).toBeNull();
    expect(parseReleaseTag('')).toBeNull();
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
  it('finds the newest release above the running version', () => {
    const withAsset = (tag: string, v: string) =>
      release(tag, { assets: [asset(`JadeAI-${v}-mac-arm64.dmg`, 1)] });
    const releases = [withAsset('v0.0.1', '0.0.1'), withAsset('v0.2.0', '0.2.0'), withAsset('v0.1.0', '0.1.0')];
    expect(selectAvailableUpdate(releases, '0.0.1', null, 'darwin', 'arm64')).toEqual({
      version: '0.2.0',
      tag: 'v0.2.0',
      url: 'https://example.test/v0.2.0',
      asset: {
        name: 'JadeAI-0.2.0-mac-arm64.dmg',
        url: 'https://example.test/asset/JadeAI-0.2.0-mac-arm64.dmg',
        size: 1,
      },
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

  it('returns null when the running version is already the newest', () => {
    const releases = [release('v0.0.1', { assets: [asset('JadeAI-0.0.1-mac-arm64.dmg', 1)] })];
    expect(selectAvailableUpdate(releases, '0.0.1', null, 'darwin', 'arm64')).toBeNull();
    expect(selectAvailableUpdate(releases, '0.1.0', null, 'darwin', 'arm64')).toBeNull();
  });

  // The trap that requiring an installer exists for. Now that v* tags parse,
  // the repo's web-only history (v0.1.0 … v0.4.1, no installers) all outranks a
  // client on 0.0.4 by number. Offering one would send the user to a release
  // with nothing to install.
  it('ignores releases that carry no installer at all', () => {
    const releases = [release('v0.4.1'), release('v9.9.9'), release('ds-v0.0.1')];
    expect(selectAvailableUpdate(releases, '0.0.4', null, 'darwin', 'arm64')).toBeNull();
  });

  // A release built for other platforms is just as unusable here as one built
  // for none.
  it('ignores a release missing an installer for this arch', () => {
    const releases = [
      release('v0.5.0', { assets: [asset('JadeAI-0.5.0-win-x64-setup.exe', 1)] }),
    ];
    expect(selectAvailableUpdate(releases, '0.0.4', null, 'darwin', 'arm64')).toBeNull();
  });

  // The mixed state right after the schemes merge: an old ds-* release and a
  // new v* release both present, both with installers.
  it('prefers the newer version across both tag schemes', () => {
    const releases = [
      release('ds-v0.0.4', { assets: [asset('JadeAI-0.0.4-mac-arm64.dmg', 1)] }),
      release('v0.5.0', { assets: [asset('JadeAI-0.5.0-mac-arm64.dmg', 2)] }),
    ];
    expect(selectAvailableUpdate(releases, '0.0.2', null, 'darwin', 'arm64')?.version).toBe('0.5.0');
  });

  it('ignores drafts and prereleases', () => {
    const dmg = [asset('JadeAI-9.0.0-mac-arm64.dmg', 1)];
    const releases = [
      release('v9.0.0', { draft: true, assets: dmg }),
      release('v8.0.0', { prerelease: true, assets: dmg }),
    ];
    expect(selectAvailableUpdate(releases, '0.0.1', null, 'darwin', 'arm64')).toBeNull();
  });

  it('stays quiet about a version the user chose to skip', () => {
    const releases = [release('v0.2.0', { assets: [asset('JadeAI-0.2.0-mac-arm64.dmg', 1)] })];
    expect(selectAvailableUpdate(releases, '0.0.1', '0.2.0', 'darwin', 'arm64')).toBeNull();
  });

  // Skipping one version must not mute every later one.
  it('still reports a version newer than the skipped one', () => {
    const releases = [
      release('v0.2.0', { assets: [asset('JadeAI-0.2.0-mac-arm64.dmg', 1)] }),
      release('v0.3.0', { assets: [asset('JadeAI-0.3.0-mac-arm64.dmg', 1)] }),
    ];
    expect(selectAvailableUpdate(releases, '0.0.1', '0.2.0', 'darwin', 'arm64')?.version).toBe(
      '0.3.0',
    );
  });

  it('returns null for an empty list', () => {
    expect(selectAvailableUpdate([], '0.0.1', null)).toBeNull();
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
