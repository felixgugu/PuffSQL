import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './helpers/source';

const EDITOR = 'src/components/editor/MonacoEditor.vue';
const COMPOSABLE = 'src/composables/useEditorStatementGuard.ts';
const STYLES = 'src/styles/editorGuard.css';

describe('the statement guard is wired into the one editor the app ships', () => {
  test('the editor hands its glyph lane to the guard, which only ever edits text', () => {
    const editor = readSource(EDITOR);

    assert.match(editor, /glyphMargin: true/, 'the glyph margin must be on');
    assert.match(
      editor,
      /import \{ useEditorStatementGuard/,
      'the editor owns the wiring, the guard owns the behaviour'
    );
    assert.match(
      editor,
      /if \(!props\.readOnly\) \{\s*statementGuard = useEditorStatementGuard\(monaco, editorInstance\);/,
      'a read-only editor must not offer the switch'
    );
    assert.match(editor, /statementGuard\.dispose\(\)/, 'the guard must be torn down with the editor');

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
});

describe('the glyph reads as a hint until the statement is disabled', () => {
  test('both states are styled from theme tokens, with no added chrome', () => {
    const css = readSource(STYLES);

    assert.match(css, /\.sqlight-stmt-guard \{/);
    assert.match(css, /\.sqlight-stmt-guard-off \{/);
    assert.match(css, /mask-image: url\("data:image\/svg\+xml/, 'the mark is drawn as a mask');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, 'colours come from the theme tokens');
    assert.match(css, /background-color: rgb\(var\(--color-danger\)\)/);
  });

  test('the stylesheet is loaded with the rest of the shell', () => {
    assert.match(readSource('src/main.ts'), /import '\.\/styles\/editorGuard\.css';/);
  });
});
