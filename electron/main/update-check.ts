/**
 * Update checking against this repo's GitHub releases.
 *
 * The app checks, and downloads the right installer, but does not apply it.
 * Downloading needs nothing special; *installing* silently is what is blocked,
 * for three reasons — and shipping that half-working would be worse than not
 * shipping it:
 *
 *  1. macOS. Squirrel.Mac verifies that an update's signature matches the
 *     running app's, and an ad-hoc signature has no identity to match. Silent
 *     updates need a Developer ID certificate, which this repo has none of.
 *  2. Web-only releases. One repo, one releases list, and most of its history
 *     (`v0.1.0` … `v0.4.1`) predates the client and carries no installers at
 *     all. electron-updater's GitHub provider takes whatever release is newest
 *     and expects metadata to be there; here it would hand the client a release
 *     with nothing to install. Requiring a matching installer asset is what
 *     avoids that, and a provider cannot express it.
 *  3. No update metadata. electron-builder only emits latest-mac.yml/latest.yml
 *     when a publish provider is configured, and CI runs with --publish never.
 *
 * So this reads the releases list, finds the newest version above the running
 * one that ships an installer for this machine, and offers exactly that file —
 * rather than a page with three to choose between — for the user to run. Moving
 * to real auto-update later means fixing (1); this module's selection logic
 * stays useful either way.
 */

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
}

export interface InstallerAsset {
  name: string;
  url: string;
  size: number;
}

export interface AvailableUpdate {
  version: string;
  tag: string;
  url: string;
  /**
   * The installer for this machine. Never null: selectAvailableUpdate skips a
   * release it cannot install from, so an update that exists is always one the
   * user can act on.
   */
  asset: InstallerAsset;
}

/**
 * Suffix identifying the installer built for a given platform and arch.
 *
 * Mirrors the artifactName patterns in config/electron-builder.config.cjs
 * (`JadeAI-${version}-mac-${arch}.dmg`, `JadeAI-${version}-win-${arch}-setup.exe`).
 * Renaming one without the other means this returns null and the app falls back
 * to opening the release page — degraded, not broken.
 */
export function installerSuffix(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'darwin') return `-mac-${arch}.dmg`;
  if (platform === 'win32') return `-win-${arch}-setup.exe`;
  return null;
}

/**
 * Pick the installer matching this machine.
 *
 * Matches on the running process's arch rather than the CPU's: an x64 build
 * running under Rosetta on Apple Silicon reports x64 and is offered the x64
 * build again, which is correct — that is the one it can definitely run.
 */
export function selectInstallerAsset(
  assets: GitHubReleaseAsset[],
  platform: NodeJS.Platform,
  arch: string,
): InstallerAsset | null {
  const suffix = installerSuffix(platform, arch);
  if (suffix === null) return null;
  const match = assets.find((asset) => asset.name.endsWith(suffix));
  if (match === undefined) return null;
  return { name: match.name, url: match.browser_download_url, size: match.size };
}

/**
 * Parse a release tag into its version, or null.
 *
 * Accepts both `v1.2.3` and the legacy `ds-v1.2.3`. The client and the web app
 * used to tag separately, `v*` and `ds-*`, so that one repo could carry two
 * release lines; they now share one tag per version. Old `ds-*` releases stay
 * parseable so a client installed before the change still sees its own history.
 *
 * Anything not matching is skipped rather than guessed at: an unparseable tag
 * that compared as "newer" would nag users about a release that does not exist.
 */
export function parseReleaseTag(tag: string): string | null {
  const match = /^(?:ds-)?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
  return match === null ? null : match[1];
}

function parseParts(version: string): { numbers: number[]; prerelease: string | null } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (match === null) return null;
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

/**
 * Compare two versions: negative if `a` is older, positive if newer, 0 if equal.
 *
 * Only the ordering semver actually needs here: numeric triple first, and a
 * prerelease sorts BELOW the release it leads to (1.2.3-beta < 1.2.3), so a
 * user on 1.2.3 is never offered 1.2.3-beta as an upgrade. Unparseable input
 * sorts as older, which fails toward "do not notify".
 */
export function compareVersions(a: string, b: string): number {
  const left = parseParts(a);
  const right = parseParts(b);
  if (left === null || right === null) return left === null ? (right === null ? 0 : -1) : 1;

  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] - right.numbers[i];
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

/**
 * Pick the newest release worth telling the user about.
 *
 * A release only counts if it actually carries an installer for this platform
 * and arch. That is not a nicety — the repo's release history is mostly web-only
 * (`v0.1.0` … `v0.4.1`, no installers), and a client whose version number is
 * lower than those would otherwise be told to "update" to a release it cannot
 * install anything from. Requiring the asset makes the check ask the only
 * question that matters: is there something here I can actually run?
 *
 * Returns null when there is nothing newer, when the newest is the version the
 * user chose to skip, or when no release carries a usable installer.
 */
export function selectAvailableUpdate(
  releases: GitHubRelease[],
  currentVersion: string,
  skippedVersion: string | null,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): AvailableUpdate | null {
  let best: AvailableUpdate | null = null;

  for (const release of releases) {
    // Drafts are invisible to users and prereleases are opt-in; neither should
    // surface in an unsolicited prompt.
    if (release.draft === true || release.prerelease === true) continue;
    const version = parseReleaseTag(release.tag_name);
    if (version === null) continue;
    if (compareVersions(version, currentVersion) <= 0) continue;
    if (best !== null && compareVersions(version, best.version) <= 0) continue;
    // Web-only releases carry no installer for anyone; a release missing only
    // THIS arch is equally unusable here. Either way, skip rather than offer.
    const asset = selectInstallerAsset(release.assets ?? [], platform, arch);
    if (asset === null) continue;
    best = { version, tag: release.tag_name, url: release.html_url, asset };
  }

  if (best !== null && skippedVersion !== null && compareVersions(best.version, skippedVersion) <= 0) {
    return null;
  }
  return best;
}

export interface UpdateCheckDeps {
  fetch: typeof fetch;
  repository: string;
}

/**
 * Fetch the releases list.
 *
 * Never throws: a failed update check must be invisible. The app's entire value
 * is local, and a GitHub outage — or a machine with no network at all — is not
 * something to interrupt someone's launch over.
 */
export async function fetchDesktopReleases(deps: UpdateCheckDeps): Promise<GitHubRelease[]> {
  try {
    const response = await deps.fetch(
      `https://api.github.com/repos/${deps.repository}/releases?per_page=30`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          // GitHub rejects requests without one.
          'User-Agent': 'JadeAI-Desktop',
        },
      },
    );
    if (!response.ok) return [];
    const body: unknown = await response.json();
    return Array.isArray(body) ? (body as GitHubRelease[]) : [];
  } catch {
    return [];
  }
}
