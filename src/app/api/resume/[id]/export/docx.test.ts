import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import * as fontkit from 'fontkit';

import { generateDocxBuffer } from './docx';

const resume = {
  title: 'Mixed font resume',
  language: 'zh',
  template: 'classic',
  themeConfig: {
    primaryColor: '#111111', accentColor: '#2563eb', fontFamily: 'Georgia',
    fontSize: 'medium', lineSpacing: 1.5, sectionSpacing: 16,
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
  },
  sections: [
    {
      type: 'personal_info', title: '个人信息', visible: true, sortOrder: 0,
      content: { fullName: '测试 ABC 0123', jobTitle: 'Engineer 工程师', email: '', phone: '', location: '' },
    },
    {
      type: 'summary', title: '简介 Summary', visible: true, sortOrder: 1,
      content: { text: '**加粗 Bold 987**\n\t1. 结果 Result 20%\n\n1. Second list' },
    },
    {
      type: 'work_experience', title: '经历', visible: true, sortOrder: 2,
      content: {
        items: [{
          id: 'work-1', company: 'Company', position: 'Role', startDate: '2024', endDate: '2025',
          current: false, description: '', technologies: [], highlights: ['**Highlight Bold** result'],
        }],
      },
    },
  ],
};

function deobfuscate(bytes: Uint8Array, uuid: string): Buffer {
  const output = Buffer.from(bytes);
  const key = Buffer.from(uuid.replaceAll('-', ''), 'hex');
  for (let index = 0; index < Math.min(32, output.length); index += 1) {
    output[index] ^= key[15 - (index % 16)];
  }
  return output;
}

describe('DOCX font and rich-text export', () => {
  it('uses one embedded Noto family for Chinese, English, and numbers', async () => {
    const buffer = await generateDocxBuffer(resume as never);
    const files = unzipSync(buffer);
    const documentXml = strFromU8(files['word/document.xml']);
    const fontTableXml = strFromU8(files['word/fontTable.xml']);
    const fontFiles = Object.entries(files).filter(([name]) => name.startsWith('word/fonts/'));

    expect(documentXml).not.toContain('Microsoft YaHei');
    expect(documentXml).not.toContain('Georgia');
    expect(documentXml).toMatch(/w:ascii="Noto Sans SC"/);
    expect(documentXml).toMatch(/w:hAnsi="Noto Sans SC"/);
    expect(documentXml).toMatch(/w:eastAsia="Noto Sans SC"/);
    expect(documentXml).toMatch(/w:cs="Noto Sans SC"/);
    expect(fontTableXml).toContain('w:embedRegular');
    expect(fontTableXml).toContain('w:embedBold');
    expect(fontFiles).toHaveLength(2);
    expect(fontFiles.every(([, bytes]) => bytes.byteLength < 2_000_000)).toBe(true);
    expect(documentXml).toContain('w:numPr');
    expect(documentXml).toContain('w:ilvl w:val="1"');
    expect(documentXml).toMatch(/<w:rPr>[^]*?<w:b\/>[^]*?<w:t[^>]*>Highlight Bold<\/w:t>/);
    const numberingIds = [...documentXml.matchAll(/<w:numId w:val="(\d+)"/g)].map((match) => match[1]);
    expect(new Set(numberingIds).size).toBeGreaterThanOrEqual(2);

    const regularKey = fontTableXml.match(/w:embedRegular[^>]+w:fontKey="\{([^}]+)\}"/)?.[1];
    expect(regularKey).toBeTruthy();
    const regularFile = files['word/fonts/NotoSansSC-Regular.odttf'];
    const embeddedFont = fontkit.create(deobfuscate(regularFile, regularKey as string));
    expect(embeddedFont.hasGlyphForCodePoint('A'.codePointAt(0) as number)).toBe(true);
    expect(embeddedFont.hasGlyphForCodePoint('测'.codePointAt(0) as number)).toBe(true);
    expect(embeddedFont.hasGlyphForCodePoint('★'.codePointAt(0) as number)).toBe(true);
    expect(embeddedFont.hasGlyphForCodePoint('|'.codePointAt(0) as number)).toBe(true);
  });
});
