export const config = {
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    providers: ['google'] as const,
  },
  i18n: {
    defaultLocale: 'zh' as const,
    locales: ['zh', 'en'] as const,
  },
};
