import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory resume that the mocked repository reads/writes.
const projectItem = { id: 'p1', name: 'Demo', description: 'desc', technologies: [], highlights: [] };
let store: any;
let lastWrite: { sectionId: string; data: any } | null;

vi.mock('@/lib/db/repositories/resume.repository', () => ({
  resumeRepository: {
    findById: vi.fn(async () => store),
    updateSection: vi.fn(async (sectionId: string, data: any) => {
      lastWrite = { sectionId, data };
      const s = store.sections.find((x: any) => x.id === sectionId);
      if (s) Object.assign(s, data);
      return s;
    }),
    updateSectionWithRevision: vi.fn(async (_resumeId: string, _revision: number, sectionId: string, data: any) => {
      lastWrite = { sectionId, data };
      const s = store.sections.find((x: any) => x.id === sectionId);
      if (s) Object.assign(s, data);
      return s ? { ...store, revision: store.revision + 1 } : null;
    }),
    createSectionWithRevision: vi.fn(),
    updateSectionsWithRevision: vi.fn(),
  },
}));

import { createExecutableTools } from './tools';

function makeStore() {
  store = {
    id: 'r1',
    revision: 0,
    sections: [
      { id: 'sec-proj', type: 'projects', title: 'Projects', content: { items: [projectItem] } },
      { id: 'sec-skills', type: 'skills', title: 'Skills', content: { categories: [] } },
    ],
  };
  lastWrite = null;
}

function getTools() {
  return createExecutableTools('r1', {} as any);
}

async function runUpdate(input: { sectionId: string; field: string; value: string }) {
  const tools = getTools();
  return (tools.updateSection.execute as any)(input, { toolCallId: 't', messages: [] });
}

describe('updateSection — list field validation (issue #69)', () => {
  beforeEach(makeStore);

  it('accepts a correct JSON array for items and writes an array', async () => {
    const value = JSON.stringify([{ id: 'p2', name: 'New project', description: 'x' }]);
    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value });

    expect(res.success).toBe(true);
    expect(Array.isArray(lastWrite?.data.content.items)).toBe(true);
    expect(lastWrite?.data.content.items[0].name).toBe('New project');
  });

  it('recovers a double-encoded JSON array string into a real array', async () => {
    // AI passed a JSON string that itself contains a JSON-array string (double-encoded).
    const inner = JSON.stringify([{ id: 'p3', name: 'Double', description: 'y' }]);
    const value = JSON.stringify(inner); // double-encoded

    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value });

    expect(res.success).toBe(true);
    expect(Array.isArray(lastWrite?.data.content.items)).toBe(true);
    expect(lastWrite?.data.content.items[0].name).toBe('Double');
  });

  it('rejects a plain text string for items and does NOT write to the DB', async () => {
    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value: 'just some text' });

    expect(res.success).toBe(false);
    expect(lastWrite).toBeNull();
  });

  it('rejects an object value for items and does NOT write to the DB', async () => {
    // Bare object that is not a list and has no items array to unwrap.
    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value: JSON.stringify({ foo: 'bar' }) });

    expect(res.success).toBe(false);
    expect(lastWrite).toBeNull();
  });

  it('unwraps an object that wraps an items array', async () => {
    const value = JSON.stringify({ items: [{ id: 'p4', name: 'Wrapped', description: 'z' }] });
    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value });

    expect(res.success).toBe(true);
    expect(Array.isArray(lastWrite?.data.content.items)).toBe(true);
    expect(lastWrite?.data.content.items[0].name).toBe('Wrapped');
  });

  it('recovers a double-encoded categories string for skills', async () => {
    const inner = JSON.stringify([{ id: 'c1', name: 'Languages', skills: ['Go'] }]);
    const value = JSON.stringify(inner);
    const res = await runUpdate({ sectionId: 'sec-skills', field: 'categories', value });

    expect(res.success).toBe(true);
    expect(Array.isArray(lastWrite?.data.content.categories)).toBe(true);
    expect(lastWrite?.data.content.categories[0].name).toBe('Languages');
  });

  it('coerces an item.highlights written as a string into an array (issue #87)', async () => {
    const value = JSON.stringify([{ id: 'p9', name: 'X', description: 'y', highlights: 'Shipped it' }]);
    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value });

    expect(res.success).toBe(true);
    expect(Array.isArray(lastWrite?.data.content.items[0].highlights)).toBe(true);
    expect(lastWrite?.data.content.items[0].highlights).toEqual(['Shipped it']);
  });

  it('coerces a category.skills written as a string into an array (issue #87)', async () => {
    const value = JSON.stringify([{ id: 'c2', name: 'Langs', skills: 'Go\nRust' }]);
    const res = await runUpdate({ sectionId: 'sec-skills', field: 'categories', value });

    expect(res.success).toBe(true);
    expect(lastWrite?.data.content.categories[0].skills).toEqual(['Go', 'Rust']);
  });

  it('returns a minimal tool result without the updated resume content', async () => {
    const value = JSON.stringify([{ id: 'p2', name: 'New project', description: 'x' }]);
    const res = await runUpdate({ sectionId: 'sec-proj', field: 'items', value });

    expect(res).toEqual({
      success: true,
      sectionId: 'sec-proj',
      sectionType: 'projects',
      field: 'items',
    });
    expect(res).not.toHaveProperty('updatedContent');
  });

  it('restores a persisted Git URL when a model update omits it', async () => {
    store.sections[0].content.items[0].url = 'https://github.com/acme/private.git';
    const value = JSON.stringify([{ id: 'p1', name: '已翻译', description: '说明' }]);

    await runUpdate({ sectionId: 'sec-proj', field: 'items', value });

    expect(lastWrite?.data.content.items[0].url).toBe('https://github.com/acme/private.git');
    expect(lastWrite?.data.content.items[0].name).toBe('已翻译');
  });
});
