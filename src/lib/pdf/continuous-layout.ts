export const CONTINUOUS_WIDTH_MM = 210;
export const CONTINUOUS_WIDTH_PX = CONTINUOUS_WIDTH_MM * 96 / 25.4;
// Stay below the conventional PDF 14,400pt page limit, with room for rounding.
export const MAX_CONTINUOUS_HEIGHT_PX = 18_000;
export const CONTINUOUS_RESOURCE_TIMEOUT_MS = 10_000;
export const CONTINUOUS_RENDER_TIMEOUT_MS = 35_000;

/** Keep template typography, backgrounds and internal padding intact. */
export const CONTINUOUS_LAYOUT_CSS = `
  @page { size: auto; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    display: block !important;
    background: white !important;
  }
  .resume-export {
    display: flow-root;
    width: ${CONTINUOUS_WIDTH_MM}mm !important;
    margin: 0 !important;
  }
  .resume-export > div {
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .resume-export, .resume-export * {
    break-before: auto !important;
    break-after: auto !important;
    break-inside: auto !important;
    -webkit-box-decoration-break: slice !important;
    box-decoration-break: slice !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`;
