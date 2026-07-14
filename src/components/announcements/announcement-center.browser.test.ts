import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const baseUrl = process.env.ANNOUNCEMENT_BROWSER_TEST_URL;
const browserTest = describe.skipIf(!baseUrl);

browserTest('AnnouncementCenter browser interactions', () => {
  let browser: Browser;
  let page: Page;
  const readIds: string[] = [];
  const items = [
    { id: 'popup-1', title: 'Portal popup', content: '## Popup markdown', notifyMode: 'popup', createdAt: 2, readAt: null },
    { id: 'silent-1', title: 'Silent notice', content: 'List detail', notifyMode: 'silent', createdAt: 1, readAt: null },
  ];

  beforeAll(async () => {
    browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/announcements' && request.method() === 'GET') {
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(items) });
      } else if (/^\/api\/announcements\/[^/]+\/read$/.test(url.pathname) && request.method() === 'POST') {
        readIds.push(url.pathname.split('/')[3]);
        await request.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      } else {
        await request.continue();
      }
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('jade_tour_dashboard_completed', '1');
      localStorage.setItem('jade_fingerprint', 'announcement-browser-test');
    });
    await page.goto(`${baseUrl}/zh/dashboard`, { waitUntil: 'networkidle2' });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('mounts the popup in body and closes it from the backdrop', async () => {
    await page.waitForFunction(() => document.body.innerText.includes('Portal popup'));
    const portal = await page.evaluate(() => {
      const overlay = [...document.querySelectorAll('div.fixed.inset-0')].find((node) => node.className.includes('z-[100]'));
      const rect = overlay?.getBoundingClientRect();
      return { parent: overlay?.parentElement?.tagName, width: rect?.width, viewportWidth: innerWidth };
    });
    expect(portal).toEqual({ parent: 'BODY', width: portal.viewportWidth, viewportWidth: portal.viewportWidth });

    await page.evaluate(() => {
      const overlay = [...document.querySelectorAll('div.fixed.inset-0')].find((node) => node.className.includes('z-[100]'));
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => !document.body.innerText.includes('Portal popup'));
  });

  it('opens list and detail, then records single and bulk reads', async () => {
    await page.$eval('button[title="Announcements"]', (button) => (button as HTMLButtonElement).click());
    await page.waitForFunction(() => document.body.innerText.includes('Silent notice'));
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Portal popup'));
      button?.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Popup markdown'));
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Mark read'));
      button?.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Silent notice'));
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Mark all read'));
      button?.click();
    });
    await page.waitForFunction(() => !document.body.innerText.includes('Mark all read'));
    expect(readIds).toEqual(expect.arrayContaining(['popup-1', 'silent-1']));
  });
});
