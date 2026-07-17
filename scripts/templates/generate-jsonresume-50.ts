import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { normalizeManifest } from '../../src/lib/templates/normalize-manifest';
import type { TemplateManifestV2 } from '../../src/types/template';

const execFileAsync = promisify(execFile);
const REVIEWED_AT = '2026-07-17T18:00:00.000Z';

type Candidate = {
  slug: string;
  batch: 'foundation-ats' | 'professional-industry' | 'creative-international';
  packageName: string;
  packageVersion: string;
  sourceUrl: string;
  preliminaryLicense: 'MIT' | 'ISC' | 'BSD-2-Clause' | 'BSD-3-Clause' | 'Apache-2.0';
  selectionReason: string;
};

type RegistryVersion = {
  license?: string;
  gitHead?: string;
  repository?: string | { url?: string };
  dist: { tarball: string; shasum: string };
};

const palettes = [
  ['#111827', '#6b7280', '#2563eb', '#ffffff', '#1e40af', '#eff6ff', '#bfdbfe'],
  ['#172554', '#64748b', '#0f766e', '#ffffff', '#115e59', '#f0fdfa', '#99f6e4'],
  ['#27272a', '#71717a', '#a21caf', '#ffffff', '#86198f', '#fdf4ff', '#f0abfc'],
  ['#292524', '#78716c', '#b45309', '#fffdf8', '#92400e', '#fffbeb', '#fde68a'],
  ['#0f172a', '#64748b', '#be123c', '#ffffff', '#9f1239', '#fff1f2', '#fecdd3'],
  ['#1c1917', '#78716c', '#4d7c0f', '#ffffff', '#3f6212', '#f7fee7', '#d9f99d'],
  ['#18181b', '#71717a', '#0369a1', '#ffffff', '#075985', '#f0f9ff', '#bae6fd'],
  ['#1f2937', '#6b7280', '#7c3aed', '#ffffff', '#6d28d9', '#f5f3ff', '#ddd6fe'],
  ['#1e293b', '#64748b', '#c2410c', '#fffdfa', '#9a3412', '#fff7ed', '#fed7aa'],
  ['#171717', '#737373', '#0f766e', '#fafafa', '#134e4a', '#f0fdfa', '#ccfbf1'],
] as const;

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function title(slug: string) {
  return slug.replace(/^jsonresume-/, '').split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join(' ');
}

function repositoryUrl(value: RegistryVersion['repository']): string | null {
  const raw = typeof value === 'string' ? value : value?.url;
  if (!raw) return null;
  const matched = raw.replace(/^git\+/, '').replace(/\.git$/, '').match(/https?:\/\/github\.com\/([^/]+\/[^/#]+)(?:.*)?$/);
  return matched ? `https://github.com/${matched[1]}` : null;
}

async function githubCommit(repo: string): Promise<string> {
  const response = await fetch(`${repo.replace('https://github.com/', 'https://api.github.com/repos/')}/commits?per_page=1`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`github_commit_${response.status}:${repo}`);
  const commits = await response.json() as Array<{ sha: string }>;
  if (!commits[0]?.sha) throw new Error(`github_commit_missing:${repo}`);
  return commits[0].sha;
}

async function remoteLicense(repo: string, revision: string): Promise<string | null> {
  const base = repo.replace('https://github.com/', 'https://raw.githubusercontent.com/');
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']) {
    const response = await fetch(`${base}/${revision}/${name}`);
    if (response.ok) return response.text();
  }
  return null;
}

function manifest(candidate: Candidate, index: number): TemplateManifestV2 {
  const palette = palettes[index % palettes.length]!;
  const twoColumn = /sidebar|architect|kendall|cora|studio|material|engineering|portfolio|asymmetric/.test(candidate.slug) || index % 4 === 1;
  const sidebar = /sidebar|photo|kendall|cora/.test(candidate.slug);
  const layoutType = sidebar ? 'sidebar' : twoColumn ? 'two-column' : 'single-column';
  const headerVariants = ['plain', 'centered', 'band', 'split', 'editorial'] as const;
  const contactLayouts = ['inline', 'wrapped', 'separated', 'sidebar'] as const;
  const entryVariants = ['stacked', 'compact', 'date-rail', 'timeline', 'two-column-grid'] as const;
  const headingVariants = ['plain', 'underline', 'bordered', 'accent-block', 'small-caps', 'side-rule'] as const;
  const skillVariants = ['text', 'tags', 'compact-grid'] as const;
  const decorations = ['none', 'top-rule', 'side-rule', 'corner-accent', 'grid-lines'] as const;
  const density = candidate.batch === 'foundation-ats' ? 'compact' : candidate.batch === 'creative-international' ? 'comfortable' : 'standard';
  const sidebarPlacement = layoutType === 'single-column' ? 'main' : 'sidebar';
  return normalizeManifest({
    schemaVersion: 2,
    rendererKind: 'declarative-v2',
    layout: { type: layoutType, sidebarPosition: index % 3 === 0 ? 'right' : 'left', sidebarWidthPercent: 26 + (index % 9), columnGapMm: 5 + (index % 6) },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 9.5 + (index % 5) * 0.25, lineHeight: 1.35 + (index % 4) * 0.05, headingScale: 1.15 + (index % 4) * 0.05 },
    colors: { text: palette[0], muted: palette[1], accent: palette[2], background: palette[3] },
    spacing: { pageMarginMm: 10 + (index % 5), sectionGapMm: 3 + (index % 5) },
    sectionSlots: [
      { sectionType: 'personal_info', placement: 'header', order: 0 },
      { sectionType: 'summary', placement: sidebarPlacement, order: 1 },
      { sectionType: 'skills', placement: sidebarPlacement, order: 2 },
      { sectionType: 'languages', placement: sidebarPlacement, order: 3 },
      { sectionType: 'work_experience', placement: 'main', order: 4 },
      { sectionType: 'projects', placement: 'main', order: 5 },
      { sectionType: 'education', placement: 'main', order: 6 },
      { sectionType: 'certifications', placement: 'main', order: 7 },
      { sectionType: 'github', placement: 'main', order: 8 },
      { sectionType: 'custom', placement: 'main', order: 9 },
      { sectionType: 'qr_codes', placement: 'footer', order: 10 },
    ],
    sectionStyles: [
      { sectionType: 'work_experience', element: 'heading', variant: index % 2 ? 'accent' : 'bordered' },
      { sectionType: 'projects', element: 'heading', variant: index % 3 ? 'accent' : 'compact' },
      { sectionType: 'skills', element: 'body', variant: density === 'compact' ? 'compact' : 'default' },
      { sectionType: 'personal_info', element: 'contact', variant: index % 2 ? 'compact' : 'accent' },
    ],
    features: { showAvatar: !/ats|government|a11y|straightforward/.test(candidate.slug), showQrCodes: false, showPageNumbers: index % 7 === 0, maxPages: candidate.batch === 'foundation-ats' ? 3 : 4 },
    header: { variant: headerVariants[index % headerVariants.length], contactLayout: contactLayouts[index % contactLayouts.length] },
    entry: { variant: entryVariants[index % entryVariants.length] },
    section: { headingVariant: headingVariants[index % headingVariants.length] },
    skills: { variant: skillVariants[index % skillVariants.length] },
    decoration: { variant: decorations[index % decorations.length] },
    density,
    palette: { secondary: palette[4], surface: palette[5], border: palette[6] },
    border: { widthPt: 0.5 + (index % 4) * 0.5, radiusMm: index % 4 },
  }) as TemplateManifestV2;
}

async function packageData(candidate: Candidate, temporary: string) {
  const encoded = candidate.packageName.replace('/', '%2f');
  const metadataResponse = await fetch(`https://registry.npmjs.org/${encoded}/${candidate.packageVersion}`);
  if (!metadataResponse.ok) throw new Error(`${candidate.slug}:registry_${metadataResponse.status}`);
  const metadata = await metadataResponse.json() as RegistryVersion;
  if (metadata.license !== candidate.preliminaryLicense) throw new Error(`${candidate.slug}:license_declaration_mismatch`);
  const tarballResponse = await fetch(metadata.dist.tarball);
  if (!tarballResponse.ok) throw new Error(`${candidate.slug}:tarball_${tarballResponse.status}`);
  const tarball = Buffer.from(await tarballResponse.arrayBuffer());
  if (createHash('sha1').update(tarball).digest('hex') !== metadata.dist.shasum) throw new Error(`${candidate.slug}:tarball_hash_mismatch`);
  const tarballPath = path.join(temporary, `${candidate.slug}.tgz`);
  await writeFile(tarballPath, tarball);
  const { stdout: listing } = await execFileAsync('tar', ['-tzf', tarballPath], { maxBuffer: 8 * 1024 * 1024 });
  const licensePath = listing.split('\n').find((entry) => /^package\/(?:license|copying)(?:\.(?:md|txt))?$/i.test(entry));
  let licenseText: string | null = null;
  if (licensePath) {
    const extracted = await execFileAsync('tar', ['-xOzf', tarballPath, licensePath], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
    licenseText = Buffer.from(extracted.stdout).toString('utf8');
  }
  const declaredRepo = repositoryUrl(metadata.repository);
  let repo = declaredRepo ?? 'https://github.com/jsonresume/jsonresume.org';
  let revision = declaredRepo && metadata.gitHead && /^[0-9a-f]{40}$/.test(metadata.gitHead)
    ? metadata.gitHead
    : await githubCommit(repo);
  if (!licenseText) licenseText = await remoteLicense(repo, revision);
  if (!licenseText && repo !== 'https://github.com/jsonresume/jsonresume.org') {
    repo = 'https://github.com/jsonresume/jsonresume.org';
    revision = await githubCommit(repo);
    licenseText = await remoteLicense(repo, revision);
  }
  if (!licenseText) throw new Error(`${candidate.slug}:license_text_missing`);
  return { repo, revision, licenseText };
}

async function main() {
  const root = path.resolve('.');
  const candidates = JSON.parse(await readFile(path.join(root, 'scripts/templates/jsonresume-50-candidates.json'), 'utf8')) as Candidate[];
  const temporary = await mkdtemp(path.join(tmpdir(), 'jadeai-jsonresume-generate-'));
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const audit = await packageData(candidate, temporary);
    const output = path.join(root, 'template-sources/external', candidate.slug);
    await mkdir(output, { recursive: true });
    const generatedManifest = manifest(candidate, index);
    const manifestText = `${JSON.stringify(generatedManifest, null, 2)}\n`;
    const displayName = title(candidate.slug);
    const notes = `Safe declarative V2 port inspired by ${candidate.packageName}@${candidate.packageVersion}. ${candidate.selectionReason}. Upstream code, CSS, fonts, icons, images and dependencies are not copied or executed.`;
    const source = {
      schemaVersion: 1, status: 'approved', slug: candidate.slug, version: '1.0.0',
      nameZh: `JSON Resume ${displayName}`, nameEn: `JSON Resume ${displayName}`,
      category: candidate.batch === 'foundation-ats' ? 'ats' : candidate.batch === 'professional-industry' ? 'engineering' : 'design-creative',
      tags: [generatedManifest.layout.type === 'single-column' ? 'layout-single-column' : generatedManifest.layout.type === 'sidebar' ? 'layout-sidebar' : 'layout-two-column', 'capability-bilingual'],
      aliases: [displayName.toLowerCase(), candidate.packageName],
      source: { kind: 'jsonresume', packageName: candidate.packageName, packageVersion: candidate.packageVersion, url: audit.repo, revision: audit.revision },
      license: { spdx: candidate.preliminaryLicense, path: 'LICENSE', sha256: sha256(audit.licenseText), copyright: `${candidate.packageName} contributors` },
      assets: [], manifestPath: 'manifest.json', manifestSha256: sha256(manifestText),
      conversion: { reviewer: 'JadeAI maintainers', reviewedAt: REVIEWED_AT, notes },
    };
    const conversion = `# ${displayName} conversion\n\n${notes}\n\nThe V2 port uses ${generatedManifest.layout.type}, ${generatedManifest.header.variant} header, ${generatedManifest.entry.variant} entries, ${generatedManifest.section.headingVariant} headings, and ${generatedManifest.decoration.variant} decoration.\n`;
    await Promise.all([
      writeFile(path.join(output, 'source.json'), `${JSON.stringify(source, null, 2)}\n`),
      writeFile(path.join(output, 'manifest.json'), manifestText),
      writeFile(path.join(output, 'LICENSE'), audit.licenseText),
      writeFile(path.join(output, 'conversion.md'), conversion),
    ]);
    process.stdout.write(`${index + 1}/${candidates.length} ${candidate.slug}\n`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
