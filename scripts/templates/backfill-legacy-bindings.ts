import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import {
  backfillLegacyTemplateBindings,
  asTemplateTransaction,
  type LegacyBackfillReport,
} from '../../src/lib/db/repositories/template.repository';
import { parseTemplateApplyCli } from './seed-catalog';

export function parseBackfillCli(
  args: string[],
  databaseUrl: string,
): { databaseName: string; safeTarget: string; includeResumeIds: boolean } {
  const target = parseTemplateApplyCli(args, databaseUrl, ['--include-resume-ids']);
  return {
    databaseName: target.databaseName,
    safeTarget: target.safeTarget,
    includeResumeIds: target.flags.has('--include-resume-ids'),
  };
}

export function formatBackfillCliReport(
  report: LegacyBackfillReport,
  includeResumeIds: boolean,
): LegacyBackfillReport | { updated: number; unknown: Array<{ template: string; count: number }> } {
  if (includeResumeIds) return report;
  return {
    updated: report.updated,
    unknown: report.unknown.map(({ template, count }) => ({ template, count })),
  };
}

export async function backfillLegacyBindings(databaseUrl: string): Promise<LegacyBackfillReport> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    return await client.begin((tx) => backfillLegacyTemplateBindings(asTemplateTransaction(tx)));
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const target = parseBackfillCli(process.argv.slice(2), databaseUrl);
  console.error(`[template-backfill] applying to ${target.safeTarget}`);
  const report = await backfillLegacyBindings(databaseUrl);
  console.log(JSON.stringify(formatBackfillCliReport(report, target.includeResumeIds)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
