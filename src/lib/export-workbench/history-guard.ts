const SENTINEL_KEY = '__jadeExportWorkbenchGuard';

type GuardHistory = Pick<History, 'state' | 'pushState' | 'back'>;
type GuardPhase = 'inactive' | 'armed' | 'blocked' | 'releasing';

export interface SameUrlHistoryGuard {
  activate(): void;
  handlePopState(event: PopStateEvent): void;
  cancelBlockedNavigation(): void;
  confirmBlockedNavigation(): void;
  deactivate(onReleased?: () => void): void;
}

let nextGuardId = 0;

function stateRecord(state: unknown): Record<string, unknown> {
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
}

export function createSameUrlHistoryGuard(
  history: GuardHistory,
  currentUrl: string,
  onBlocked: () => void,
): SameUrlHistoryGuard {
  const token = `export-workbench:${Date.now()}:${nextGuardId += 1}`;
  let phase: GuardPhase = 'inactive';
  let releaseCallback: (() => void) | undefined;

  const isSentinel = (state: unknown) => stateRecord(state)[SENTINEL_KEY] === token;
  const pushSentinel = () => {
    history.pushState({ ...stateRecord(history.state), [SENTINEL_KEY]: token }, '', currentUrl);
    phase = 'armed';
  };
  const finishRelease = () => {
    phase = 'inactive';
    const callback = releaseCallback;
    releaseCallback = undefined;
    callback?.();
  };

  return {
    activate() {
      if (phase === 'inactive') pushSentinel();
    },
    handlePopState(event) {
      if (phase === 'releasing') {
        finishRelease();
        return;
      }
      if (phase !== 'armed' || isSentinel(event.state)) return;
      phase = 'blocked';
      onBlocked();
    },
    cancelBlockedNavigation() {
      if (phase === 'blocked') pushSentinel();
    },
    confirmBlockedNavigation() {
      if (phase !== 'blocked') return;
      phase = 'inactive';
      history.back();
    },
    deactivate(onReleased) {
      if (phase === 'inactive') {
        onReleased?.();
        return;
      }
      if (phase === 'blocked' || !isSentinel(history.state)) {
        phase = 'inactive';
        onReleased?.();
        return;
      }
      releaseCallback = onReleased;
      phase = 'releasing';
      history.back();
    },
  };
}
