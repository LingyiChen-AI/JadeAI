export const config = {
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    providers: ['google'] as const,
  },
  runtime: {
    /** True when running inside the Electron desktop shell. */
    desktop: process.env.JADE_RUNTIME === 'desktop',
  },
  i18n: {
    defaultLocale: 'zh' as const,
    locales: ['zh', 'en'] as const,
  },
};
