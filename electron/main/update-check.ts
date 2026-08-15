/**
 * Update checking against this repo's GitHub releases.
 *
 * Deliberately a *check and notify*, not electron-updater's download-and-apply.
 * Three things block silent installation today, and shipping it half-working
 * would be worse than not shipping it:
 *
 *  1. macOS. Squirrel.Mac verifies that an update's signature matches the
 *     running app's, and an ad-hoc signature has no identity to match. Silent
 *     updates need a Developer ID certificate, which this repo has none of.
 *  2. Release collision. The repo publishes the web app under `v*` tags and the
 *     client under `ds-*`, into the same releases list. electron-updater's
 *     GitHub provider takes whatever release is newest — so a web release would
 *     be offered to the desktop client as its own update. Filtering by the
 *     `ds-v` prefix here is what avoids that; a provider cannot express it.
 *  3. No update metadata. electron-builder only emits latest-mac.yml/latest.yml
 *     when a publish provider is configured, and CI runs with --publish never.
 *
 * So this reads the releases list, finds the newest `ds-v*` above the running
 * version, and points the user at it. Moving to real auto-update later means
 * fixing (1) and (2); this module's version selection stays useful either way.
 */

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface AvailableUpdate {
  version: string;
  tag: string;
  url: string;
}

/** Tag prefix that marks a desktop client release. See the note above. */
export const DESKTOP_TAG_PREFIX = 'ds-v';

/**
 * Parse `ds-v1.2.3` / `ds-v1.2.3-beta.1` into its version, or null.
 *
 * Anything not matching is skipped rather than guessed at: an unparseable tag
 * that compared as "newer" would nag users about a release that does not exist.
 */
export function parseDesktopTag(tag: string): string | null {
  const match = /^ds-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
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
 * Pick the newest desktop release worth telling the user about.
 *
 * Returns null when there is nothing newer, when the newest is the version the
 * user chose to skip, or when the list holds no desktop releases at all.
 */
export function selectAvailableUpdate(
  releases: GitHubRelease[],
  currentVersion: string,
  skippedVersion: string | null,
): AvailableUpdate | null {
  let best: AvailableUpdate | null = null;

  for (const release of releases) {
    // Drafts are invisible to users and prereleases are opt-in; neither should
    // surface in an unsolicited prompt.
    if (release.draft === true || release.prerelease === true) continue;
    const version = parseDesktopTag(release.tag_name);
    if (version === null) continue;
    if (compareVersions(version, currentVersion) <= 0) continue;
    if (best !== null && compareVersions(version, best.version) <= 0) continue;
    best = { version, tag: release.tag_name, url: release.html_url };
  }

  if (best !== null && skippedVersion !== null && compareVersions(best.version, skippedVersion) <= 0) {
    return null;
  }
  return best;
}

/**
 * Buttons on the update prompt, in the order the dialog renders them.
 *
 * Exported and paired with resolveUpdatePromptAction so the labels and the
 * index-to-action mapping cannot drift apart. That drift is the one real risk
 * in this dialog — reordering the labels alone would silently turn "skip this
 * version" into "download" — and it is otherwise unverifiable here, since
 * clicking a native modal needs accessibility permission the test environment
 * does not have.
 */
export const UPDATE_PROMPT_BUTTONS = ['前往下载', '稍后再说', '跳过此版本'] as const;

export type UpdatePromptAction = 'open' | 'dismiss' | 'skip';

export function resolveUpdatePromptAction(response: number): UpdatePromptAction {
  if (response === UPDATE_PROMPT_BUTTONS.indexOf('前往下载')) return 'open';
  if (response === UPDATE_PROMPT_BUTTONS.indexOf('跳过此版本')) return 'skip';
  // Anything else — including the dialog being dismissed by other means — is a
  // decision to do nothing, never an accidental skip.
  return 'dismiss';
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
