export const config = {
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    providers: ['google'] as const,
  },
  runtime: {
    /** True when running inside the Electron desktop shell. */
    desktop: process.env.JADE_RUNTIME === 'desktop',
  },
  db: {
    /**
     * Web deployments may run on PostgreSQL. The desktop client never does —
     * see resolveDatabaseKind, which ignores this entirely rather than trusting
     * an environment it does not control.
     */
    type: (process.env.DB_TYPE || 'sqlite') as 'postgresql' | 'sqlite',
  },
  i18n: {
    defaultLocale: 'zh' as const,
    locales: ['zh', 'en'] as const,
  },
};
