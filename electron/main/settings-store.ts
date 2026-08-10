import { readJsonWithBackup, writeFileDurable, writeFileDurableSync } from './durable-file-write';

export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Below this a window is unusable; the editor needs both panes to fit. */
const MIN_WINDOW_WIDTH = 940;
const MIN_WINDOW_HEIGHT = 600;

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface JadeSettings {
  version: 1;
  locale: Locale;
  window: WindowState;
  lastResumeId: string | null;
}

export const DEFAULT_SETTINGS: JadeSettings = {
  version: 1,
  locale: 'zh',
  window: { width: 1280, height: 860, maximized: false },
  lastResumeId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: unknown, min: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

function optionalCoordinate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

/** Coerce anything read off disk into a usable JadeSettings. Never throws. */
export function normalizeSettings(raw: unknown): JadeSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window } };

  const rawWindow = isRecord(raw.window) ? raw.window : {};
  const locale = LOCALES.includes(raw.locale as Locale)
    ? (raw.locale as Locale)
    : DEFAULT_SETTINGS.locale;

  return {
    version: 1,
    locale,
    window: {
      width: clamp(rawWindow.width, MIN_WINDOW_WIDTH, DEFAULT_SETTINGS.window.width),
      height: clamp(rawWindow.height, MIN_WINDOW_HEIGHT, DEFAULT_SETTINGS.window.height),
      x: optionalCoordinate(rawWindow.x),
      y: optionalCoordinate(rawWindow.y),
      maximized: rawWindow.maximized === true,
    },
    lastResumeId: typeof raw.lastResumeId === 'string' ? raw.lastResumeId : null,
  };
}

export class SettingsStore {
  private settings: JadeSettings;
  private writeChain: Promise<void> = Promise.resolve();
  // flushSync() publishes the final state on the quit path. Any write still
  // queued behind it carries an older snapshot, and durable-file-write's
  // last-rename-wins semantics mean it would roll that final state back.
  private sealed = false;

  constructor(private readonly filePath: string) {
    this.settings = normalizeSettings(readJsonWithBackup<unknown>(filePath, undefined));
  }

  get(): JadeSettings {
    return this.settings;
  }

  /** Merge a shallow patch and persist it. Writes are serialised, not raced. */
  patch(patch: Partial<JadeSettings>): JadeSettings {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    const payload = JSON.stringify(this.settings, null, 2);
    this.writeChain = this.writeChain
      .then(() => {
        // Sealed after flushSync(): this payload is an older snapshot than
        // what's already on disk, so writing it now would roll the quit-time
        // state backward.
        if (this.sealed) return;
        return writeFileDurable(this.filePath, payload);
      })
      .catch((error) => {
        console.error('[settings] durable write failed:', error);
      });
    return this.settings;
  }

  setWindowState(window: WindowState): void {
    this.patch({ window });
  }

  /**
   * Flush synchronously on the quit path, where there is no time to await,
   * and seal the store.
   *
   * This is terminal: it is the only call site (Task 9's `will-quit`
   * handler), and any queued write still in flight carries an older snapshot
   * than what this writes. Sealing drops those queued writes so they can't
   * land after this and roll the final state back — do not call this
   * mid-session and expect subsequent patch()es to keep persisting.
   */
  flushSync(): void {
    this.sealed = true;
    try {
      writeFileDurableSync(this.filePath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('[settings] synchronous flush failed:', error);
    }
  }

  /**
   * Resolve once every queued write has settled.
   *
   * patch() is deliberately fire-and-forget so callers on the UI path never
   * await disk. Tests and deterministic teardown need a way to join, though —
   * without it a write can outlive its test and race the fixture cleanup.
   */
  async whenIdle(): Promise<void> {
    await this.writeChain;
  }
}
