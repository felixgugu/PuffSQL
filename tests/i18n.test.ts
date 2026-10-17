import { test } from 'node:test';
import assert from 'node:assert/strict';
import zhTW from '../src/i18n/locales/zh-TW';
import en from '../src/i18n/locales/en';
import { missingTranslations } from './helpers/i18nKeys';

function getLeafPaths(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, getLeafPaths(value, currentPath));
    } else {
      result[currentPath] = String(value);
    }
  }
  return result;
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{([a-zA-Z0-9_]+)\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)).sort() : [];
}

test('i18n: zh-TW and en dictionary key parity and structure', () => {
  const zhPaths = getLeafPaths(zhTW);
  const enPaths = getLeafPaths(en);

  const zhKeys = Object.keys(zhPaths).sort();
  const enKeys = Object.keys(enPaths).sort();

  const missingInEn = zhKeys.filter((k) => !enPaths[k]);
  const missingInZh = enKeys.filter((k) => !zhPaths[k]);

  assert.deepEqual(
    missingInEn,
    [],
    `Keys present in zh-TW but missing in en: ${missingInEn.join(', ')}`
  );

  assert.deepEqual(
    missingInZh,
    [],
    `Keys present in en but missing in zh-TW: ${missingInZh.join(', ')}`
  );

  assert.equal(zhKeys.length, enKeys.length, 'Key counts must match');
  assert.ok(zhKeys.length > 200, 'Dictionary should have extensive translations');
});

test('i18n: no empty strings or undefined translations', () => {
  const zhPaths = getLeafPaths(zhTW);
  const enPaths = getLeafPaths(en);

  for (const [key, val] of Object.entries(zhPaths)) {
    assert.ok(val.trim().length > 0, `zh-TW key "${key}" has empty value`);
  }

  for (const [key, val] of Object.entries(enPaths)) {
    assert.ok(val.trim().length > 0, `en key "${key}" has empty value`);
  }
});

/** Parity above only compares the dictionaries with each other; this pins them to the app. */
test('i18n: every key the app asks for exists in both dictionaries', () => {
  const missing = missingTranslations();
  const describe = (entries: Array<{ key: string; usedIn: string }>) =>
    entries.map((entry) => `${entry.key} (used in ${entry.usedIn})`).join(', ');

  assert.deepEqual(missing['zh-TW'], [], `missing from zh-TW: ${describe(missing['zh-TW'])}`);
  assert.deepEqual(missing.en, [], `missing from en: ${describe(missing.en)}`);
});

test('i18n: parameter placeholders match between zh-TW and en', () => {
  const zhPaths = getLeafPaths(zhTW);
  const enPaths = getLeafPaths(en);

  for (const [key, zhVal] of Object.entries(zhPaths)) {
    const enVal = enPaths[key];
    if (!enVal) continue;

    const zhParams = extractPlaceholders(zhVal);
    const enParams = extractPlaceholders(enVal);

    assert.deepEqual(
      zhParams,
      enParams,
      `Placeholder mismatch for key "${key}": zh=[${zhParams.join(',')}], en=[${enParams.join(',')}]`
    );
  }
});
