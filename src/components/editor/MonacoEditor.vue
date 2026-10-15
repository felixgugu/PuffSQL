<template>
  <div
    class="sqlight-editor-shell relative w-full h-full overflow-hidden"
    :class="{ 'sqlight-editor-transparent': isBackgroundImageActive }"
  >
    <!--
      Optional user backdrop. It is pinned to the bottom-right of the visible viewport (outside the
      scrollable content) and sits behind the editor, whose own background turns transparent so the
      artwork shows through without ever scrolling away with the SQL text.
    -->
    <div
      v-if="isBackgroundImageActive"
      class="sqlight-editor-watermark"
      :style="backgroundImageStyle"
      aria-hidden="true"
    />
    <div ref="editorContainer" class="relative z-[1] w-full h-full overflow-hidden" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { monaco } from '@/utils/monaco';
import { setupSqlCompletionProvider } from '@/utils/sqlCompletionProvider';
import { transientHighlightColors } from '@/utils/highlightColor';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { extractStatementAtCursor, type ExtractedStatement } from '@/utils/sqlStatementExtractor';
import { extractTableIdentifierAtCursor, type ExtractedTableIdentifier } from '@/utils/sqlIdentifierExtractor';
import { analyzeSmartPasteContext } from '@/utils/sqlSmartPaste';
import { generateTableSelectSql } from '@/utils/tableSelectSql';
import { dispatchClearGridSelection } from '@/utils/tabulatorGrid';
import { format as formatSql } from 'sql-formatter';
import type { SqlEditorToolbarAction } from '@/types/editor';

const props = defineProps<{
  modelValue: string;
  readOnly?: boolean;
  tabId?: string;
  initialCursor?: { lineNumber: number; column: number };
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'execute', queryToRun: string, mode?: 'current' | 'all'): void;
  (e: 'format'): void;
  (e: 'save'): void;
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const editorContainer = ref<HTMLDivElement | null>(null);
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
let highlightDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let dragOverHandler: ((e: DragEvent) => void) | null = null;
let dropHandler: ((e: DragEvent) => void) | null = null;
let editorMouseDownHandler: ((e: MouseEvent) => void) | null = null;
let triggerSuggestEventListener: (() => void) | null = null;

const SQL_EDITOR_ACTION_COMMANDS: Record<SqlEditorToolbarAction, string> = {
  cut: 'editor.action.clipboardCutAction',
  copy: 'editor.action.clipboardCopyAction',
  paste: 'editor.action.clipboardPasteAction',
  unfoldAll: 'editor.unfoldAll',
  foldAll: 'editor.foldAll',
};

/** The backdrop only renders when a picture was picked and the user kept it switched on. */
const isBackgroundImageActive = computed(
  () => settingsStore.editorBackgroundImageEnabled && Boolean(settingsStore.editorBackgroundImage)
);

/**
 * `background-size: auto N%` scales the picture against the editor height, so the artwork keeps its
 * aspect ratio and stays anchored to the bottom-right corner at any window size.
 */
const backgroundImageStyle = computed<Record<string, string>>(() => ({
  backgroundImage: `url("${settingsStore.editorBackgroundImage}")`,
  opacity: String(settingsStore.editorBackgroundImageOpacity),
  backgroundSize: `auto ${settingsStore.editorBackgroundImageSize}%`,
}));

function updateHighlightStyle() {
  const styleId = 'sqlight-editor-highlight-style';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  const color = settingsStore.editorHighlightColor || '#feffe0';
  const { background: bg, border } = transientHighlightColors(color);
  styleEl.textContent = `
    .sqlight-custom-highlight {
      background-color: ${bg} !important;
      border-left: 2px solid ${border} !important;
    }
  `;
}

// Configurable eye-friendly soft highlight (default #feffe0)
function highlightRange(range: { startLineNumber: number; endLineNumber: number }) {
  if (!editorInstance) return;
  if (highlightDecorations) {
    highlightDecorations.clear();
  }
  updateHighlightStyle();
  const monacoRange = new monaco.Range(range.startLineNumber, 1, range.endLineNumber, 1);
  highlightDecorations = editorInstance.createDecorationsCollection([
    {
      range: monacoRange,
      options: {
        isWholeLine: true,
        className: 'sqlight-custom-highlight',
      },
    },
  ]);
  setTimeout(() => {
    if (highlightDecorations) {
      highlightDecorations.clear();
      highlightDecorations = null;
    }
  }, 400);
}

function getStatementAtCursor(): ExtractedStatement {
  if (!editorInstance) {
    return { sql: props.modelValue, isSelection: false };
  }
  const model = editorInstance.getModel();
  if (!model) {
    return { sql: props.modelValue, isSelection: false };
  }

  const selection = editorInstance.getSelection();
  const position = editorInstance.getPosition() || { lineNumber: 1, column: 1 };
  const docText = model.getValue();

  const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : undefined;

  const extracted = extractStatementAtCursor(
    docText,
    position.lineNumber,
    selectedText
  );

  if (extracted.range) {
    highlightRange(extracted.range);
  }
  return extracted;
}

function getFullDocumentQuery(): string {
  if (!editorInstance) return props.modelValue;
  return editorInstance.getValue();
}

function getExecutableQuery(mode: 'current' | 'all' = 'current'): string {
  if (mode === 'all') {
    return getFullDocumentQuery();
  }
  return getStatementAtCursor().sql;
}

/**
 * 取得選取的 SQL 區塊；若無選取，則預設回傳整頁 SQL (供 AI 助手使用)
 */
function getSelectedOrFullQuery(): { sql: string; isSelection: boolean } {
  if (!editorInstance) {
    return { sql: props.modelValue, isSelection: false };
  }
  const model = editorInstance.getModel();
  if (!model) {
    return { sql: props.modelValue, isSelection: false };
  }
  const selection = editorInstance.getSelection();
  if (selection && !selection.isEmpty()) {
    const selectedText = model.getValueInRange(selection);
    if (selectedText.trim()) {
      return { sql: selectedText, isSelection: true };
    }
  }
  return { sql: model.getValue(), isSelection: false };
}

/**
 * Duplicate line downwards if no selection, or duplicate selected block downwards with blank line separation if selection exists.
 */
function duplicateLineOrSelection() {
  if (!editorInstance) return;
  const model = editorInstance.getModel();
  const selection = editorInstance.getSelection();
  const position = editorInstance.getPosition();
  if (!model || !position) return;

  if (selection && !selection.isEmpty()) {
    // Has selection: duplicate selected block downwards with a blank line separator
    const selectedText = model.getValueInRange(selection);
    const endPos = selection.getEndPosition();

    // Automatically add a blank line above the duplicated content so blocks don't merge together
    const textToInsert = '\n\n' + selectedText;

    editorInstance.executeEdits('duplicate-selection', [
      {
        range: new monaco.Range(endPos.lineNumber, endPos.column, endPos.lineNumber, endPos.column),
        text: textToInsert,
        forceMoveMarkers: true,
      },
    ]);

    // Select the newly duplicated block (offset by the 2 added newlines)
    const lines = selectedText.split(/\r?\n/);
    const addedLines = lines.length - 1;
    const lastLineLength = lines[lines.length - 1]?.length ?? 0;
    const startLine = endPos.lineNumber + 2;
    const startCol = 1;
    const newEndLine = startLine + addedLines;
    const newEndCol = addedLines === 0 ? startCol + lastLineLength : 1 + lastLineLength;

    editorInstance.setSelection(
      new monaco.Selection(startLine, startCol, newEndLine, newEndCol)
    );
  } else {
    // No selection: duplicate cursor line downwards
    const lineNumber = position.lineNumber;
    const lineContent = model.getLineContent(lineNumber);
    const maxCol = model.getLineMaxColumn(lineNumber);

    editorInstance.executeEdits('duplicate-line', [
      {
        range: new monaco.Range(lineNumber, maxCol, lineNumber, maxCol),
        text: '\n' + lineContent,
        forceMoveMarkers: true,
      },
    ]);

    editorInstance.setPosition(new monaco.Position(lineNumber + 1, position.column));
  }
}

/**
 * Format selected SQL only if selection exists, otherwise format only the single statement at cursor.
 */
function formatCode() {
  if (!editorInstance) return;
  const model = editorInstance.getModel();
  if (!model) return;

  const selection = editorInstance.getSelection();
  const position = editorInstance.getPosition() || { lineNumber: 1, column: 1 };
  const docText = model.getValue();

  // 1. If user selected a range: format selection only
  if (selection && !selection.isEmpty()) {
    const rawSql = model.getValueInRange(selection);
    try {
      const formatted = formatSql(rawSql, {
        language: 'tsql',
        keywordCase: 'upper',
        tabWidth: settingsStore.editorTabSize || 2,
      });
      editorInstance.executeEdits('format-selection', [
        {
          range: selection,
          text: formatted,
          forceMoveMarkers: true,
        },
      ]);
      const newLines = formatted.split(/\r?\n/).length;
      highlightRange({
        startLineNumber: selection.startLineNumber,
        endLineNumber: selection.startLineNumber + newLines - 1,
      });
    } catch (err) {
      console.warn('SQL format selection failed:', err);
    }
    return;
  }

  // 2. If no selection: format only current standalone statement at cursor
  const extracted = extractStatementAtCursor(docText, position.lineNumber);
  if (!extracted.sql || !extracted.range) {
    return;
  }

  const { startLineNumber, endLineNumber } = extracted.range;
  const targetRange = new monaco.Range(
    startLineNumber,
    1,
    endLineNumber,
    model.getLineMaxColumn(endLineNumber)
  );
  const targetText = model.getValueInRange(targetRange);

  try {
    const formatted = formatSql(targetText, {
      language: 'tsql',
      keywordCase: 'upper',
      tabWidth: settingsStore.editorTabSize || 2,
    });

    editorInstance.executeEdits('format-statement', [
      {
        range: targetRange,
        text: formatted,
        forceMoveMarkers: true,
      },
    ]);

    const newLines = formatted.split(/\r?\n/).length;
    highlightRange({
      startLineNumber,
      endLineNumber: startLineNumber + newLines - 1,
    });
  } catch (err) {
    console.warn('SQL format statement failed:', err);
  }
}

function runEditorAction(action: SqlEditorToolbarAction) {
  if (!editorInstance || !editorInstance.getModel()) return;

  // Restore text focus so Monaco's clipboard and folding commands target this editor.
  editorInstance.focus();
  editorInstance.trigger('sqlight-toolbar', SQL_EDITOR_ACTION_COMMANDS[action], null);
}

function triggerSuggest() {
  if (!editorInstance) return;
  editorInstance.focus();
  editorInstance.trigger('keyboard', 'editor.action.triggerSuggest', {});
}

onMounted(() => {
  if (!editorContainer.value) return;

  editorInstance = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: 'sql',
    theme: settingsStore.colorMode === 'light' ? 'sqlight-light' : 'sqlight-dark',
    automaticLayout: true,
    fontSize: settingsStore.editorFontSize,
    fontFamily: settingsStore.editorFontFamily,
    fontLigatures: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    tabSize: settingsStore.editorTabSize,
    insertSpaces: true,
    readOnly: props.readOnly ?? false,
    cursorBlinking: 'smooth',
    wordWrap: settingsStore.editorWordWrap ? 'on' : 'off',
    suggestOnTriggerCharacters: settingsStore.editorAutoCompletion,
    quickSuggestions: settingsStore.editorAutoCompletion
      ? {
          other: true,
          comments: false,
          strings: false,
        }
      : false,
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    suggest: {
      showFields: true,
      showClasses: true,
      showFunctions: true,
      showKeywords: true,
      showSnippets: true,
      preview: true,
    },
  });

  setupSqlCompletionProvider();

  // Restore editor view state (scroll position, selections, folding) or initial cursor position
  const savedViewState = props.tabId ? workspaceStore.getEditorViewState(props.tabId) : null;
  if (savedViewState) {
    editorInstance.restoreViewState(savedViewState);
  } else if (props.initialCursor) {
    const pos = new monaco.Position(props.initialCursor.lineNumber, props.initialCursor.column);
    editorInstance.setPosition(pos);
    editorInstance.revealPositionInCenterIfOutsideViewport(pos);
  }

  // Real-time cursor position tracking to sync with workspaceStore
  editorInstance.onDidChangeCursorPosition((e) => {
    if (props.tabId) {
      workspaceStore.updateTabCursorPosition(props.tabId, {
        lineNumber: e.position.lineNumber,
        column: e.position.column,
      });
    }
  });

  editorInstance.onDidChangeModelContent(() => {
    if (editorInstance) {
      const val = editorInstance.getValue();
      if (val !== props.modelValue) {
        emit('update:modelValue', val);
      }
    }
  });

  // Shortcut: Ctrl/Cmd + Enter -> Execute current single statement (or selection)
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    const stmt = getStatementAtCursor();
    if (stmt.sql.trim()) {
      emit('execute', stmt.sql, 'current');
    }
  });

  // Shortcut: Ctrl/Cmd + Shift + Enter -> Execute whole document unconditionally
  editorInstance.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    () => {
      const full = getFullDocumentQuery();
      if (full.trim()) {
        emit('execute', full, 'all');
      }
    }
  );

  // Shortcut: Ctrl/Cmd + D -> Duplicate Line or Selection downwards
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
    duplicateLineOrSelection();
  });

  // Shortcut: Shift + Alt + F -> Format selected SQL or standalone SQL at cursor
  editorInstance.addCommand(
    monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
    () => {
      formatCode();
    }
  );

  // Shortcut: Ctrl/Cmd + S -> Save SQL File
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save');
  });

  // Shortcut: Ctrl/Cmd + N -> Add New Query Tab
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
    window.dispatchEvent(new CustomEvent('sqlight:new-query-tab'));
  });

  // Shortcut: Ctrl/Cmd + I -> Open AI SQL Assistant
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
    const queryInfo = getSelectedOrFullQuery();
    window.dispatchEvent(
      new CustomEvent('sqlight:open-ai-chat', {
        detail: queryInfo,
      })
    );
  });

  // Shortcut: Ctrl/Cmd + P -> Quick Object Finder (Spotlight)
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {
    window.dispatchEvent(new CustomEvent('sqlight:open-quick-finder'));
  });

  // Shortcut: Ctrl/Cmd + Shift + A -> Manually trigger code suggestions / completion
  editorInstance.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA,
    () => {
      triggerSuggest();
    }
  );

  // Disable default Ctrl/Cmd + Space trigger to prevent conflict with IME switching
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {});

  triggerSuggestEventListener = () => {
    if (editorInstance) {
      triggerSuggest();
    }
  };
  window.addEventListener('sqlight:trigger-suggest', triggerSuggestEventListener);

  // Context Menu: 常用 SQL 範本庫 (SQL Templates)
  editorInstance.addAction({
    id: 'sqlight.open-sql-templates',
    label: '常用 SQL 範本庫 (SQL Templates)...',
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 1.5,
    run: () => {
      window.dispatchEvent(new CustomEvent('sqlight:open-sql-templates'));
    },
  });

  // Context Menu: 在物件總管中定位 (Locate in Explorer)
  editorInstance.addAction({
    id: 'sqlight.locate-table-in-explorer',
    label: '在物件總管中定位 (Locate Table in Explorer)',
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 1.6,
    run: () => {
      window.dispatchEvent(new CustomEvent('sqlight:locate-table-at-cursor'));
    },
  });

  // Context Menu: AI SQL 助手 (AI Assistant Ctrl+I)
  editorInstance.addAction({
    id: 'sqlight.open-ai-chat-menu',
    label: '✨ AI SQL 助手 (分析 / 最佳化)...',
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 1.7,
    run: () => {
      const queryInfo = getSelectedOrFullQuery();
      window.dispatchEvent(
        new CustomEvent('sqlight:open-ai-chat', {
          detail: queryInfo,
        })
      );
    },
  });


  // Smart Column Paste: Insert pending column name at cursor position with context awareness
  editorInstance.onMouseUp(() => {
    if (!workspaceStore.pendingColumnToInsert) return;
    const colText = workspaceStore.consumePendingColumnToInsert();
    if (!colText) return;

    setTimeout(() => {
      if (!editorInstance) return;
      const model = editorInstance.getModel();
      if (!model) return;

      const selection = editorInstance.getSelection();
      const position = editorInstance.getPosition();
      if (!position) return;

      const fullSql = model.getValue();
      const cursorOffset = model.getOffsetAt(position);

      const smartResult = analyzeSmartPasteContext(fullSql, cursorOffset, colText);
      const textToInsert = smartResult.textToInsert;

      if (selection && !selection.isEmpty()) {
        editorInstance.executeEdits('smart-paste-column', [
          {
            range: selection,
            text: textToInsert,
            forceMoveMarkers: true,
          },
        ]);
        const endCol = selection.startColumn + textToInsert.length;
        editorInstance.setPosition(new monaco.Position(selection.startLineNumber, endCol));
      } else {
        editorInstance.executeEdits('smart-paste-column', [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            ),
            text: textToInsert,
            forceMoveMarkers: true,
          },
        ]);

        if (
          smartResult.selectPlaceholder &&
          smartResult.placeholderOffset !== undefined &&
          smartResult.placeholderLength !== undefined
        ) {
          // Highlight the '?' placeholder so user can immediately type their value to replace it
          const startCol = position.column + smartResult.placeholderOffset;
          const endCol = startCol + smartResult.placeholderLength;
          editorInstance.setSelection(
            new monaco.Selection(position.lineNumber, startCol, position.lineNumber, endCol)
          );
        } else {
          editorInstance.setPosition(
            new monaco.Position(position.lineNumber, position.column + textToInsert.length)
          );
        }
      }

      editorInstance.focus();
      workspaceStore.showToast(`已智慧貼上欄位：${textToInsert.trim()}`, 'success', 2200);
    }, 15);
  });

  // Clear pending column if user presses Escape
  editorInstance.onKeyDown((e) => {
    if (e.keyCode === monaco.KeyCode.Escape && workspaceStore.pendingColumnToInsert) {
      workspaceStore.clearPendingColumnToInsert();
    }
  });

  // Drag & drop table support from Explorer
  dragOverHandler = (e: DragEvent) => {
    if (props.readOnly) return;
    if (!e.dataTransfer) return;
    const types = e.dataTransfer.types;
    if (!types) return;
    const typeArray = Array.from(types);
    const hasTable =
      typeArray.includes('application/sqlight-table') ||
      (types as any).contains?.('application/sqlight-table') ||
      typeArray.includes('text/plain');

    if (hasTable) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      if (editorInstance) {
        const target = editorInstance.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          editorInstance.setPosition(target.position);
        }
      }
    }
  };

  dropHandler = (e: DragEvent) => {
    if (props.readOnly) return;
    if (!e.dataTransfer) return;
    const types = e.dataTransfer.types;
    if (!types) return;
    const typeArray = Array.from(types);
    const hasTable =
      typeArray.includes('application/sqlight-table') ||
      (types as any).contains?.('application/sqlight-table') ||
      typeArray.includes('text/plain');

    if (!hasTable) return;
    e.preventDefault();
    e.stopPropagation();

    if (!editorInstance) return;

    const raw = e.dataTransfer.getData('application/sqlight-table');
    let sql = '';
    let tableName = '資料表';
    if (raw) {
      try {
        const data = JSON.parse(raw);
        tableName = data.table || tableName;
        if (data.sql) {
          sql = data.sql;
        } else {
          sql = generateTableSelectSql(data.db, data.schema, data.table);
        }
      } catch {
        sql = e.dataTransfer.getData('text/plain') || '';
      }
    } else {
      sql = e.dataTransfer.getData('text/plain') || '';
    }

    if (!sql) return;

    const currentVal = editorInstance.getValue();
    if (!currentVal.trim()) {
      editorInstance.setValue(sql);
      editorInstance.setPosition(new monaco.Position(1, 1));
    } else {
      const target = editorInstance.getTargetAtClientPoint(e.clientX, e.clientY);
      const model = editorInstance.getModel();
      if (target?.position && model) {
        const pos = target.position;
        const lineContent = model.getLineContent(pos.lineNumber);
        const prefix = lineContent.trim() ? (pos.column > 1 ? '\n\n' : '') : '';
        const suffix = lineContent.trim() && pos.column <= lineContent.length ? '\n\n' : (sql.endsWith('\n') ? '' : '\n');
        const textToInsert = prefix + sql + suffix;
        editorInstance.executeEdits('sqlight-table-drop', [
          {
            range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
            text: textToInsert,
            forceMoveMarkers: true,
          },
        ]);
        editorInstance.setPosition(new monaco.Position(pos.lineNumber, pos.column));
      } else if (model) {
        const lineCount = model.getLineCount();
        const maxCol = model.getLineMaxColumn(lineCount);
        const prefix = currentVal.endsWith('\n') ? '\n' : '\n\n';
        editorInstance.executeEdits('sqlight-table-drop', [
          {
            range: new monaco.Range(lineCount, maxCol, lineCount, maxCol),
            text: `${prefix}${sql}`,
            forceMoveMarkers: true,
          },
        ]);
        editorInstance.setPosition(new monaco.Position(model.getLineCount(), 1));
      }
    }

    const updatedVal = editorInstance.getValue();
    emit('update:modelValue', updatedVal);
    editorInstance.focus();
    workspaceStore.showToast(`已插入 ${tableName} SELECT 語法`, 'success', 2000);
  };

  editorContainer.value.addEventListener('dragover', dragOverHandler, true);
  editorContainer.value.addEventListener('drop', dropHandler, true);

  editorMouseDownHandler = () => {
    dispatchClearGridSelection();
  };
  editorContainer.value.addEventListener('mousedown', editorMouseDownHandler, true);

  editorInstance.onMouseDown(() => {
    dispatchClearGridSelection();
  });
  editorInstance.onDidFocusEditorText(() => {
    dispatchClearGridSelection();
  });
  editorInstance.onDidFocusEditorWidget(() => {
    dispatchClearGridSelection();
  });

  if (!props.readOnly) {
    setTimeout(() => {
      if (editorInstance) {
        editorInstance.focus();
        if (!savedViewState && !props.initialCursor) {
          editorInstance.setPosition(new monaco.Position(1, 1));
        }
      }
    }, 50);
  }
});

// Sync editor options when settingsStore changes
watch(
  () => [
    settingsStore.editorFontSize,
    settingsStore.editorFontFamily,
    settingsStore.editorWordWrap,
    settingsStore.editorTabSize,
    settingsStore.editorAutoCompletion,
  ],
  () => {
    if (editorInstance) {
      editorInstance.updateOptions({
        fontSize: settingsStore.editorFontSize,
        fontFamily: settingsStore.editorFontFamily,
        wordWrap: settingsStore.editorWordWrap ? 'on' : 'off',
        tabSize: settingsStore.editorTabSize,
        suggestOnTriggerCharacters: settingsStore.editorAutoCompletion,
        quickSuggestions: settingsStore.editorAutoCompletion
          ? {
              other: true,
              comments: false,
              strings: false,
            }
          : false,
      });
    }
  }
);

watch(
  () => settingsStore.colorMode,
  (mode) => {
    monaco.editor.setTheme(mode === 'light' ? 'sqlight-light' : 'sqlight-dark');
  }
);

watch(
  () => props.modelValue,
  (newVal) => {
    if (editorInstance && editorInstance.getValue() !== newVal) {
      editorInstance.setValue(newVal);
    }
  }
);

function insertTextAtCursor(text: string) {
  if (!editorInstance) return;
  const model = editorInstance.getModel();
  if (!model) return;

  const selection = editorInstance.getSelection();
  const position = editorInstance.getPosition();

  if (selection && !selection.isEmpty()) {
    editorInstance.executeEdits('sql-template-insert', [
      {
        range: selection,
        text: text,
        forceMoveMarkers: true,
      },
    ]);
  } else if (position) {
    editorInstance.executeEdits('sql-template-insert', [
      {
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        text: text,
        forceMoveMarkers: true,
      },
    ]);
  } else {
    const lineCount = model.getLineCount();
    const maxCol = model.getLineMaxColumn(lineCount);
    const prefix = model.getValue().trim() ? '\n\n' : '';
    editorInstance.executeEdits('sql-template-insert', [
      {
        range: new monaco.Range(lineCount, maxCol, lineCount, maxCol),
        text: prefix + text,
        forceMoveMarkers: true,
      },
    ]);
  }

  editorInstance.focus();
}

function getTableNameAtCursor(): ExtractedTableIdentifier | null {
  if (!editorInstance) return null;
  const model = editorInstance.getModel();
  if (!model) return null;

  const selection = editorInstance.getSelection();
  const position = editorInstance.getPosition();
  const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : undefined;
  const lineContent = position ? model.getLineContent(position.lineNumber) : '';
  const cursorCol = position ? position.column : 1;

  return extractTableIdentifierAtCursor(lineContent, cursorCol, selectedText);
}

onBeforeUnmount(() => {
  if (editorContainer.value) {
    if (dragOverHandler && dropHandler) {
      editorContainer.value.removeEventListener('dragover', dragOverHandler, true);
      editorContainer.value.removeEventListener('drop', dropHandler, true);
    }
    if (editorMouseDownHandler) {
      editorContainer.value.removeEventListener('mousedown', editorMouseDownHandler, true);
      editorMouseDownHandler = null;
    }
  }
  if (triggerSuggestEventListener) {
    window.removeEventListener('sqlight:trigger-suggest', triggerSuggestEventListener);
    triggerSuggestEventListener = null;
  }
  if (highlightDecorations) {
    highlightDecorations.clear();
    highlightDecorations = null;
  }
  if (editorInstance) {
    if (props.tabId) {
      const pos = editorInstance.getPosition();
      if (pos) {
        workspaceStore.updateTabCursorPosition(props.tabId, {
          lineNumber: pos.lineNumber,
          column: pos.column,
        });
      }
      const viewState = editorInstance.saveViewState();
      if (viewState) {
        workspaceStore.saveEditorViewState(props.tabId, viewState);
      }
    }
    editorInstance.dispose();
    editorInstance = null;
  }
});

function focus(lineNumber?: number, column?: number) {
  dispatchClearGridSelection();
  if (editorInstance) {
    editorInstance.focus();
    if (lineNumber !== undefined && column !== undefined) {
      const pos = new monaco.Position(lineNumber, column);
      editorInstance.setPosition(pos);
      editorInstance.revealPositionInCenterIfOutsideViewport(pos);
    }
  }
}

defineExpose({
  getExecutableQuery,
  getStatementAtCursor,
  getFullDocumentQuery,
  getSelectedOrFullQuery,
  duplicateLineOrSelection,
  formatCode,
  runEditorAction,
  insertTextAtCursor,
  getTableNameAtCursor,
  triggerSuggest,
  focus,
});
</script>
