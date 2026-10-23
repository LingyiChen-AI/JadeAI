import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePdf } from './generate-pdf';

const mocks = vi.hoisted(() => {
  const page = {
    setViewport: vi.fn(), emulateMediaType: vi.fn(), setContent: vi.fn(),
    waitForFunction: vi.fn(), evaluate: vi.fn(), addStyleTag: vi.fn(), pdf: vi.fn(),
  };
  const kill = vi.fn();
  const browser = { newPage: vi.fn(), close: vi.fn(), process: () => ({ kill }) };
  return { page, browser, kill, launch: vi.fn() };
});

vi.mock('puppeteer-core', () => ({ default: { launch: mocks.launch } }));
vi.mock('fs', () => ({ accessSync: vi.fn() }));

describe('continuous PDF limits and cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.launch.mockResolvedValue(mocks.browser);
    mocks.browser.newPage.mockResolvedValue(mocks.page);
    mocks.browser.close.mockResolvedValue(undefined);
    mocks.page.evaluate.mockResolvedValue({ height: 500.2, width: 793.7 });
    mocks.page.pdf.mockResolvedValue(Buffer.from('%PDF-fixture'));
  });
  afterEach(() => vi.useRealTimers());

  it('uses rounded custom dimensions without A4 format or scaling', async () => {
    await generatePdf('<html/>', { layout: 'continuous' });
    expect(mocks.page.emulateMediaType).toHaveBeenCalledWith('print');
    const options = mocks.page.pdf.mock.calls[0][0];
    expect(options).toMatchObject({ width: '210mm', height: '503px', scale: 1, preferCSSPageSize: true });
    expect(options).not.toHaveProperty('format');
    expect(options).not.toHaveProperty('path');
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it.each([
    { height: 18_001, width: 793.7 },
    { height: 500, width: 900 },
    { height: NaN, width: 793.7 },
  ])('rejects invalid dimensions and closes the browser: %j', async dimensions => {
    mocks.page.evaluate.mockResolvedValue(dimensions);
    await expect(generatePdf('<html/>', { layout: 'continuous' })).rejects.toThrow('Use an A4 layout');
    expect(mocks.page.pdf).not.toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it('releases Chromium after a render failure', async () => {
    mocks.page.setContent.mockRejectedValue(new Error('Resource timeout'));
    await expect(generatePdf('<html/>', { layout: 'continuous' })).rejects.toThrow('Resource timeout');
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it('bounds a stalled render and closes its browser', async () => {
    mocks.page.evaluate.mockReturnValue(new Promise(() => {}));
    const result = expect(generatePdf('<html/>', { layout: 'continuous' })).rejects.toThrow('rendering timed out');
    await vi.advanceTimersByTimeAsync(35_000);
    await result;
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it('disposes of a browser that launches after the deadline', async () => {
    let finishLaunch!: (browser: typeof mocks.browser) => void;
    mocks.launch.mockReturnValue(new Promise(resolve => { finishLaunch = resolve; }));
    const result = expect(generatePdf('<html/>', { layout: 'continuous' })).rejects.toThrow('launch timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(mocks.launch.mock.calls[0][0].signal.aborted).toBe(true);
    finishLaunch(mocks.browser);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.browser.newPage).not.toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it('kills a Chromium process whose close operation hangs', async () => {
    mocks.browser.close.mockReturnValue(new Promise(() => {}));
    const result = generatePdf('<html/>', { layout: 'continuous' });
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(mocks.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it.each(['a4', 'fit-one-page', 'continuous'] as const)('cancels %s rendering and releases its browser', async layout => {
    mocks.page.setContent.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const result = expect(generatePdf('<html/>', { layout, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it('bounds stalled A4 font loading as well as continuous rendering', async () => {
    mocks.page.evaluate.mockReturnValue(new Promise(() => {}));
    const result = expect(generatePdf('<html/>', { layout: 'a4' })).rejects.toThrow('rendering timed out');
    await vi.advanceTimersByTimeAsync(35_000);
    await result;
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  it('cancels Chromium launch promptly and cleans up if launch finishes later', async () => {
    let finishLaunch!: (browser: typeof mocks.browser) => void;
    mocks.launch.mockReturnValue(new Promise(resolve => { finishLaunch = resolve; }));
    const controller = new AbortController();
    const result = expect(generatePdf('<html/>', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await result;
    expect(mocks.launch.mock.calls[0][0].signal.aborted).toBe(true);
    finishLaunch(mocks.browser);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.browser.newPage).not.toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });
});
