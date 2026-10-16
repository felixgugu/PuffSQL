import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zhTW from '../src/i18n/locales/zh-TW';
import en from '../src/i18n/locales/en';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

const EDITOR = 'src/components/editor/MonacoEditor.vue';
const COMPOSABLE = 'src/composables/useEditorStatementGuard.ts';
const GUARD = 'src/utils/sqlStatementGuard.ts';
const STYLES = 'src/styles/editorGuard.css';

describe('the statement guard is wired into the one editor the app ships', () => {
  test('the editor reserves the glyph lane and hands it to the guard', () => {
    const source = readSource(EDITOR);

    assert.match(source, /glyphMargin: true/, 'the glyph margin must be on');
    assert.match(
      source,
      /import \{ useEditorStatementGuard/,
      'the editor owns the wiring, the guard owns the behaviour'
    );
    assert.match(
      source,
      /if \(!props\.readOnly\) \{\s*statementGuard = useEditorStatementGuard\(monaco, editorInstance\);/,
      'a read-only editor must not offer the switch'
    );
    assert.match(source, /statementGuard\.dispose\(\)/, 'the guard must be torn down with the editor');
  });

  test('the switch lives in the glyph lane and only ever edits text', () => {
    const source = readSource(COMPOSABLE);

    assert.match(source, /createDecorationsCollection/);
    assert.match(source, /MouseTargetType\.GUTTER_GLYPH_MARGIN/);
    assert.match(source, /glyphMarginClassName/);
    assert.match(source, /glyphMarginHoverMessage/);
    assert.match(source, /analyzeGuardedStatements/);
    assert.match(source, /buildToggleEdits/);
    assert.match(source, /findGuardedStatementAtLine/);
    // One click is one undo step, and the guard must not touch the caret or the executed script.
    assert.match(source, /pushUndoStop\(\)/);
    assert.doesNotMatch(source, /emit\(/, 'the guard never routes execution');
    assert.doesNotMatch(source, /queryService/, 'the guard never talks to the backend');
    assert.doesNotMatch(source, /replace\(/, 'the guard edits through Monaco, never by rewriting text');
  });

  test('the state lives in the text, so nothing else has to remember it', () => {
    const source = readSource(GUARD);

    assert.match(source, /export const STATEMENT_GUARD_MARKER = '-- '/);
    // A statement is disabled exactly when every non-blank line of its range is commented out.
    assert.match(source, /commentedWindows/);
    assert.match(source, /trimToStatementStart/);
  });
});

describe('the glyph reads as a hint until the statement is disabled', () => {
  test('both states are styled from theme tokens, with no added chrome', () => {
    const css = readSource(STYLES);

    assert.match(css, /\.sqlight-stmt-guard \{/);
    assert.match(css, /\.sqlight-stmt-guard-off \{/);
    assert.match(css, /mask-image: url\("data:image\/svg\+xml/, 'the mark is drawn as a mask');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, 'colours come from the theme tokens');
    assert.match(css, /background-color: rgb\(var\(--color-danger\)\)/);
    assert.doesNotMatch(css, /\brounded-(sm|lg|xl|2xl|3xl)\b/);
    assert.doesNotMatch(css, /\bshadow-(2xl|xl|lg|md|sm|xs|inner)\b/);
  });

  test('the stylesheet is loaded with the rest of the shell', () => {
    assert.match(readSource('src/main.ts'), /import '\.\/styles\/editorGuard\.css';/);
  });

  test('the hover explanation exists in both languages', () => {
    assert.equal(typeof zhTW.editor.guardDisableTooltip, 'string');
    assert.equal(typeof zhTW.editor.guardDisabledTooltip, 'string');
    assert.equal(typeof en.editor.guardDisableTooltip, 'string');
    assert.equal(typeof en.editor.guardDisabledTooltip, 'string');
  });
});
