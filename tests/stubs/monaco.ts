/**
 * Minimal `monaco-editor` stand-in so that `src/utils/sqlCompletionProvider.ts`
 * can be exercised inside the Node test runner. `scripts/test.mjs` aliases
 * `@/utils/monaco` to this module.
 *
 * Enum values mirror the real monaco-editor numeric values so assertions read
 * the same as production behaviour.
 */

export interface CompletionProviderLike {
  triggerCharacters?: string[];
  provideCompletionItems(
    model: unknown,
    position: unknown,
    context?: unknown,
    token?: unknown
  ): unknown;
}

export interface CompletionItemLike {
  label: string;
  kind: number;
  detail?: string;
  insertText: string;
  sortText?: string;
}

const registeredProviders: CompletionProviderLike[] = [];
let lastRegisteredLanguage: string | null = null;

export function getLastCompletionProvider(): CompletionProviderLike | null {
  return registeredProviders[registeredProviders.length - 1] ?? null;
}

export function getLastRegisteredLanguage(): string | null {
  return lastRegisteredLanguage;
}

export function resetMonacoStub(): void {
  registeredProviders.length = 0;
  lastRegisteredLanguage = null;
}

export const monaco = {
  languages: {
    // Values copied from monaco-editor's CompletionItemKind enum.
    CompletionItemKind: {
      Method: 0,
      Function: 1,
      Constructor: 2,
      Field: 3,
      Variable: 4,
      Class: 5,
      Struct: 6,
      Interface: 7,
      Module: 8,
      Property: 9,
      Event: 10,
      Operator: 11,
      Unit: 12,
      Value: 13,
      Constant: 14,
      Enum: 15,
      EnumMember: 16,
      Keyword: 17,
      Text: 18,
      Color: 19,
      File: 20,
      Reference: 21,
      Customcolor: 22,
      Folder: 23,
      TypeParameter: 24,
      User: 25,
      Issue: 26,
      Snippet: 27,
    },
    CompletionItemInsertTextRule: {
      None: 0,
      KeepWhitespace: 1,
      InsertAsSnippet: 4,
    },
    registerCompletionItemProvider(
      languageId: string,
      provider: CompletionProviderLike
    ): { dispose(): void } {
      lastRegisteredLanguage = languageId;
      registeredProviders.push(provider);
      return {
        dispose(): void {
          const index = registeredProviders.indexOf(provider);
          if (index >= 0) {
            registeredProviders.splice(index, 1);
          }
        },
      };
    },
  },
};

export type MonacoStub = typeof monaco;
