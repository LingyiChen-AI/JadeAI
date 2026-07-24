import { describe, expect, it, vi } from 'vitest';
import { createSameUrlHistoryGuard } from './history-guard';

interface Entry {
  state: unknown;
  url: string;
}

function fakeHistory() {
  const entries: Entry[] = [
    { state: { page: 'list' }, url: '/resumes' },
    { state: { page: 'workbench' }, url: '/editor/resume-1/export' },
  ];
  let index = 1;
  let onPopState: ((event: PopStateEvent) => void) | undefined;
  const history = {
    get state() { return entries[index]?.state; },
    pushState(state: unknown, _unused: string, url?: string | URL | null) {
      entries.splice(index + 1);
      entries.push({ state, url: String(url ?? entries[index].url) });
      index += 1;
    },
    back() {
      if (index === 0) return;
      index -= 1;
      onPopState?.({ state: entries[index].state } as PopStateEvent);
    },
  };
  return {
    history,
    entries,
    get index() { return index; },
    listen(listener: (event: PopStateEvent) => void) { onPopState = listener; },
  };
}

describe('same URL history guard', () => {
  it('blocks the first real Back and re-arms one sentinel when the user stays', () => {
    const browser = fakeHistory();
    const blocked = vi.fn();
    const guard = createSameUrlHistoryGuard(browser.history, '/editor/resume-1/export', blocked);
    browser.listen(guard.handlePopState);

    guard.activate();
    expect(browser.entries).toHaveLength(3);
    expect(browser.entries[2].url).toBe('/editor/resume-1/export');

    browser.history.back();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(browser.index).toBe(1);

    guard.cancelBlockedNavigation();
    expect(browser.entries).toHaveLength(3);
    expect(browser.index).toBe(2);
  });

  it('continues to the real previous entry only after confirmation', () => {
    const browser = fakeHistory();
    const guard = createSameUrlHistoryGuard(browser.history, '/editor/resume-1/export', vi.fn());
    browser.listen(guard.handlePopState);
    guard.activate();

    browser.history.back();
    guard.confirmBlockedNavigation();

    expect(browser.index).toBe(0);
    expect(browser.entries[browser.index].url).toBe('/resumes');
  });

  it('removes its same-URL sentinel when protection becomes clean', () => {
    const browser = fakeHistory();
    const released = vi.fn();
    const guard = createSameUrlHistoryGuard(browser.history, '/editor/resume-1/export', vi.fn());
    browser.listen(guard.handlePopState);
    guard.activate();

    guard.deactivate(released);

    expect(released).toHaveBeenCalledTimes(1);
    expect(browser.index).toBe(1);
    expect(browser.entries[browser.index].url).toBe('/editor/resume-1/export');
  });
});
