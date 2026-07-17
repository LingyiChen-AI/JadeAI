declare module 'fontkit' {
  interface Glyph { id: number }
  interface FontSubset {
    includeGlyph(glyph: Glyph): void;
    encode(): Uint8Array;
  }
  interface Font {
    glyphForCodePoint(codePoint: number): Glyph;
    hasGlyphForCodePoint(codePoint: number): boolean;
    createSubset(): FontSubset;
  }
  export function openSync(path: string): Font;
  export function create(buffer: Buffer): Font;
}
