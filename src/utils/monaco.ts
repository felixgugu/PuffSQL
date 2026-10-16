import * as monaco from 'monaco-editor';
import EditorWorker from './editorWorker?worker';
import { buildEditorTheme } from './editorThemeTokens';
import { DEFAULT_SURFACE } from '@/services/themeManager';

self.MonacoEnvironment = {
  getWorker: function (_moduleId: unknown, _label: string) {
    return new EditorWorker();
  },
};

export function ensureSqlightTheme(surfaceName = DEFAULT_SURFACE) {
  const dark = buildEditorTheme(surfaceName, 'dark');
  const light = buildEditorTheme(surfaceName, 'light');

  monaco.editor.defineTheme('sqlight-dark', { inherit: true, ...dark });
  monaco.editor.defineTheme('sqlight-light', { inherit: true, ...light });
}

// Automatically register theme on module load
ensureSqlightTheme();

// Listen for surface changes and update Monaco theme dynamically
if (typeof window !== 'undefined') {
  window.addEventListener('sqlight:surface-changed', (e: any) => {
    const surfaceName = e.detail?.surface || DEFAULT_SURFACE;
    ensureSqlightTheme(surfaceName);
    const isDark = document.documentElement.classList.contains('dark');
    monaco.editor.setTheme(isDark ? 'sqlight-dark' : 'sqlight-light');
  });
}

export { monaco };
