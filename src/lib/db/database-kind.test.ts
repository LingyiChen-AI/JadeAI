import { describe, expect, it } from 'vitest';
import { rejectsSqliteOnVercel, resolveDatabaseKind } from './database-kind';

const BUILD = { NEXT_PHASE: 'phase-production-build' };
const DESKTOP = { JADE_RUNTIME: 'desktop' };

describe('resolveDatabaseKind', () => {
  it('defaults to sqlite', () => {
    expect(resolveDatabaseKind({})).toBe('sqlite');
  });

  it('honours DB_TYPE for a web deployment', () => {
    expect(resolveDatabaseKind({ DB_TYPE: 'postgresql' })).toBe('postgresql');
    expect(resolveDatabaseKind({ DB_TYPE: 'sqlite' })).toBe('sqlite');
  });

  it('treats an unrecognised DB_TYPE as sqlite rather than failing to start', () => {
    expect(resolveDatabaseKind({ DB_TYPE: 'mysql' })).toBe('sqlite');
    expect(resolveDatabaseKind({ DB_TYPE: '' })).toBe('sqlite');
  });

  // The desktop client's whole promise is that data stays on the machine. A
  // stray DB_TYPE in the inherited environment must not send resumes to a
  // server.
  it('refuses postgresql on the desktop even when DB_TYPE asks for it', () => {
    expect(resolveDatabaseKind({ ...DESKTOP, DB_TYPE: 'postgresql' })).toBe('sqlite');
  });

  // `next build` imports every route module, which constructs the adapter. On
  // PostgreSQL that would open a connection to — and migrate — whatever
  // DATABASE_URL points at, which may well be production.
  it('never selects postgresql during a production build', () => {
    expect(resolveDatabaseKind({ ...BUILD, DB_TYPE: 'postgresql' })).toBe('sqlite');
  });
});

describe('rejectsSqliteOnVercel', () => {
  it('rejects sqlite at runtime on Vercel, where the filesystem is read-only', () => {
    expect(rejectsSqliteOnVercel({ VERCEL: '1' })).toBe(true);
  });

  it('allows a Vercel deployment that uses postgresql', () => {
    expect(rejectsSqliteOnVercel({ VERCEL: '1', DB_TYPE: 'postgresql' })).toBe(false);
  });

  // The guard is about runtime. Builds deliberately use a throwaway SQLite file
  // even for PostgreSQL deployments, so applying it here would fail every
  // Vercel build of a perfectly correct PostgreSQL app.
  it('does not fire during a build, even for a postgresql deployment', () => {
    expect(rejectsSqliteOnVercel({ ...BUILD, VERCEL: '1', DB_TYPE: 'postgresql' })).toBe(false);
    expect(rejectsSqliteOnVercel({ ...BUILD, VERCEL: '1' })).toBe(false);
  });

  it('does not fire off Vercel', () => {
    expect(rejectsSqliteOnVercel({})).toBe(false);
  });
});
