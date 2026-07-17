import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  createFontSubset: vi.fn(),
  unzipSync: vi.fn(),
  zipSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('subset-font', () => ({ default: mocks.createFontSubset }));
vi.mock('fflate', async (importOriginal) => ({
  ...await importOriginal<typeof import('fflate')>(),
  unzipSync: mocks.unzipSync,
  zipSync: mocks.zipSync,
}));

import { DocxFontEmbeddingError, embedDocxFonts } from './docx-fonts';

const font = {
  family: 'Noto Sans SC' as const,
  regularPath: '/fonts/regular.ttf',
  boldPath: '/fonts/bold.ttf',
  word: {
    ascii: 'Noto Sans SC',
    hAnsi: 'Noto Sans SC',
    eastAsia: 'Noto Sans SC',
    cs: 'Noto Sans SC',
  },
};

function validDocxParts() {
  return {
    'word/fontTable.xml': new TextEncoder().encode('<w:fonts></w:fonts>'),
    'word/_rels/fontTable.xml.rels': new TextEncoder().encode('<Relationships></Relationships>'),
    '[Content_Types].xml': new TextEncoder().encode('<Types></Types>'),
  };
}

describe('embedDocxFonts error contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFile.mockResolvedValue(Buffer.from('font'));
    mocks.createFontSubset.mockResolvedValue(Buffer.from('subset'));
    mocks.unzipSync.mockReturnValue(validDocxParts());
    mocks.zipSync.mockReturnValue(new Uint8Array([1, 2, 3]));
  });

  it.each([
    ['font loading', () => mocks.readFile.mockRejectedValueOnce(new Error('private font path'))],
    ['font subsetting', () => mocks.createFontSubset.mockRejectedValueOnce(new Error('font parser details'))],
    ['DOCX injection', () => mocks.unzipSync.mockImplementationOnce(() => { throw new Error('invalid zip bytes'); })],
    ['DOCX repacking', () => mocks.zipSync.mockImplementationOnce(() => { throw new Error('zip implementation details'); })],
  ])('wraps %s failures with a stable error', async (_label, arrange) => {
    arrange();

    const operation = embedDocxFonts(Buffer.from('docx'), font, 'resume text');

    await expect(operation).rejects.toMatchObject({
      name: 'DocxFontEmbeddingError',
      code: 'docx_font_embedding_failed',
      message: 'DOCX font embedding failed',
      cause: expect.any(Error),
    });
    await expect(operation).rejects.toBeInstanceOf(DocxFontEmbeddingError);
  });
});
