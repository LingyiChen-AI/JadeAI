declare module 'subset-font' {
  export default function subsetFont(
    buffer: Buffer,
    text: string,
    options: { targetFormat: 'sfnt'; preserveNameIds?: number[] },
  ): Promise<Buffer>;
}
