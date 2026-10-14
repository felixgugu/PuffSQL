import { createI18n } from 'vue-i18n';
import zhTW from './locales/zh-TW';
import en from './locales/en';
import type { SupportedLocale } from './types';
import { DEFAULT_LOCALE } from './types';

export * from './types';

const messages = {
  'zh-TW': zhTW,
  en,
};

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: 'en',
  messages,
});

/**
 * Switch the application locale. The dictionary is the only thing that carries translations now
 * that no third-party component ships its own locale pack.
 */
export function setAppLocale(locale: SupportedLocale) {
  if (i18n.mode === 'legacy') {
    (i18n.global.locale as unknown as string) = locale;
  } else {
    (i18n.global.locale as any).value = locale;
  }
}

/**
 * Global translation helper for composables or utils outside setup scope.
 */
export function t(key: string, values?: Record<string, any>): string {
  return (i18n.global as any).t(key, values);
}
