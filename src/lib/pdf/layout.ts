export const PDF_LAYOUTS = ['a4', 'fit-one-page', 'continuous'] as const;
export type PdfLayout = (typeof PDF_LAYOUTS)[number];

export class PdfLayoutError extends Error {}

/** Preserve legacy boolean semantics when layout is absent. */
export function parsePdfLayout(params: URLSearchParams): PdfLayout {
  const layouts = params.getAll('layout');
  const legacyValues = params.getAll('fitOnePage');
  if (layouts.length > 1 || legacyValues.length > 1) {
    throw new PdfLayoutError('PDF layout parameters must not be repeated');
  }
  const legacyLayout = params.get('fitOnePage') === 'true' ? 'fit-one-page' : 'a4';
  if (layouts.length === 0) return legacyLayout;

  const layout = layouts[0];
  if (!PDF_LAYOUTS.includes(layout as PdfLayout)) {
    throw new PdfLayoutError('Unsupported PDF layout. Supported: a4, fit-one-page, continuous');
  }
  if (legacyValues.length > 0 && layout !== legacyLayout) {
    throw new PdfLayoutError('Conflicting layout and fitOnePage parameters');
  }
  return layout as PdfLayout;
}
