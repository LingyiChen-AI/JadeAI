import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import createFontSubset from 'subset-font';

import type { ResolvedExportFont } from './font-registry';

const FONT_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';
const FONT_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.obfuscatedFont';

const GENERATED_DOCX_TEXT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 Present Technologies GPA ★ · — : - % |';

export class DocxFontEmbeddingError extends Error {
  readonly code = 'docx_font_embedding_failed' as const;

  constructor(cause: unknown) {
    super('DOCX font embedding failed', { cause });
    this.name = 'DocxFontEmbeddingError';
  }
}

async function subsetFont(fontPath: string, text: string): Promise<Uint8Array> {
  const source = await readFile(fontPath);
  return new Uint8Array(await createFontSubset(source, `${text}\n${GENERATED_DOCX_TEXT}`, {
    targetFormat: 'sfnt',
    preserveNameIds: [1, 2, 4, 6],
  }));
}

function obfuscateFont(bytes: Uint8Array, uuid: string): Uint8Array {
  const output = bytes.slice();
  const key = Buffer.from(uuid.replaceAll('-', ''), 'hex');
  for (let index = 0; index < Math.min(32, output.length); index += 1) {
    output[index] ^= key[15 - (index % 16)];
  }
  return output;
}

function appendBefore(xml: string, closingTag: string, value: string): string {
  const index = xml.lastIndexOf(closingTag);
  if (index >= 0) return `${xml.slice(0, index)}${value}${xml.slice(index)}`;
  if (xml.endsWith('/>')) return `${xml.slice(0, -2)}>${value}${closingTag}`;
  throw new Error(`docx_font_embedding_invalid_xml:${closingTag}`);
}

export async function embedDocxFonts(
  docx: Buffer,
  font: ResolvedExportFont,
  text: string,
): Promise<Buffer> {
  try {
    const [regular, bold] = await Promise.all([
      subsetFont(font.regularPath, text),
      subsetFont(font.boldPath, text),
    ]);
    const regularKey = randomUUID();
    const boldKey = randomUUID();
    const files = unzipSync(docx);
    const fontTablePath = 'word/fontTable.xml';
    const fontRelsPath = 'word/_rels/fontTable.xml.rels';
    const contentTypesPath = '[Content_Types].xml';
    if (!files[fontTablePath] || !files[fontRelsPath] || !files[contentTypesPath]) {
      throw new Error('docx_font_embedding_missing_part');
    }

    let fontTable = strFromU8(files[fontTablePath]);
    fontTable = appendBefore(fontTable, '</w:fonts>',
      `<w:font w:name="${font.family}">`
        + `<w:embedRegular r:id="rIdJadeFontRegular" w:fontKey="{${regularKey.toUpperCase()}}" w:subsetted="true"/>`
        + `<w:embedBold r:id="rIdJadeFontBold" w:fontKey="{${boldKey.toUpperCase()}}" w:subsetted="true"/>`
        + '</w:font>');

    let relationships = strFromU8(files[fontRelsPath]);
    relationships = appendBefore(relationships, '</Relationships>',
      `<Relationship Id="rIdJadeFontRegular" Type="${FONT_RELATIONSHIP}" Target="fonts/NotoSansSC-Regular.odttf"/>`
        + `<Relationship Id="rIdJadeFontBold" Type="${FONT_RELATIONSHIP}" Target="fonts/NotoSansSC-Bold.odttf"/>`);

    let contentTypes = strFromU8(files[contentTypesPath]);
    if (!contentTypes.includes('Extension="odttf"')) {
      contentTypes = appendBefore(contentTypes, '</Types>',
        `<Default Extension="odttf" ContentType="${FONT_CONTENT_TYPE}"/>`);
    }

    files[fontTablePath] = strToU8(fontTable);
    files[fontRelsPath] = strToU8(relationships);
    files[contentTypesPath] = strToU8(contentTypes);
    files['word/fonts/NotoSansSC-Regular.odttf'] = new Uint8Array(obfuscateFont(regular, regularKey));
    files['word/fonts/NotoSansSC-Bold.odttf'] = new Uint8Array(obfuscateFont(bold, boldKey));
    return Buffer.from(zipSync(files, { level: 6 }));
  } catch (error) {
    if (error instanceof DocxFontEmbeddingError) throw error;
    throw new DocxFontEmbeddingError(error);
  }
}
