/**
 * The one place that answers "does every string the app asks for exist in both dictionaries?".
 *
 * Individual feature tests used to each re-assert that their own new keys were present in zh-TW and
 * en — six copies of the same check, each covering only its own feature. This walks the whole tree
 * instead, so a feature test can go back to testing behaviour.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import zhTW from '../../src/i18n/locales/zh-TW';
import en from '../../src/i18n/locales/en';

export interface MissingTranslation {
  key: string;
  usedIn: string;
}

function leafPaths(dictionary: Record<string, unknown>, prefix = ''): Set<string> {
  const paths = new Set<string>();
  for (const [key, value] of Object.entries(dictionary)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of leafPaths(value as Record<string, unknown>, path)) paths.add(nested);
    } else {
      paths.add(path);
    }
  }
  return paths;
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'primevue') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (entry.endsWith('.vue') || (entry.endsWith('.ts') && !entry.includes('locales'))) {
      files.push(full);
    }
  }
  return files;
}

/** Keys the dictionaries do not define, per locale, with the file that asks for them. */
export function missingTranslations(): Record<'zh-TW' | 'en', MissingTranslation[]> {
  const zhPaths = leafPaths(zhTW as unknown as Record<string, unknown>);
  const enPaths = leafPaths(en as unknown as Record<string, unknown>);
  const missing = { 'zh-TW': [] as MissingTranslation[], en: [] as MissingTranslation[] };
  // `\bt` keeps `split('.')` and friends out of the results; the key check keeps bare words out.
  const usage = /(?:\$t|\bt)\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;

  for (const file of sourceFiles('src')) {
    const code = readFileSync(file, 'utf-8');
    for (const match of code.matchAll(usage)) {
      const key = match[1]!;
      if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(key)) continue;
      const usedIn = file.replace(/\\/g, '/');
      if (!zhPaths.has(key)) missing['zh-TW'].push({ key, usedIn });
      if (!enPaths.has(key)) missing.en.push({ key, usedIn });
    }
  }

  return missing;
}
