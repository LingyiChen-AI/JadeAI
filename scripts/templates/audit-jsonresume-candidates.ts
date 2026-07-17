import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type Candidate = {
  slug: string;
  packageName: string;
  packageVersion: string;
  preliminaryLicense: string;
};

type RegistryVersion = {
  license?: string;
  dist: { tarball: string; shasum: string };
};

async function audit(candidate: Candidate, directory: string) {
  const encoded = candidate.packageName.replace('/', '%2f');
  const response = await fetch(`https://registry.npmjs.org/${encoded}/${candidate.packageVersion}`);
  if (!response.ok) throw new Error(`${candidate.slug}:registry_${response.status}`);
  const metadata = await response.json() as RegistryVersion;
  const tarballResponse = await fetch(metadata.dist.tarball);
  if (!tarballResponse.ok) throw new Error(`${candidate.slug}:tarball_${tarballResponse.status}`);
  const tarball = Buffer.from(await tarballResponse.arrayBuffer());
  const shasum = createHash('sha1').update(tarball).digest('hex');
  if (shasum !== metadata.dist.shasum) throw new Error(`${candidate.slug}:tarball_hash_mismatch`);
  const tarballPath = path.join(directory, `${candidate.slug}.tgz`);
  await writeFile(tarballPath, tarball);
  const { stdout: listing } = await execFileAsync('tar', ['-tzf', tarballPath], { maxBuffer: 8 * 1024 * 1024 });
  const licensePath = listing.split('\n').find((entry) => /^package\/(?:license|copying)(?:\.(?:md|txt))?$/i.test(entry));
  let licenseText: string | null = null;
  if (licensePath) {
    const extracted = await execFileAsync('tar', ['-xOzf', tarballPath, licensePath], {
      encoding: 'buffer', maxBuffer: 2 * 1024 * 1024,
    });
    licenseText = Buffer.from(extracted.stdout).toString('utf8');
  }
  return {
    slug: candidate.slug,
    packageName: candidate.packageName,
    packageVersion: candidate.packageVersion,
    declaredLicense: metadata.license ?? null,
    expectedLicense: candidate.preliminaryLicense,
    sourceRevision: shasum,
    tarballUrl: metadata.dist.tarball,
    licensePath: licensePath ?? null,
    licenseSha256: licenseText ? createHash('sha256').update(licenseText).digest('hex') : null,
    licenseText,
  };
}

async function main() {
  const candidates = JSON.parse(await readFile(path.resolve('scripts/templates/jsonresume-50-candidates.json'), 'utf8')) as Candidate[];
  const directory = await mkdtemp(path.join(tmpdir(), 'jadeai-jsonresume-audit-'));
  const results = [];
  for (let index = 0; index < candidates.length; index += 8) {
    results.push(...await Promise.all(candidates.slice(index, index + 8).map((candidate) => audit(candidate, directory))));
  }
  const summary = results.map(({ licenseText, ...result }) => {
    void licenseText;
    return result;
  });
  process.stdout.write(`${JSON.stringify({ directory, results: summary }, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
