export type DocxExportDecision = {
  mode: 'high-fidelity' | 'generic' | 'unsupported';
  warning: 'high_fidelity_mapper_unavailable' | 'generic_docx_style_fallback' | 'template_docx_unsupported' | null;
};

export function getDocxExportDecision(
  fidelity: 'unsupported' | 'generic' | 'high-fidelity',
  hasHighFidelityMapper: boolean,
): DocxExportDecision {
  if (fidelity === 'unsupported') return { mode: 'unsupported', warning: 'template_docx_unsupported' };
  if (fidelity === 'high-fidelity') {
    return hasHighFidelityMapper
      ? { mode: 'high-fidelity', warning: null }
      : { mode: 'unsupported', warning: 'high_fidelity_mapper_unavailable' };
  }
  return { mode: 'generic', warning: 'generic_docx_style_fallback' };
}
