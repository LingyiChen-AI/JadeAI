import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer-core';

const baseUrl = process.env.AI_EDIT_HISTORY_BROWSER_TEST_URL;
const browserTest = describe.skipIf(!baseUrl);
const fingerprint = 'ai-edit-history-browser-test';

interface BrowserResume {
  id: string;
  userId: string;
  revision: number;
  sections: Array<Record<string, unknown> & {
    id: string;
    type: string;
    title: string;
    sortOrder: number;
    visible: boolean;
    content: Record<string, unknown>;
  }>;
}

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'x-fingerprint': fingerprint, ...init.headers },
  });
}

async function clickButton(page: Page, label: string) {
  await page.waitForFunction((text) => [...document.querySelectorAll('button')]
    .some((button) => button.textContent?.includes(text) || button.getAttribute('aria-label') === text), {}, label);
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.includes(text) || candidate.getAttribute('aria-label') === text);
    (button as HTMLButtonElement | undefined)?.click();
  }, label);
}

async function waitForText(page: Page, text: string) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), {}, text);
}

async function waitForServerSummary(resumeId: string, expected: string): Promise<BrowserResume> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await api(`/api/resume/${resumeId}`);
    const current = await response.json() as BrowserResume;
    if (current.sections.find((section) => section.type === 'summary')?.content.text === expected) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server summary did not become: ${expected}`);
}

async function clickDialogButton(page: Page, label: string) {
  await page.waitForFunction((text) => {
    const dialog = document.querySelector('[role="alertdialog"]');
    return [...(dialog?.querySelectorAll('button') ?? [])]
      .some((button) => button.textContent?.includes(text));
  }, {}, label);
  await page.$eval('[role="alertdialog"]', (dialog, text) => {
    const button = [...dialog.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.includes(text as string));
    (button as HTMLButtonElement | undefined)?.click();
  }, label);
}

browserTest('AI edit history browser acceptance', () => {
  let browser: Browser;
  let page: Page;
  let resume: BrowserResume;
  let translatedSections: BrowserResume['sections'];

  beforeAll(async () => {
    const created = await api('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'AI history browser acceptance',
        language: 'zh',
        sections: [{
          type: 'summary',
          title: '个人简介',
          visible: true,
          content: { text: 'Original browser summary' },
        }],
      }),
    });
    expect(created.status).toBe(201);
    resume = await created.json() as BrowserResume;
    translatedSections = resume.sections.map((section) => section.type === 'summary'
      ? { ...section, content: { ...section.content, text: 'AI translated browser summary' } }
      : section);

    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((value) => {
      localStorage.setItem('jade_fingerprint', value);
      localStorage.setItem('jade_tour_editor_completed', '1');
    }, fingerprint);
    await page.setRequestInterception(true);
    page.on('request', (request) => void handleRequest(request));
    await page.goto(`${baseUrl}/zh/editor/${resume.id}`, { waitUntil: 'networkidle2' });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    if (resume?.id) await api(`/api/resume/${resume.id}`, { method: 'DELETE' });
  });

  async function handleRequest(request: HTTPRequest) {
    const url = new URL(request.url());
    if (url.pathname !== '/api/ai/translate' || request.method() !== 'POST') {
      await request.continue();
      return;
    }

    const updated = await api(`/api/resume/${resume.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: resume.revision,
        sections: translatedSections,
      }),
    });
    expect(updated.status).toBe(200);
    resume = await updated.json() as BrowserResume;
    translatedSections = resume.sections;
    const summary = resume.sections.find((section) => section.type === 'summary');
    const body = [
      JSON.stringify({
        type: 'progress', completed: 1, total: 1,
        section: { sectionId: summary?.id, title: summary?.title, content: summary?.content },
      }),
      JSON.stringify({
        type: 'done', failedCount: 0, sections: resume.sections,
        revision: resume.revision, language: 'en',
      }),
    ].join('\n');
    await request.respond({ status: 200, contentType: 'application/x-ndjson', body });
  }

  it('restores AI changes, persists history, handles stale data, and isolates exports', async () => {
    await clickButton(page, '翻译');
    await clickButton(page, '翻译整份简历');
    await waitForText(page, '翻译完成');
    await page.waitForFunction(() => document.body.innerText.includes('AI 已修改 1 处'));

    await clickButton(page, 'AI 历史');
    await waitForText(page, '覆盖翻译');
    await clickButton(page, '后退 AI 修改');
    await waitForText(page, '确定恢复到上一个 AI 修改前');
    await clickDialogButton(page, '后退 AI 修改');
    await page.waitForFunction(() => document.body.innerText.includes('Original browser summary'));

    resume = await waitForServerSummary(resume.id, 'Original browser summary');
    expect(resume.sections.find((section) => section.type === 'summary')?.content.text)
      .toBe('Original browser summary');

    await clickButton(page, '前进 AI 修改');
    await page.waitForFunction(() => document.body.innerText.includes('AI translated browser summary'));
    await page.reload({ waitUntil: 'networkidle2' });
    await clickButton(page, 'AI 历史');
    await waitForText(page, '覆盖翻译');

    const current = await api(`/api/resume/${resume.id}`);
    resume = await current.json() as BrowserResume;
    const externallyChanged = resume.sections.map((section) => section.type === 'summary'
      ? { ...section, content: { ...section.content, text: 'External browser change' } }
      : section);
    const externalSave = await api(`/api/resume/${resume.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: resume.revision, sections: externallyChanged }),
    });
    expect(externalSave.status).toBe(200);
    resume = await externalSave.json() as BrowserResume;

    await page.reload({ waitUntil: 'networkidle2' });
    await clickButton(page, 'AI 历史');
    await waitForText(page, '此历史与服务端最新简历不一致');
    const undoDisabled = await page.$eval('button[aria-label="后退 AI 修改"]', (button) => (
      button as HTMLButtonElement
    ).disabled);
    expect(undoDisabled).toBe(true);

    await clickButton(page, '清除历史');
    await waitForText(page, '确定清除此账号下当前简历的本地 AI 历史');
    await clickDialogButton(page, '清除历史');
    await waitForText(page, '暂无本地 AI 修改历史');

    await page.setViewport({ width: 360, height: 800 });
    await page.reload({ waitUntil: 'networkidle2' });
    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);

    const forbidden = ['AI 已修改', 'content.text', 'AI translated browser summary', 'jadeai-ai-history'];
    for (const format of ['html', 'docx', 'pdf']) {
      const response = await api(`/api/resume/${resume.id}/export?format=${format}`);
      expect(response.status, `${format} export status`).toBe(200);
      const body = Buffer.from(await response.arrayBuffer()).toString('latin1');
      for (const marker of forbidden) expect(body).not.toContain(marker);
    }
  }, 60_000);
});
